import { WaitlistStatus } from '@prisma/client';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class JoinWaitlistDto {
  @IsNotEmpty({ message: 'Vui lòng cung cấp eventId.' })
  @IsUUID('all', { message: 'eventId phải là UUID hợp lệ.' })
  eventId!: string;
}

export interface JoinWaitlistResponse {
  id: string;
  eventId: string;
  userId: string;
  sequenceNo: number;
  status: WaitlistStatus;
  joinedAt: Date;
  currentRank: number;
}

export interface WaitlistEventSummary {
  id: string;
  title: string;
  slug: string;
  category: string;
  venue: string;
  city: string;
  startsAt: Date;
  poster: string;
}

export interface WaitlistPendingOfferSummary {
  id: string;
  status: string;
  expiresAt: Date;
}

export interface MyWaitlistItemResponse {
  id: string;
  eventId: string;
  sequenceNo: number;
  status: WaitlistStatus;
  joinedAt: Date;
  currentRank: number | null;
  event: WaitlistEventSummary;
  pendingOffer: WaitlistPendingOfferSummary | null;
}

export interface LeaveWaitlistResponse {
  id: string;
  status: WaitlistStatus;
}

export type PromoteNoopReason = 'EVENT_NOT_FOUND' | 'NO_CAPACITY' | 'NO_WAITING_ENTRIES';

export interface PromoteSuccessResult {
  promoted: true;
  offerId: string;
  reservationId: string;
  waitlistEntryId: string;
  userId: string;
  eventId: string;
  sequenceNo: number;
  expiresAt: Date;
}

export interface PromoteNoopResult {
  promoted: false;
  reason: PromoteNoopReason;
}

export type PromoteResult = PromoteSuccessResult | PromoteNoopResult;

