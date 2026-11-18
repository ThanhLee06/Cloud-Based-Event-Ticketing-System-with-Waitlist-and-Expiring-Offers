import * as crypto from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OfferStatus, Prisma, ReservationSource, ReservationStatus, WaitlistStatus } from '@prisma/client';
import { DEFAULT_TX_OPTIONS, runWithPgRetry } from '../common/pg-tx.util';
import { PrismaService } from '../prisma/prisma.service';
import { WaitlistService } from '../waitlist/waitlist.service';
import type { AcceptOfferResponse, DeclineOfferResponse, OfferDetailResponse } from './dto/offer.dto';

interface LockedEventRow {
  id: string;
  title: string;
}

interface LockedOfferRow {
  id: string;
  reservationId: string;
  waitlistEntryId: string;
  eventId: string;
  userId: string;
  status: OfferStatus;
  expiresAt: Date;
}

interface LockedReservationRow {
  id: string;
  eventId: string;
  userId: string;
  source: ReservationSource;
  status: ReservationStatus;
  ticketCode: string | null;
  priceVnd: number;
  receiptContent: unknown;
  confirmedAt: Date | null;
}

interface LockedWaitlistEntryRow {
  id: string;
  eventId: string;
  userId: string;
  status: WaitlistStatus;
}

interface LockedAggregate {
  event: LockedEventRow;
  offer: LockedOfferRow;
  reservation: LockedReservationRow;
  entry: LockedWaitlistEntryRow;
  dbNow: Date;
}

@Injectable()
export class OffersService {
  private readonly logger = new Logger(OffersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly waitlistService: WaitlistService
  ) {}

