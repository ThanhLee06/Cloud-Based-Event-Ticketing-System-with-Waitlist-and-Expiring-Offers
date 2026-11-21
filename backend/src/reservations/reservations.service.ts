import * as crypto from 'node:crypto';
import {
  BadRequestException, ConflictException, ForbiddenException, GoneException,
  Injectable, NotFoundException,
} from '@nestjs/common';
import { Prisma, ReservationSource, ReservationStatus } from '@prisma/client';
import { DEFAULT_TX_OPTIONS, runWithPgRetry } from '../common/pg-tx.util';
import { PrismaService } from '../prisma/prisma.service';
import { WaitlistService } from '../waitlist/waitlist.service';
import type { CreateReservationDto, ReservationResponse } from './dto/reservations.dto';

const KEY_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;
const TX_OPTIONS = { ...DEFAULT_TX_OPTIONS, maxWait: 10_000, timeout: 20_000 } as const;
const EVENT_SELECT = { id: true, slug: true, title: true, category: true, venue: true, city: true, poster: true, startsAt: true } as const;

@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService, private readonly waitlist: WaitlistService) {}

  async create(userId: string, dto: CreateReservationDto, key: string): Promise<ReservationResponse> {
    this.assertKey(key);
    return this.withIdempotency(userId, key, 'POST:/reservations', dto, async (tx) => {
      const [event] = await tx.$queryRaw<Array<{ id: string; capacity: number; reservedCount: number; soldCount: number; priceVnd: number; salesCloseAt: Date; startsAt: Date }>>`
        SELECT id::text AS id, capacity, reserved_count AS "reservedCount", sold_count AS "soldCount",
          price_vnd AS "priceVnd", sales_close_at AS "salesCloseAt", starts_at AS "startsAt"
        FROM events WHERE id = CAST(${dto.eventId} AS uuid) FOR UPDATE
      `;
      if (!event) throw new NotFoundException('Không tìm thấy sự kiện.');
      const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
      if (event.salesCloseAt <= clock.now || event.startsAt <= clock.now) throw new GoneException('Sự kiện đã đóng bán vé hoặc đã bắt đầu.');
      if (event.soldCount + event.reservedCount >= event.capacity) throw new ConflictException('Sự kiện đã hết vé.');
      const active = await tx.reservation.findFirst({
        where: { eventId: dto.eventId, userId, status: { in: [ReservationStatus.HOLD, ReservationStatus.CONFIRMED] } },
        select: { id: true },
      });
      if (active) throw new ConflictException('Bạn đã có lượt giữ chỗ hoặc vé hợp lệ cho sự kiện này.');
      const reservation = await tx.reservation.create({
        data: { eventId: dto.eventId, userId, source: ReservationSource.DIRECT, status: ReservationStatus.HOLD,
          priceVnd: event.priceVnd, expiresAt: new Date(clock.now.getTime() + 10 * 60_000) },
        include: { event: { select: EVENT_SELECT } },
      });
      await tx.event.update({ where: { id: dto.eventId }, data: { reservedCount: { increment: 1 } } });
      return reservation as unknown as ReservationResponse;
    });
  }

  async getMine(userId: string): Promise<ReservationResponse[]> {
    return this.prisma.reservation.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, include: { event: { select: EVENT_SELECT } },
    }) as unknown as Promise<ReservationResponse[]>;
  }

  async getOne(userId: string, id: string): Promise<ReservationResponse> {
    const item = await this.prisma.reservation.findUnique({ where: { id }, include: { event: { select: EVENT_SELECT } } });
    if (!item) throw new NotFoundException('Không tìm thấy lượt giữ chỗ.');
    if (item.userId !== userId) throw new ForbiddenException('Bạn không có quyền xem lượt giữ chỗ này.');
    return item as unknown as ReservationResponse;
  }

  async confirm(userId: string, id: string, key: string): Promise<ReservationResponse> {
    this.assertKey(key);
    return this.withIdempotency(userId, key, `POST:/reservations/${id}/confirm`, { id }, async (tx) => {
      const initial = await tx.reservation.findUnique({ where: { id }, select: { eventId: true, userId: true } });
      if (!initial) throw new NotFoundException('Không tìm thấy lượt giữ chỗ.');
      if (initial.userId !== userId) throw new ForbiddenException('Bạn không có quyền xác nhận lượt giữ chỗ này.');
      await tx.$queryRaw`SELECT id FROM events WHERE id = CAST(${initial.eventId} AS uuid) FOR UPDATE`;
      const [reservation] = await tx.$queryRaw<Array<{ userId: string; source: string; status: string; expiresAt: Date; priceVnd: number }>>`
        SELECT user_id::text AS "userId", source::text AS source, status::text AS status,
          expires_at AS "expiresAt", price_vnd AS "priceVnd"
        FROM reservations WHERE id = CAST(${id} AS uuid) FOR UPDATE
      `;
      if (!reservation) throw new NotFoundException('Không tìm thấy lượt giữ chỗ.');
      if (reservation.userId !== userId) throw new ForbiddenException('Bạn không có quyền xác nhận lượt giữ chỗ này.');
      if (reservation.source === ReservationSource.WAITLIST_OFFER) throw new ConflictException('Lượt mua từ Waitlist Offer phải được xác nhận qua API Offers.');
      if (reservation.status === ReservationStatus.CONFIRMED) {
        return tx.reservation.findUniqueOrThrow({ where: { id }, include: { event: { select: EVENT_SELECT } } }) as unknown as ReservationResponse;
      }
      if (reservation.status !== ReservationStatus.HOLD) throw new ConflictException('Lượt giữ chỗ không còn ở trạng thái có thể xác nhận.');
      const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
      if (reservation.expiresAt <= clock.now) throw new GoneException('Lượt giữ chỗ đã hết hạn.');
      const ticketCode = `EVT-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
      const receipt = {
        receiptNumber: `RCP-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
        reservationId: id, ticketCode, userId, eventId: initial.eventId,
        amountVnd: reservation.priceVnd, currency: 'VND', paymentMethod: 'SIMULATED',
        paidAt: clock.now.toISOString(),
      };
      const updated = await tx.reservation.update({
        where: { id },
        data: { status: ReservationStatus.CONFIRMED, ticketCode, confirmedAt: clock.now, receiptContent: receipt as Prisma.InputJsonValue },
        include: { event: { select: EVENT_SELECT } },
      });
      await tx.event.update({ where: { id: initial.eventId }, data: { reservedCount: { decrement: 1 }, soldCount: { increment: 1 } } });
      return updated as unknown as ReservationResponse;
    });
  }

  async cancel(userId: string, id: string, key: string): Promise<ReservationResponse> {
    this.assertKey(key);
    return this.withIdempotency(userId, key, `DELETE:/reservations/${id}`, { id }, async (tx) => {
      const initial = await tx.reservation.findUnique({ where: { id }, select: { eventId: true, userId: true, source: true } });
      if (!initial) throw new NotFoundException('Không tìm thấy lượt giữ chỗ.');
      if (initial.userId !== userId) throw new ForbiddenException('Bạn không có quyền hủy lượt giữ chỗ này.');
      if (initial.source === ReservationSource.WAITLIST_OFFER) throw new ConflictException('Lượt giữ chỗ từ Waitlist Offer phải được xử lý qua API Offers.');
      await tx.$queryRaw`SELECT id FROM events WHERE id = CAST(${initial.eventId} AS uuid) FOR UPDATE`;
      const [reservation] = await tx.$queryRaw<Array<{ userId: string; status: string }>>`
        SELECT user_id::text AS "userId", status::text AS status FROM reservations
        WHERE id = CAST(${id} AS uuid) FOR UPDATE
      `;
      if (!reservation) throw new NotFoundException('Không tìm thấy lượt giữ chỗ.');
      if (reservation.userId !== userId) throw new ForbiddenException('Bạn không có quyền hủy lượt giữ chỗ này.');
      if (reservation.status === ReservationStatus.CANCELLED || reservation.status === ReservationStatus.EXPIRED) {
        return tx.reservation.findUniqueOrThrow({ where: { id }, include: { event: { select: EVENT_SELECT } } }) as unknown as ReservationResponse;
      }
      if (reservation.status === ReservationStatus.HOLD) {
        await tx.event.update({ where: { id: initial.eventId }, data: { reservedCount: { decrement: 1 } } });
      } else if (reservation.status === ReservationStatus.CONFIRMED) {
        await tx.event.update({ where: { id: initial.eventId }, data: { soldCount: { decrement: 1 } } });
      }
      const cancelled = await tx.reservation.update({
        where: { id }, data: { status: ReservationStatus.CANCELLED, cancelledAt: new Date() },
        include: { event: { select: EVENT_SELECT } },
      });
      await this.waitlist.promoteNextWaitlist(initial.eventId, tx);
      return cancelled as unknown as ReservationResponse;
    });
  }

  private assertKey(key: string | undefined): asserts key is string {
    if (!key || !KEY_PATTERN.test(key)) throw new BadRequestException('Header Idempotency-Key là bắt buộc, tối đa 80 ký tự và chỉ gồm chữ, số, dấu . _ : -.');
  }

  private async withIdempotency<T>(
    userId: string, key: string, endpoint: string, payload: unknown,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const requestId = `${userId}:${key}`;
    const requestHash = crypto.createHash('sha256').update(JSON.stringify({ endpoint, payload })).digest('hex');
    return runWithPgRetry(() => this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${requestId}, 0))`;
      const previous = await tx.idempotencyRecord.findUnique({ where: { requestId } });
      if (previous) {
        if (previous.endpoint !== endpoint || previous.requestHash !== requestHash) {
          throw new ConflictException('Idempotency-Key đã được sử dụng cho endpoint hoặc payload khác.');
        }
        return previous.responseBody as T;
      }
      const response = await operation(tx);
      await tx.idempotencyRecord.create({
        data: { requestId, userId, endpoint, requestHash,
          responseStatus: endpoint === 'POST:/reservations' ? 201 : 200,
          responseBody: JSON.parse(JSON.stringify(response)) as Prisma.InputJsonValue },
      });
      return response;
    }, TX_OPTIONS), 2);
  }
}
