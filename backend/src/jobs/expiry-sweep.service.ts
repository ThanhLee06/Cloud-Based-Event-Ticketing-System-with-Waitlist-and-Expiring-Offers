import * as crypto from 'node:crypto';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OfferStatus, Prisma, ReservationSource, ReservationStatus, WaitlistStatus } from '@prisma/client';
import { DEFAULT_TX_OPTIONS } from '../common/pg-tx.util';
import { PrismaService } from '../prisma/prisma.service';
import { WaitlistService } from '../waitlist/waitlist.service';
import type { SweepExpiredRecordsResult } from './dto/jobs.dto';

interface SweepCursor {
  expiresAt: Date;
  id: string;
}

interface SweepCandidate extends SweepCursor {
  eventId: string;
}

@Injectable()
export class ExpirySweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExpirySweepService.name);
  private timer: NodeJS.Timeout | null = null;
  private isTicking = false;
  // Cursor lưu trong bộ nhớ tiến trình: restart sẽ quét lại từ đầu; đa instance chạy độc lập và an toàn nhờ FOR UPDATE SKIP LOCKED.
  private cursors: { offer: SweepCursor | null; hold: SweepCursor | null } = {
    offer: null,
    hold: null,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly waitlistService: WaitlistService
  ) {}

  onModuleInit(): void {
    if (String(process.env.LOCAL_EXPIRY_SWEEP_ENABLED ?? '').toLowerCase() === 'true') {
      this.startLocalScheduler();
    }
  }

  onModuleDestroy(): void {
    this.stopLocalScheduler();
  }

  resetPersistentCursors(): void {
    this.cursors = { offer: null, hold: null };
  }

  startLocalScheduler(intervalMs = 10_000): void {
    if (this.timer) return;
    this.logger.log(`Bật local expiry sweeper, chu kỳ: ${intervalMs}ms.`);
    this.timer = setInterval(async () => {
      if (this.isTicking) return;
      this.isTicking = true;
      try {
        await this.sweepExpiredRecords();
      } catch (err) {
        this.logger.error('Lỗi ngoài ý muốn trong local expiry sweep tick:', err);
      } finally {
        this.isTicking = false;
      }
    }, intervalMs);
  }

  stopLocalScheduler(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.log('Đã dừng local expiry sweeper.');
    }
  }

  async sweepExpiredRecords(jobId?: string, batchSize = 50): Promise<SweepExpiredRecordsResult> {
    const currentJobId = jobId ?? crypto.randomUUID();
    const startTime = Date.now();
    this.logger.log(`[Job ${currentJobId}] Bắt đầu quét các bản ghi quá hạn.`);
    const offerRes = await this.runSweepCursorLoop(
      'offer',
      batchSize,
      (cursor, limit) => this.fetchExpiredOffers(cursor, limit),
      (tx, cand) => this.processExpiredOfferInTx(tx, cand.id, cand.eventId, currentJobId),
      currentJobId,
      'Offer'
    );
    const holdRes = await this.runSweepCursorLoop(
      'hold',
      batchSize,
      (cursor, limit) => this.fetchExpiredDirectHolds(cursor, limit),
      (tx, cand) => this.processExpiredDirectHoldInTx(tx, cand.id, cand.eventId, currentJobId),
      currentJobId,
      'Direct Hold'
    );
    const durationMs = Date.now() - startTime;
    const promotedOffers = offerRes.promotedCount + holdRes.promotedCount;
    const skipped = offerRes.skippedCount + holdRes.skippedCount;
    this.logger.log(
      `[Job ${currentJobId}] Hoàn tất sweep: expiredOffers=${offerRes.processedCount}, directHolds=${holdRes.processedCount}, promoted=${promotedOffers}, skipped=${skipped}, duration=${durationMs}ms.`
    );
    return {
      jobId: currentJobId,
      expiredOffers: offerRes.processedCount,
      expiredDirectHolds: holdRes.processedCount,
      promotedOffers,
      skipped,
      durationMs,
    };
  }

  private async runSweepCursorLoop(
    cursorKey: 'offer' | 'hold',
    batchSize: number,
    fetchBatch: (cursor: SweepCursor | null, limit: number) => Promise<SweepCandidate[]>,
    processCandidate: (tx: Prisma.TransactionClient, cand: SweepCandidate) => Promise<{ processed: boolean; promoted: boolean }>,
    jobId: string,
    label: string
  ): Promise<{ processedCount: number; promotedCount: number; skippedCount: number }> {
    const maxScanLimit = batchSize * 5;
    const fetchChunk = Math.max(batchSize, 10);
    let cursor = this.cursors[cursorKey];
    let hasWrapped = false;
    let scanned = 0;
    let processedCount = 0;
    let promotedCount = 0;
    let skippedCount = 0;
    while (processedCount < batchSize && scanned < maxScanLimit) {
      const candidates = await fetchBatch(cursor, fetchChunk);
      if (candidates.length === 0) {
        if (cursor !== null && scanned === 0 && !hasWrapped) {
          cursor = null;
          hasWrapped = true;
          continue;
        }
        if (scanned === 0) this.cursors[cursorKey] = null;
        break;
      }
      for (const cand of candidates) {
        cursor = { expiresAt: cand.expiresAt, id: cand.id };
        scanned++;
        try {
          const result = await this.prisma.$transaction((tx) => processCandidate(tx, cand), DEFAULT_TX_OPTIONS);
          if (result.processed) {
            processedCount++;
            if (result.promoted) promotedCount++;
          } else {
            skippedCount++;
          }
        } catch (err) {
          this.logger.error(`[Job ${jobId}] Lỗi xử lý ${label} hết hạn ${cand.id}:`, err);
          skippedCount++;
        }
        if (processedCount >= batchSize || scanned >= maxScanLimit) break;
      }
    }
    this.cursors[cursorKey] = cursor;
    return { processedCount, promotedCount, skippedCount };
  }

  private fetchExpiredOffers(cursor: SweepCursor | null, limit: number): Promise<SweepCandidate[]> {
    if (!cursor) {
      return this.prisma.$queryRaw<SweepCandidate[]>`
        SELECT o."id"::text AS "id", o."event_id"::text AS "eventId", o."expires_at" AS "expiresAt"
        FROM "offers" o
        WHERE o."status" = 'PENDING' AND o."expires_at" <= clock_timestamp()
        ORDER BY o."expires_at" ASC, o."id" ASC LIMIT ${limit}
      `;
    }
    return this.prisma.$queryRaw<SweepCandidate[]>`
      SELECT o."id"::text AS "id", o."event_id"::text AS "eventId", o."expires_at" AS "expiresAt"
      FROM "offers" o
      WHERE o."status" = 'PENDING' AND o."expires_at" <= clock_timestamp()
        AND (o."expires_at" > ${cursor.expiresAt} OR (o."expires_at" = ${cursor.expiresAt} AND o."id" > CAST(${cursor.id} AS uuid)))
      ORDER BY o."expires_at" ASC, o."id" ASC LIMIT ${limit}
    `;
  }

  private fetchExpiredDirectHolds(cursor: SweepCursor | null, limit: number): Promise<SweepCandidate[]> {
    if (!cursor) {
      return this.prisma.$queryRaw<SweepCandidate[]>`
        SELECT r."id"::text AS "id", r."event_id"::text AS "eventId", r."expires_at" AS "expiresAt"
        FROM "reservations" r
        WHERE r."source" = 'DIRECT' AND r."status" = 'HOLD' AND r."expires_at" <= clock_timestamp()
        ORDER BY r."expires_at" ASC, r."id" ASC LIMIT ${limit}
      `;
    }
    return this.prisma.$queryRaw<SweepCandidate[]>`
      SELECT r."id"::text AS "id", r."event_id"::text AS "eventId", r."expires_at" AS "expiresAt"
      FROM "reservations" r
      WHERE r."source" = 'DIRECT' AND r."status" = 'HOLD' AND r."expires_at" <= clock_timestamp()
        AND (r."expires_at" > ${cursor.expiresAt} OR (r."expires_at" = ${cursor.expiresAt} AND r."id" > CAST(${cursor.id} AS uuid)))
      ORDER BY r."expires_at" ASC, r."id" ASC LIMIT ${limit}
    `;
  }

  private async lockEventAndReadNow(
    tx: Prisma.TransactionClient,
    eventId: string
  ): Promise<{ id: string; dbNow: Date } | null> {
    // Khóa Event trước để tuần tự hóa tránh deadlock với API Accept/Decline/Join.
    const [event] = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"::text AS "id" FROM "events" WHERE "id" = CAST(${eventId} AS uuid) FOR UPDATE
    `;
    if (!event) return null;
    const [{ dbNow }] = await tx.$queryRaw<Array<{ dbNow: Date }>>`SELECT clock_timestamp() AS "dbNow"`;
    return { id: event.id, dbNow };
  }

  async processExpiredOfferInTx(
    tx: Prisma.TransactionClient,
    offerId: string,
    eventId: string,
    jobId: string
  ): Promise<{ processed: boolean; promoted: boolean }> {
    const locked = await this.lockEventAndReadNow(tx, eventId);
    if (!locked) return { processed: false, promoted: false };
    const [offer] = await tx.$queryRaw<
      Array<{
        id: string;
        reservationId: string;
        waitlistEntryId: string;
        eventId: string;
        userId: string;
        status: OfferStatus;
        expiresAt: Date;
      }>
    >`
      SELECT "id"::text AS "id", "reservation_id"::text AS "reservationId", "waitlist_entry_id"::text AS "waitlistEntryId",
             "event_id"::text AS "eventId", "user_id"::text AS "userId", "status"::text AS "status", "expires_at" AS "expiresAt"
      FROM "offers" WHERE "id" = CAST(${offerId} AS uuid) FOR UPDATE SKIP LOCKED
    `;
    if (!offer || offer.status !== OfferStatus.PENDING) return { processed: false, promoted: false };
    if (offer.eventId !== locked.id) {
      this.logger.error(`[Job ${jobId}] Offer ${offerId} có eventId (${offer.eventId}) không khớp Event (${locked.id}).`);
      return { processed: false, promoted: false };
    }
    const [reservation] = await tx.$queryRaw<
      Array<{ id: string; eventId: string; userId: string; source: ReservationSource; status: ReservationStatus }>
    >`
      SELECT "id"::text AS "id", "event_id"::text AS "eventId", "user_id"::text AS "userId",
             "source"::text AS "source", "status"::text AS "status"
      FROM "reservations" WHERE "id" = CAST(${offer.reservationId} AS uuid) FOR UPDATE SKIP LOCKED
    `;
    if (!reservation || reservation.status !== ReservationStatus.HOLD || reservation.source !== ReservationSource.WAITLIST_OFFER) {
      return { processed: false, promoted: false };
    }
    const [entry] = await tx.$queryRaw<Array<{ id: string; eventId: string; userId: string; status: WaitlistStatus }>>`
      SELECT "id"::text AS "id", "event_id"::text AS "eventId", "user_id"::text AS "userId", "status"::text AS "status"
      FROM "waitlist_entries" WHERE "id" = CAST(${offer.waitlistEntryId} AS uuid) FOR UPDATE SKIP LOCKED
    `;
    if (!entry || entry.status !== WaitlistStatus.OFFERED) return { processed: false, promoted: false };
    if (locked.dbNow.getTime() < offer.expiresAt.getTime()) return { processed: false, promoted: false };
    if (
      reservation.eventId !== offer.eventId ||
      reservation.userId !== offer.userId ||
      entry.eventId !== offer.eventId ||
      entry.userId !== offer.userId
    ) {
      this.logger.error(`[Job ${jobId}] Toàn vẹn Offer ${offerId} không khớp quan hệ, bỏ qua.`);
      return { processed: false, promoted: false };
    }
    await tx.offer.update({ where: { id: offer.id }, data: { status: OfferStatus.EXPIRED } });
    await tx.reservation.update({ where: { id: reservation.id }, data: { status: ReservationStatus.EXPIRED } });
    await tx.waitlistEntry.update({ where: { id: entry.id }, data: { status: WaitlistStatus.EXPIRED } });
    await tx.event.update({ where: { id: locked.id }, data: { reservedCount: { decrement: 1 } } });
    const promoteRes = await this.waitlistService.promoteNextWaitlist(locked.id, tx);
    return { processed: true, promoted: promoteRes.promoted };
  }

  async processExpiredDirectHoldInTx(
    tx: Prisma.TransactionClient,
    reservationId: string,
    eventId: string,
    jobId: string
  ): Promise<{ processed: boolean; promoted: boolean }> {
    const locked = await this.lockEventAndReadNow(tx, eventId);
    if (!locked) return { processed: false, promoted: false };
    const [reservation] = await tx.$queryRaw<
      Array<{ id: string; eventId: string; source: ReservationSource; status: ReservationStatus; expiresAt: Date }>
    >`
      SELECT "id"::text AS "id", "event_id"::text AS "eventId", "source"::text AS "source",
             "status"::text AS "status", "expires_at" AS "expiresAt"
      FROM "reservations" WHERE "id" = CAST(${reservationId} AS uuid) FOR UPDATE SKIP LOCKED
    `;
    if (!reservation || reservation.status !== ReservationStatus.HOLD || reservation.source !== ReservationSource.DIRECT) {
      return { processed: false, promoted: false };
    }
    if (reservation.eventId !== locked.id) {
      this.logger.error(`[Job ${jobId}] Reservation ${reservationId} có eventId (${reservation.eventId}) không khớp Event (${locked.id}).`);
      return { processed: false, promoted: false };
    }
    if (locked.dbNow.getTime() < reservation.expiresAt.getTime()) return { processed: false, promoted: false };
    await tx.reservation.update({ where: { id: reservation.id }, data: { status: ReservationStatus.EXPIRED } });
    await tx.event.update({ where: { id: locked.id }, data: { reservedCount: { decrement: 1 } } });
    const promoteRes = await this.waitlistService.promoteNextWaitlist(locked.id, tx);
    return { processed: true, promoted: promoteRes.promoted };
  }
}
