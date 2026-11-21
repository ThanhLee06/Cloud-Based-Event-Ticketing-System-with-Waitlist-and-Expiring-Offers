import { Injectable, NotFoundException } from "@nestjs/common";
import {
  OfferStatus,
  Prisma,
  ReservationStatus,
  WaitlistStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EventAvailability, QueryEventsDto } from "./dto/query-events.dto";

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // ST-009: Danh sách, tìm kiếm và lọc sự kiện
  // ==========================================
  async findAll(query: QueryEventsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const offset = (page - 1) * limit;

    const conditions: Prisma.Sql[] = [];

    // 1. Tìm kiếm theo từ khóa
    if (query.q?.trim()) {
      const keyword = `%${query.q.trim()}%`;

      conditions.push(Prisma.sql`
        (
          e.title ILIKE ${keyword}
          OR e.venue ILIKE ${keyword}
          OR e.city ILIKE ${keyword}
        )
      `);
    }

    // 2. Lọc theo thành phố
    if (query.city?.trim()) {
      conditions.push(Prisma.sql`
        LOWER(e.city) = LOWER(${query.city.trim()})
      `);
    }

    // 3. Lọc theo danh mục
    if (query.category?.trim()) {
      conditions.push(Prisma.sql`
        LOWER(e.category) = LOWER(${query.category.trim()})
      `);
    }

    // 4. Lọc các sự kiện còn vé
    if (query.availability === EventAvailability.AVAILABLE) {
      conditions.push(Prisma.sql`
        (e.capacity - e.sold_count - e.reserved_count) > 0
      `);
    }

    // 5. Lọc các sự kiện hết vé
    if (query.availability === EventAvailability.SOLD_OUT) {
      conditions.push(Prisma.sql`
        (e.capacity - e.sold_count - e.reserved_count) = 0
      `);
    }

    // 6. Ghép điều kiện WHERE
    const whereSql = conditions.length
      ? Prisma.sql`
          WHERE ${Prisma.join(conditions, " AND ")}
        `
      : Prisma.empty;

    // 7. Đếm tổng số sự kiện phù hợp
    const counts = await this.prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total
      FROM events e
      ${whereSql}
    `);

    const total = Number(counts[0]?.total ?? 0);

    // 8. Lấy ID theo thứ tự và phân trang
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT e.id
      FROM events e
      ${whereSql}
      ORDER BY
        e.featured DESC,
        e.starts_at ASC,
        e.id ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    const ids = rows.map((row) => row.id);

    // 9. Nếu không có kết quả
    if (ids.length === 0) {
      return {
        data: [],
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    // 10. Lấy dữ liệu chi tiết từ PostgreSQL
    const events = await this.prisma.event.findMany({
      where: {
        id: {
          in: ids,
        },
      },
    });

    // 11. Giữ thứ tự của truy vấn SQL
    const eventMap = new Map(events.map((event) => [event.id, event]));

    const data = ids
      .map((id) => eventMap.get(id))
      .filter((event) => event !== undefined)
      .map((event) => ({
        ...event,
        availableTickets:
          event.capacity - event.soldCount - event.reservedCount,
      }));

    // 12. Trả danh sách và thông tin phân trang
    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ==========================================
  // ST-010: Xem chi tiết sự kiện theo slug
  // ==========================================
  async findOneBySlug(slug: string, userId?: string | null) {
    const event = await this.prisma.event.findUnique({
      where: {
        slug,
      },
      include: {
        organizer: {
          select: {
            name: true,
          },
        },
      },
    });

    // Không tìm thấy sự kiện -> HTTP 404
    if (!event) {
      throw new NotFoundException("Không tìm thấy sự kiện.");
    }

    const { organizer, ...eventData } = event;
    const userContext = userId
      ? await this.buildUserContext(event.id, userId)
      : null;

    // Trả chi tiết sự kiện
    return {
      ...eventData,
      organizerName: organizer.name,
      availableTickets: event.capacity - event.soldCount - event.reservedCount,
      userContext,
    };
  }

  private async buildUserContext(eventId: string, userId: string) {
    const [activeReservation, activeOffer, activeWaitlistEntry] =
      await Promise.all([
        this.prisma.reservation.findFirst({
          where: {
            eventId,
            userId,
            status: {
              in: [ReservationStatus.HOLD, ReservationStatus.CONFIRMED],
            },
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            source: true,
            status: true,
            priceVnd: true,
            expiresAt: true,
            ticketCode: true,
            confirmedAt: true,
            createdAt: true,
          },
        }),
        this.prisma.offer.findFirst({
          where: {
            eventId,
            userId,
            status: OfferStatus.PENDING,
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            reservationId: true,
            waitlistEntryId: true,
            status: true,
            expiresAt: true,
            createdAt: true,
          },
        }),
        this.prisma.waitlistEntry.findFirst({
          where: {
            eventId,
            userId,
            status: WaitlistStatus.WAITING,
          },
          orderBy: { sequenceNo: "asc" },
          select: {
            id: true,
            sequenceNo: true,
            status: true,
            joinedAt: true,
          },
        }),
      ]);

    let activeWaitlist: {
      id: string;
      sequenceNo: number;
      status: WaitlistStatus;
      joinedAt: Date;
      currentRank: number;
    } | null = null;

    if (activeWaitlistEntry) {
      const aheadCount = await this.prisma.waitlistEntry.count({
        where: {
          eventId,
          status: WaitlistStatus.WAITING,
          sequenceNo: { lt: activeWaitlistEntry.sequenceNo },
        },
      });
      activeWaitlist = {
        ...activeWaitlistEntry,
        currentRank: 1 + aheadCount,
      };
    }

    return {
      activeReservation,
      activeOffer,
      activeWaitlist,
    };
  }
}
