import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { DEFAULT_TX_OPTIONS } from '../common/pg-tx.util';
import { CreateEventDto } from '../events/dto/create-event.dto';
import { UpdateEventDto } from '../events/dto/update-event.dto';
import { EventSlugService } from '../events/event-slug.service';
import { isEventSlugUniqueViolation } from '../events/slug.util';
import { PrismaService } from '../prisma/prisma.service';
import { WaitlistService } from '../waitlist/waitlist.service';

export interface OrganizerStats {
  totalEvents: number;
  totalSold: number;
  totalReserved: number;
  totalWaiting: number;
  totalOffersActive: number;
}

interface EventAccessRow {
  id: string;
  organizerId: string;
}

interface LockedEventForUpdateRow {
  id: string;
  organizerId: string;
  capacity: number;
  soldCount: number;
  reservedCount: number;
  startsAt: Date;
  salesCloseAt: Date;
}

export interface WaitlistEntryRow {
  id: string;
  eventId: string;
  userId: string;
  sequenceNo: number;
  status: string;
  joinedAt: Date;
  name: string;
  email: string;
}

export interface AttendeeRow {
  ticketCode: string;
  name: string;
  email: string;
  priceVnd: number;
  source: string;
  confirmedAt: Date;
}

@Injectable()
export class OrganizerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly waitlistService: WaitlistService,
    private readonly eventSlugService: EventSlugService
  ) {}

  /**
   * ST-013 (Bước 2) — Tạo sự kiện thật trong PostgreSQL.
   * - organizerId luôn lấy từ JWT (user.id).
   * - Tự sinh slug duy nhất và thử lại khi trùng P2002.
   * - Khởi tạo bắt buộc: soldCount = 0, reservedCount = 0, nextWaitlistSeq = 1.
   */
  async createEvent(user: AuthUser, dto: CreateEventDto) {
    const startsAt = new Date(dto.startsAt);
    const salesCloseAt = new Date(dto.salesCloseAt);

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(salesCloseAt.getTime())) {
      throw new BadRequestException('Thời gian bắt đầu hoặc thời gian đóng bán vé không hợp lệ.');
    }
    if (salesCloseAt.getTime() > startsAt.getTime()) {
      throw new BadRequestException(
        'Thời gian đóng bán vé phải trước hoặc bằng thời gian bắt đầu sự kiện.'
      );
    }

    try {
      return await this.eventSlugService.createWithUniqueSlug(dto.title, (slug) =>
        this.prisma.event.create({
          data: {
            slug,
            title: dto.title,
            category: dto.category,
            description: dto.description,
            venue: dto.venue,
            address: dto.address,
            city: dto.city,
            poster: dto.poster,
            priceVnd: dto.priceVnd,
            startsAt,
            salesCloseAt,
            capacity: dto.capacity,
            soldCount: 0,
            reservedCount: 0,
            nextWaitlistSeq: 1,
            organizerId: user.id,
          },
        })
      );
    } catch (err) {
      if (isEventSlugUniqueViolation(err)) {
        throw err;
      }
      if (
        err instanceof Prisma.PrismaClientValidationError ||
        (err instanceof Prisma.PrismaClientKnownRequestError &&
          (err.code === 'P2000' || err.code === 'P2003'))
      ) {
        throw new BadRequestException('Dữ liệu sự kiện không hợp lệ.');
      }
      throw err;
    }
  }

  /**
   * ST-013 (Bước 3) — Cập nhật một phần sự kiện trong PostgreSQL (atomic bằng FOR UPDATE).
   * - ORGANIZER chỉ được sửa sự kiện của mình; ADMIN được sửa mọi sự kiện.
   * - Khóa dòng sự kiện trong transaction trước khi kiểm tra capacity >= soldCount + reservedCount
   *   và salesCloseAt <= startsAt trên dữ liệu sau khi gộp.
   * - Không bao giờ thay đổi slug, organizerId, soldCount, reservedCount hay nextWaitlistSeq.
   */
  async updateEvent(user: AuthUser, eventId: string, dto: UpdateEventDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<LockedEventForUpdateRow[]>`
          SELECT id, organizer_id AS "organizerId",
                 capacity, sold_count AS "soldCount", reserved_count AS "reservedCount",
                 starts_at AS "startsAt", sales_close_at AS "salesCloseAt"
          FROM events
          WHERE id = ${eventId}::uuid
          FOR UPDATE
        `;
        const existing = rows[0];
        if (!existing) {
          throw new NotFoundException('Không tìm thấy sự kiện.');
        }
        if (user.role !== 'ADMIN' && existing.organizerId !== user.id) {
          throw new ForbiddenException('Bạn không có quyền quản lý sự kiện này.');
        }

        if (dto.capacity !== undefined) {
          const minCapacity = existing.soldCount + existing.reservedCount;
          if (dto.capacity < minCapacity) {
            throw new BadRequestException(
              `Sức chứa mới (${dto.capacity}) không được nhỏ hơn số vé đã bán và đang giữ chỗ (${minCapacity}).`
            );
          }
        }

        const nextStartsAt =
          dto.startsAt !== undefined ? new Date(dto.startsAt) : existing.startsAt;
        const nextSalesCloseAt =
          dto.salesCloseAt !== undefined ? new Date(dto.salesCloseAt) : existing.salesCloseAt;

        if (Number.isNaN(nextStartsAt.getTime()) || Number.isNaN(nextSalesCloseAt.getTime())) {
          throw new BadRequestException('Thời gian bắt đầu hoặc thời gian đóng bán vé không hợp lệ.');
        }
        if (nextSalesCloseAt.getTime() > nextStartsAt.getTime()) {
          throw new BadRequestException(
            'Thời gian đóng bán vé phải trước hoặc bằng thời gian bắt đầu sự kiện.'
          );
        }

        const data: Prisma.EventUpdateInput = {};
        if (dto.title !== undefined) data.title = dto.title;
        if (dto.description !== undefined) data.description = dto.description;
        if (dto.category !== undefined) data.category = dto.category;
        if (dto.venue !== undefined) data.venue = dto.venue;
        if (dto.address !== undefined) data.address = dto.address;
        if (dto.city !== undefined) data.city = dto.city;
        if (dto.poster !== undefined) data.poster = dto.poster;
        if (dto.priceVnd !== undefined) data.priceVnd = dto.priceVnd;
        if (dto.capacity !== undefined) data.capacity = dto.capacity;
        if (dto.startsAt !== undefined) data.startsAt = nextStartsAt;
        if (dto.salesCloseAt !== undefined) data.salesCloseAt = nextSalesCloseAt;

        return tx.event.update({
          where: { id: eventId },
          data,
        });
      }, DEFAULT_TX_OPTIONS);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientValidationError ||
        (err instanceof Prisma.PrismaClientKnownRequestError &&
          (err.code === 'P2000' || err.code === 'P2003'))
      ) {
        throw new BadRequestException('Dữ liệu cập nhật sự kiện không hợp lệ.');
      }
      throw err;
    }
  }

  private async assertEventAccess(user: AuthUser, eventId: string): Promise<EventAccessRow> {
    const rows = await this.prisma.$queryRaw<EventAccessRow[]>`
      SELECT id, organizer_id AS "organizerId"
      FROM events
      WHERE id = ${eventId}::uuid
    `;
    const event = rows[0];
    if (!event) throw new NotFoundException('Không tìm thấy sự kiện.');
    if (user.role !== 'ADMIN' && event.organizerId !== user.id) {
      throw new ForbiddenException('Bạn không có quyền quản lý sự kiện này.');
    }
    return event;
  }

  async getEventWaitlist(user: AuthUser, eventId: string): Promise<WaitlistEntryRow[]> {
    await this.assertEventAccess(user, eventId);
    return this.prisma.$queryRaw<WaitlistEntryRow[]>`
      SELECT w.id, w.event_id AS "eventId", w.user_id AS "userId",
             w.sequence_no AS "sequenceNo", w.status, w.joined_at AS "joinedAt",
             u.name, u.email
      FROM waitlist_entries w
      INNER JOIN users u ON u.id = w.user_id
      WHERE w.event_id = ${eventId}::uuid
      ORDER BY w.sequence_no ASC, w.joined_at ASC, w.id ASC
    `;
  }

  async promoteNextWaitlist(user: AuthUser, eventId: string) {
    await this.assertEventAccess(user, eventId);
    const result = await this.waitlistService.promoteNextWaitlist(eventId);
    if (!result.promoted) {
      if (result.reason === 'EVENT_NOT_FOUND') {
        throw new NotFoundException('Không tìm thấy sự kiện.');
      }
      const isFull = result.reason === 'NO_CAPACITY';
      throw new ConflictException({
        statusCode: 409,
        message: isFull ? 'Sự kiện đã hết chỗ trống.' : 'Không còn người trong hàng chờ.',
        code: isFull ? 'EVENT_FULL' : 'WAITLIST_EMPTY',
      });
    }
    return {
      promoted: true,
      waitlistEntryId: result.waitlistEntryId,
      reservationId: result.reservationId,
      offer: { id: result.offerId, expiresAt: result.expiresAt },
    };
  }

  async getAttendees(user: AuthUser, eventId: string): Promise<AttendeeRow[]> {
    await this.assertEventAccess(user, eventId);
    return this.prisma.$queryRaw<AttendeeRow[]>`
      SELECT r.ticket_code AS "ticketCode", u.name, u.email,
             r.price_vnd AS "priceVnd", r.source, r.confirmed_at AS "confirmedAt"
      FROM reservations r
      INNER JOIN users u ON u.id = r.user_id
      WHERE r.event_id = ${eventId}::uuid AND r.status = 'CONFIRMED'
      ORDER BY r.confirmed_at ASC NULLS LAST, r.id ASC
    `;
  }

  async exportAttendeesCsv(user: AuthUser, eventId: string): Promise<{ csv: string; filename: string }> {
    const attendees = await this.getAttendees(user, eventId);
    const escapeCsv = (value: unknown): string => {
      const text = value instanceof Date ? value.toISOString() : String(value ?? '');
      return `"${text.replace(/"/g, '""')}"`;
    };
    const header = ['ticketCode', 'name', 'email', 'priceVnd', 'source', 'confirmedAt'];
    const lines = [
      header.map(escapeCsv).join(','),
      ...attendees.map((attendee) =>
        [attendee.ticketCode, attendee.name, attendee.email, attendee.priceVnd,
          attendee.source, attendee.confirmedAt].map(escapeCsv).join(',')
      ),
    ];
    return { csv: `\uFEFF${lines.join('\r\n')}`, filename: `attendees-${eventId}.csv` };
  }

  getEvents(user: AuthUser) {
    // ADMIN can inspect all organizers' events. Every ORGANIZER query is scoped in SQL.
    if (user.role === 'ADMIN') {
      return this.prisma.$queryRaw`
        SELECT e.id, e.slug, e.title, e.category, e.description, e.venue, e.address,
               e.city, e.poster, e.price_vnd AS "priceVnd", e.starts_at AS "startsAt",
               e.sales_close_at AS "salesCloseAt", e.capacity,
               e.reserved_count AS "reservedCount", e.sold_count AS "soldCount",
               e.organizer_id AS "organizerId", u.name AS "organizerName",
               e.next_waitlist_seq AS "nextWaitlistSeq", e.featured
        FROM events e
        INNER JOIN users u ON u.id = e.organizer_id
        ORDER BY e.starts_at ASC, e.id ASC
      `;
    }

    return this.prisma.$queryRaw`
      SELECT e.id, e.slug, e.title, e.category, e.description, e.venue, e.address,
             e.city, e.poster, e.price_vnd AS "priceVnd", e.starts_at AS "startsAt",
             e.sales_close_at AS "salesCloseAt", e.capacity,
             e.reserved_count AS "reservedCount", e.sold_count AS "soldCount",
             e.organizer_id AS "organizerId", u.name AS "organizerName",
             e.next_waitlist_seq AS "nextWaitlistSeq", e.featured
      FROM events e
      INNER JOIN users u ON u.id = e.organizer_id
      WHERE e.organizer_id = ${user.id}::uuid
      ORDER BY e.starts_at ASC, e.id ASC
    `;
  }

  async getStats(user: AuthUser): Promise<OrganizerStats> {
    const rows = user.role === 'ADMIN'
      ? await this.prisma.$queryRaw<OrganizerStats[]>`
          WITH scoped_events AS (
            SELECT id, sold_count, reserved_count FROM events
          )
          SELECT
            (SELECT COUNT(*)::int FROM scoped_events) AS "totalEvents",
            (SELECT COALESCE(SUM(sold_count), 0)::int FROM scoped_events) AS "totalSold",
            (SELECT COALESCE(SUM(reserved_count), 0)::int FROM scoped_events) AS "totalReserved",
            (SELECT COUNT(*)::int FROM waitlist_entries w
             INNER JOIN scoped_events e ON e.id = w.event_id WHERE w.status = 'WAITING') AS "totalWaiting",
            (SELECT COUNT(*)::int FROM offers o
             INNER JOIN scoped_events e ON e.id = o.event_id
             WHERE o.status = 'PENDING' AND o.expires_at > CURRENT_TIMESTAMP) AS "totalOffersActive"
        `
      : await this.prisma.$queryRaw<OrganizerStats[]>`
          WITH scoped_events AS (
            SELECT id, sold_count, reserved_count FROM events
            WHERE organizer_id = ${user.id}::uuid
          )
          SELECT
            (SELECT COUNT(*)::int FROM scoped_events) AS "totalEvents",
            (SELECT COALESCE(SUM(sold_count), 0)::int FROM scoped_events) AS "totalSold",
            (SELECT COALESCE(SUM(reserved_count), 0)::int FROM scoped_events) AS "totalReserved",
            (SELECT COUNT(*)::int FROM waitlist_entries w
             INNER JOIN scoped_events e ON e.id = w.event_id WHERE w.status = 'WAITING') AS "totalWaiting",
            (SELECT COUNT(*)::int FROM offers o
             INNER JOIN scoped_events e ON e.id = o.event_id
             WHERE o.status = 'PENDING' AND o.expires_at > CURRENT_TIMESTAMP) AS "totalOffersActive"
        `;

    return rows[0] ?? {
      totalEvents: 0,
      totalSold: 0,
      totalReserved: 0,
      totalWaiting: 0,
      totalOffersActive: 0,
    };
  }
}
