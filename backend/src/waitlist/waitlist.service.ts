import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
import type { JoinWaitlistResponse, LeaveWaitlistResponse, MyWaitlistItemResponse } from './dto/join-waitlist.dto';

interface LockedEventRow {
  id: string;
  capacity: number;
  reservedCount: number;
  soldCount: number;
  nextWaitlistSeq: number;
  priceVnd: number;
}

interface RawMyWaitlistRow {
  id: string;
  eventId: string;
  sequenceNo: number;
  status: string;
  joinedAt: Date;
  currentRank: number | null;
  eventTitle: string;
  eventSlug: string;
  eventCategory: string;
  eventVenue: string;
  eventCity: string;
  eventStartsAt: Date;
  eventPoster: string;
  offerId: string | null;
  offerStatus: string | null;
  offerExpiresAt: Date | null;
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

  async getMyWaitlist(userId: string): Promise<MyWaitlistItemResponse[]> {
    const rows = await this.prisma.$queryRaw<RawMyWaitlistRow[]>`
      SELECT
        w."id"::text AS "id", w."event_id"::text AS "eventId", w."sequence_no" AS "sequenceNo",
        w."status"::text AS "status", w."joined_at" AS "joinedAt",
        CASE
          WHEN w."status" = 'WAITING' THEN 1 + (
            SELECT COUNT(*)::int FROM "waitlist_entries" w2
            WHERE w2."event_id" = w."event_id" AND w2."status" = 'WAITING' AND w2."sequence_no" < w."sequence_no"
          )
          ELSE NULL
        END AS "currentRank",
        e."title" AS "eventTitle", e."slug" AS "eventSlug", e."category" AS "eventCategory",
        e."venue" AS "eventVenue", e."city" AS "eventCity", e."starts_at" AS "eventStartsAt", e."poster" AS "eventPoster",
        o."id"::text AS "offerId", o."status"::text AS "offerStatus", o."expires_at" AS "offerExpiresAt"
      FROM "waitlist_entries" w
      INNER JOIN "events" e ON e."id" = w."event_id"
      LEFT JOIN "offers" o ON o."waitlist_entry_id" = w."id" AND o."status" = 'PENDING'
      WHERE w."user_id" = CAST(${userId} AS uuid)
      ORDER BY w."joined_at" DESC, w."sequence_no" DESC, w."id" DESC
    `;
    return rows.map((r) => ({
      id: r.id,
      eventId: r.eventId,
      sequenceNo: r.sequenceNo,
      status: r.status as WaitlistStatus,
      joinedAt: r.joinedAt,
      currentRank: r.currentRank,
      event: {
        id: r.eventId,
        title: r.eventTitle,
        slug: r.eventSlug,
        category: r.eventCategory,
        venue: r.eventVenue,
        city: r.eventCity,
        startsAt: r.eventStartsAt,
        poster: r.eventPoster,
      },
      pendingOffer: r.offerId ? { id: r.offerId, status: r.offerStatus!, expiresAt: r.offerExpiresAt! } : null,
    }));
  }

  async leaveWaitlist(userId: string, entryId: string): Promise<LeaveWaitlistResponse> {
    const preliminary = await this.prisma.waitlistEntry.findUnique({
      where: { id: entryId },
      select: { id: true, userId: true, eventId: true },
    });
    if (!preliminary) throw new NotFoundException('Không tìm thấy lượt đăng ký hàng chờ.');
    if (preliminary.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền hủy lượt hàng chờ của người khác.');
    }
    return runWithPgRetry(
      () =>
        this.prisma.$transaction(async (tx) => {
          // Khóa Event trước để tránh race với ST-026 promoteNextWaitlist.
          await tx.$queryRaw`SELECT "id" FROM "events" WHERE "id" = CAST(${preliminary.eventId} AS uuid) FOR UPDATE`;
          const entry = await tx.waitlistEntry.findUnique({
            where: { id: entryId },
            select: { id: true, userId: true, status: true },
          });
          if (!entry) throw new NotFoundException('Không tìm thấy lượt đăng ký hàng chờ.');
          if (entry.userId !== userId) {
            throw new ForbiddenException('Bạn không có quyền hủy lượt hàng chờ của người khác.');
          }
          this.assertCancellableStatus(entry.status);
          const updated = await tx.waitlistEntry.updateMany({
            where: { id: entryId, userId, status: WaitlistStatus.WAITING },
            data: { status: WaitlistStatus.CANCELLED },
          });
          if (updated.count === 0) {
            const latest = await tx.waitlistEntry.findUnique({ where: { id: entryId }, select: { status: true } });
            if (!latest) throw new NotFoundException('Không tìm thấy lượt đăng ký hàng chờ.');
            this.assertCancellableStatus(latest.status);
            throw new ConflictException('Lượt hàng chờ đã thay đổi trạng thái, không thể hủy.');
          }
          return { id: entry.id, status: WaitlistStatus.CANCELLED };
        }, WAITLIST_TX_OPTIONS),
      2,
      (err) => this.mapError(err, preliminary.eventId)
    );
  }

  private assertCancellableStatus(status: WaitlistStatus): void {
    if (status === WaitlistStatus.OFFERED) {
      throw new ConflictException('Lượt hàng chờ đã chuyển thành Offer. Vui lòng dùng API từ chối Offer.');
    }
    if (status !== WaitlistStatus.WAITING) {
      throw new ConflictException('Lượt hàng chờ đã kết thúc, không thể rời hàng chờ.');
    }
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