  async getOffer(userId: string, offerId: string): Promise<OfferDetailResponse> {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            slug: true,
            venue: true,
            address: true,
            city: true,
            startsAt: true,
            priceVnd: true,
            poster: true,
          },
        },
        reservation: {
          select: { id: true, status: true, priceVnd: true, expiresAt: true, ticketCode: true },
        },
      },
    });
    if (!offer) throw new NotFoundException('Quyền mua vé không tồn tại.');
    if (offer.userId !== userId) throw new ForbiddenException('Bạn không có quyền xem quyền mua vé này.');
    return {
      id: offer.id,
      eventId: offer.eventId,
      userId: offer.userId,
      status: offer.status,
      expiresAt: offer.expiresAt,
      createdAt: offer.createdAt,
      acceptedAt: offer.acceptedAt,
      serverTime: new Date(),
      event: offer.event,
      reservation: offer.reservation,
    };
  }

  async acceptOffer(userId: string, offerId: string): Promise<AcceptOfferResponse> {
    return this.executeOfferMutation(userId, offerId, (tx, eventId) =>
      this.runAcceptTransaction(tx, userId, offerId, eventId)
    );
  }

  async declineOffer(userId: string, offerId: string): Promise<DeclineOfferResponse> {
    return this.executeOfferMutation(userId, offerId, (tx, eventId) =>
      this.runDeclineTransaction(tx, userId, offerId, eventId)
    );
  }

  private async executeOfferMutation<T>(
    userId: string,
    offerId: string,
    handler: (tx: Prisma.TransactionClient, eventId: string) => Promise<T>
  ): Promise<T> {
    const minimal = await this.prisma.offer.findUnique({
      where: { id: offerId },
      select: { id: true, userId: true, eventId: true },
    });
    if (!minimal) throw new NotFoundException('Quyền mua vé không tồn tại.');
    if (minimal.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền thao tác trên quyền mua vé này.');
    }
    return runWithPgRetry(
      () => this.prisma.$transaction((tx) => handler(tx, minimal.eventId), DEFAULT_TX_OPTIONS),
      3
    );
  }

  // Khóa theo thứ tự cố định Event -> Offer -> Reservation -> WaitlistEntry để tránh deadlock.
  private async lockAndValidateAggregate(
    tx: Prisma.TransactionClient,
    userId: string,
    offerId: string,
    eventId: string
  ): Promise<LockedAggregate> {
    const [event] = await tx.$queryRaw<LockedEventRow[]>`
      SELECT "id"::text AS "id", "title" FROM "events" WHERE "id" = CAST(${eventId} AS uuid) FOR UPDATE
    `;
    if (!event) throw new NotFoundException('Sự kiện không tồn tại.');
    const [offer] = await tx.$queryRaw<LockedOfferRow[]>`
      SELECT "id"::text AS "id", "reservation_id"::text AS "reservationId", "waitlist_entry_id"::text AS "waitlistEntryId",
             "event_id"::text AS "eventId", "user_id"::text AS "userId", "status"::text AS "status", "expires_at" AS "expiresAt"
      FROM "offers" WHERE "id" = CAST(${offerId} AS uuid) FOR UPDATE
    `;
    if (!offer) throw new NotFoundException('Quyền mua vé không tồn tại.');
    if (offer.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền thao tác trên quyền mua vé này.');
    }
    const [reservation] = await tx.$queryRaw<LockedReservationRow[]>`
      SELECT "id"::text AS "id", "event_id"::text AS "eventId", "user_id"::text AS "userId",
             "source"::text AS "source", "status"::text AS "status", "ticket_code" AS "ticketCode",
             "price_vnd" AS "priceVnd", "receipt_content" AS "receiptContent", "confirmed_at" AS "confirmedAt"
      FROM "reservations" WHERE "id" = CAST(${offer.reservationId} AS uuid) FOR UPDATE
    `;
    if (!reservation) throw new NotFoundException('Đơn giữ chỗ liên kết không tồn tại.');
    const [entry] = await tx.$queryRaw<LockedWaitlistEntryRow[]>`
      SELECT "id"::text AS "id", "event_id"::text AS "eventId", "user_id"::text AS "userId", "status"::text AS "status"
      FROM "waitlist_entries" WHERE "id" = CAST(${offer.waitlistEntryId} AS uuid) FOR UPDATE
    `;
    if (!entry) throw new NotFoundException('Lượt hàng chờ liên kết không tồn tại.');
    if (
      offer.eventId !== event.id ||
      offer.userId !== userId ||
      reservation.eventId !== offer.eventId ||
      reservation.userId !== offer.userId ||
      reservation.source !== ReservationSource.WAITLIST_OFFER ||
      entry.eventId !== offer.eventId ||
      entry.userId !== offer.userId
    ) {
      this.logger.error(`Xung đột toàn vẹn liên kết Offer ${offerId}`);
      throw new ConflictException('Dữ liệu liên kết quyền mua vé không nhất quán.');
    }
    const [{ dbNow }] = await tx.$queryRaw<Array<{ dbNow: Date }>>`SELECT clock_timestamp() AS "dbNow"`;
    return { event, offer, reservation, entry, dbNow };
  }

  private assertActionableOffer(
    offer: LockedOfferRow,
    reservation: LockedReservationRow,
    entry: LockedWaitlistEntryRow,
    dbNow: Date
  ): void {
    if (dbNow.getTime() >= offer.expiresAt.getTime() || offer.status === OfferStatus.EXPIRED) {
      throw new GoneException('Quyền mua vé đã hết hạn.');
    }
    if (offer.status !== OfferStatus.PENDING) {
      throw new ConflictException('Trạng thái quyền mua vé không hợp lệ.');
    }
    if (reservation.status !== ReservationStatus.HOLD) {
      throw new ConflictException('Đơn giữ chỗ không ở trạng thái giữ vé (HOLD).');
    }
    if (entry.status !== WaitlistStatus.OFFERED) {
      throw new ConflictException('Lượt hàng chờ không ở trạng thái được cấp offer (OFFERED).');
    }
  }

  private async runAcceptTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    offerId: string,
    eventId: string
  ): Promise<AcceptOfferResponse> {
    const { event, offer, reservation, entry, dbNow } =
      await this.lockAndValidateAggregate(tx, userId, offerId, eventId);
    if (offer.status === OfferStatus.ACCEPTED) {
      if (
        reservation.status !== ReservationStatus.CONFIRMED ||
        !reservation.ticketCode ||
        !reservation.confirmedAt ||
        !reservation.receiptContent
      ) {
        this.logger.error(`Offer ${offerId} đã ACCEPTED nhưng Reservation ${reservation.id} thiếu thông tin vé.`);
        throw new InternalServerErrorException('Dữ liệu vé xác nhận không nhất quán.');
      }
      return {
        success: true,
        message: 'Vé đã được xác nhận thành công trước đó.',
        offerId: offer.id,
        reservationId: reservation.id,
        ticketCode: reservation.ticketCode,
        confirmedAt: reservation.confirmedAt,
        receiptContent: reservation.receiptContent as Record<string, unknown>,
      };
    }
    if (offer.status === OfferStatus.DECLINED) {
      throw new ConflictException('Quyền mua vé đã bị từ chối trước đó.');
    }
    this.assertActionableOffer(offer, reservation, entry, dbNow);
    const ticketCode = `TKT-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${dbNow.getTime().toString(36).toUpperCase()}`;
    const receiptContent: Prisma.InputJsonObject = {
      ticketCode,
      offerId: offer.id,
      reservationId: reservation.id,
      eventId: event.id,
      eventTitle: event.title,
      userId,
      priceVnd: reservation.priceVnd,
      confirmedAt: dbNow.toISOString(),
    };
    await tx.offer.update({ where: { id: offer.id }, data: { status: OfferStatus.ACCEPTED, acceptedAt: dbNow } });
    await tx.waitlistEntry.update({ where: { id: entry.id }, data: { status: WaitlistStatus.FULFILLED } });
    await tx.reservation.update({
      where: { id: reservation.id },
      data: { status: ReservationStatus.CONFIRMED, confirmedAt: dbNow, ticketCode, receiptContent },
    });
    await tx.event.update({
      where: { id: event.id },
      data: { reservedCount: { decrement: 1 }, soldCount: { increment: 1 } },
    });
    return {
      success: true,
      message: 'Xác nhận nhận vé thành công! Vé đã được thêm vào tài khoản.',
      offerId: offer.id,
      reservationId: reservation.id,
      ticketCode,
      confirmedAt: dbNow,
      receiptContent,
    };
  }

  private async runDeclineTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    offerId: string,
    eventId: string
  ): Promise<DeclineOfferResponse> {
    const { event, offer, reservation, entry, dbNow } =
      await this.lockAndValidateAggregate(tx, userId, offerId, eventId);
    if (offer.status === OfferStatus.DECLINED) {
      return {
        success: true,
        message: 'Quyền mua vé đã được từ chối trước đó.',
        offerId: offer.id,
        declined: true,
        promotedNext: false,
      };
    }
    if (offer.status === OfferStatus.ACCEPTED) {
      throw new ConflictException('Vé đã được nhận, không thể từ chối.');
    }
    this.assertActionableOffer(offer, reservation, entry, dbNow);
    await tx.offer.update({ where: { id: offer.id }, data: { status: OfferStatus.DECLINED } });
    await tx.waitlistEntry.update({ where: { id: entry.id }, data: { status: WaitlistStatus.EXPIRED } });
    await tx.reservation.update({
      where: { id: reservation.id },
      data: { status: ReservationStatus.CANCELLED, cancelledAt: dbNow },
    });
    await tx.event.update({ where: { id: event.id }, data: { reservedCount: { decrement: 1 } } });
    const promoteRes = await this.waitlistService.promoteNextWaitlist(event.id, tx);
    return {
      success: true,
      message: 'Đã từ chối quyền mua vé. Lượt mua đã được chuyển giao cho người chờ tiếp theo.',
      offerId: offer.id,
      declined: true,
      promotedNext: promoteRes.promoted,
      nextOfferId: promoteRes.promoted ? promoteRes.offerId : undefined,
    };
  }
}
