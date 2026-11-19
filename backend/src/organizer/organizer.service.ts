import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
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
    private readonly waitlistService: WaitlistService
  ) {}

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
