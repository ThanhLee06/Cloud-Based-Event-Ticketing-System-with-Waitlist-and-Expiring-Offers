
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  EventAvailability,
  QueryEventsDto,
} from './dto/query-events.dto';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

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

    // 4. Lọc sự kiện còn vé
    if (query.availability === EventAvailability.AVAILABLE) {
      conditions.push(Prisma.sql`
        (e.capacity - e.sold_count - e.reserved_count) > 0
      `);
    }

    // 5. Lọc sự kiện hết vé
    if (query.availability === EventAvailability.SOLD_OUT) {
      conditions.push(Prisma.sql`
        (e.capacity - e.sold_count - e.reserved_count) = 0
      `);
    }

    const whereSql = conditions.length
      ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
      : Prisma.empty;

    // 6. Lấy tổng số sự kiện phù hợp
    const counts = await this.prisma.$queryRaw<
      { total: bigint }[]
    >(Prisma.sql`
      SELECT COUNT(*)::bigint AS total
      FROM events e
      ${whereSql}
    `);

    const total = Number(counts[0]?.total ?? 0);

    // 7. Phân trang và sắp xếp
    const rows = await this.prisma.$queryRaw<
      { id: string }[]
    >(Prisma.sql`
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

    // 8. Trả kết quả nếu không tìm thấy sự kiện
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

    // 9. Lấy dữ liệu chi tiết bằng Prisma ORM
    const events = await this.prisma.event.findMany({
      where: {
        id: { in: ids },
      },
    });

    // Giữ thứ tự đã sắp xếp ở SQL
    const eventMap = new Map(
      events.map((event) => [event.id, event]),
    );

    const data = ids
      .map((id) => eventMap.get(id))
      .filter((event) => event !== undefined)
      .map((event) => ({
        ...event,
        availableTickets:
          event.capacity -
          event.soldCount -
          event.reservedCount,
      }));

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
}
