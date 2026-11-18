import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, ReservationStatus, WaitlistStatus } from '@prisma/client';
import { DEFAULT_TX_OPTIONS, isTransientPgConflict, runWithPgRetry } from '../common/pg-tx.util';
import { PrismaService } from '../prisma/prisma.service';
import type { JoinWaitlistResponse } from './dto/join-waitlist.dto';

interface LockedEventRow {
  id: string;
  capacity: number;
  reservedCount: number;
  soldCount: number;
  nextWaitlistSeq: number;
  priceVnd: number;
}

// Tăng trần chờ cho burst đồng thời lớn trên hàng chờ sự kiện.
const WAITLIST_TX_OPTIONS = {
  ...DEFAULT_TX_OPTIONS,
  maxWait: 10_000,
  timeout: 15_000,
} as const;

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);
  constructor(private readonly prisma: PrismaService) {}

  async joinWaitlist(userId: string, eventId: string): Promise<JoinWaitlistResponse> {
    return runWithPgRetry(() => this.runJoinTransaction(userId, eventId), 2, (err) => this.mapError(err, eventId));
  }

  private async runJoinTransaction(userId: string, eventId: string): Promise<JoinWaitlistResponse> {
    return this.prisma.$transaction(async (tx) => {
      const [event] = await tx.$queryRaw<LockedEventRow[]>`
        SELECT "id"::text AS "id", "capacity", "reserved_count" AS "reservedCount",
               "sold_count" AS "soldCount", "next_waitlist_seq" AS "nextWaitlistSeq", "price_vnd" AS "priceVnd"
        FROM "events" WHERE "id" = CAST(${eventId} AS uuid) FOR UPDATE
      `;
      if (!event) throw new NotFoundException('Không tìm thấy sự kiện.');
      const activeReservation = await tx.reservation.findFirst({
        where: { eventId, userId, status: { in: [ReservationStatus.HOLD, ReservationStatus.CONFIRMED] } },
        select: { status: true },
      });
      if (activeReservation) {
        throw new ConflictException(
          activeReservation.status === ReservationStatus.CONFIRMED
            ? 'Bạn đã sở hữu vé cho sự kiện này.'
            : 'Bạn đang giữ chỗ cho sự kiện này, không thể tham gia hàng chờ.'
        );
      }
      const activeWaitlist = await tx.waitlistEntry.findFirst({
        where: { eventId, userId, status: { in: [WaitlistStatus.WAITING, WaitlistStatus.OFFERED] } },
        select: { status: true },
      });
      if (activeWaitlist) {
        throw new ConflictException(
          activeWaitlist.status === WaitlistStatus.OFFERED
            ? 'Bạn đang có lượt quyền mua vé (Offer) cho sự kiện này.'
            : 'Bạn đã nằm trong hàng chờ của sự kiện này.'
        );
      }
      if (event.soldCount + event.reservedCount < event.capacity) {
        throw new BadRequestException('Sự kiện vẫn còn vé trống. Vui lòng đặt vé trực tiếp.');
      }
      const sequenceNo = event.nextWaitlistSeq;
      await tx.event.update({ where: { id: eventId }, data: { nextWaitlistSeq: { increment: 1 } } });
      const entry = await tx.waitlistEntry.create({
        data: { eventId, userId, sequenceNo, status: WaitlistStatus.WAITING },
      });
      const aheadCount = await tx.waitlistEntry.count({
        where: { eventId, status: WaitlistStatus.WAITING, sequenceNo: { lt: entry.sequenceNo } },
      });
      return {
        id: entry.id,
        eventId: entry.eventId,
        userId: entry.userId,
        sequenceNo: entry.sequenceNo,
        status: entry.status,
        joinedAt: entry.joinedAt,
        currentRank: aheadCount + 1,
      };
    }, WAITLIST_TX_OPTIONS);
  }

  private mapError(err: unknown, eventId: string): Error {
    if (err instanceof HttpException) return err;
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        const raw = err.meta?.target;
        const fields = Array.isArray(raw) ? raw.map(String) : [];
        const constraint = typeof raw === 'string' ? raw : '';
        if (
          constraint === 'waitlist_entries_active_user_event_key' ||
          (fields.includes('user_id') && fields.includes('event_id'))
        ) {
          return new ConflictException('Bạn đã nằm trong hàng chờ của sự kiện này.');
        }
        if (
          constraint === 'waitlist_entries_event_id_sequence_no_key' ||
          (fields.includes('event_id') && fields.includes('sequence_no'))
        ) {
          this.logger.error(`Sequence invariant conflict on eventId=${eventId}`);
          return new InternalServerErrorException('Xung đột cấp số thứ tự hàng chờ. Vui lòng thử lại.');
        }
        return new ConflictException('Yêu cầu xung đột dữ liệu hiện tại.');
      }
      if (err.code === 'P2024' || err.code === 'P2028') {
        this.logger.error(`Transaction timeout/pool error (${err.code}) on eventId=${eventId}`);
        return new ServiceUnavailableException('Hệ thống đang bận, vui lòng thử lại sau giây lát.');
      }
      if (isTransientPgConflict(err)) {
        return new ServiceUnavailableException('Hệ thống đang bận xử lý đồng thời, vui lòng thử lại.');
      }
    }
    this.logger.error(`Unexpected error in waitlist service (eventId=${eventId})`);
    return new InternalServerErrorException('Không thể xử lý yêu cầu hàng chờ.');
  }
}
