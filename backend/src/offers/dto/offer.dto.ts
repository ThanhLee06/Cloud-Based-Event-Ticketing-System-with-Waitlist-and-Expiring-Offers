import { OfferStatus, ReservationStatus } from '@prisma/client';

export interface OfferEventInfo {
  id: string;
  title: string;
  slug: string;
  venue: string;
  address: string;
  city: string;
  startsAt: Date;
  priceVnd: number;
  poster: string;
}

export interface OfferReservationInfo {
  id: string;
  status: ReservationStatus;
  priceVnd: number;
  expiresAt: Date;
  ticketCode: string | null;
}

export interface OfferDetailResponse {
  id: string;
  eventId: string;
  userId: string;
  status: OfferStatus;
  expiresAt: Date;
  createdAt: Date;
  acceptedAt: Date | null;
  serverTime: Date;
  event: OfferEventInfo;
  reservation: OfferReservationInfo;
}

export interface AcceptOfferResponse {
  success: boolean;
  message: string;
  offerId: string;
  reservationId: string;
  ticketCode: string;
  confirmedAt: Date;
  receiptContent: Record<string, unknown>;
}

export interface DeclineOfferResponse {
  success: boolean;
  message: string;
  offerId: string;
  declined: boolean;
  promotedNext: boolean;
  nextOfferId?: string;
}
