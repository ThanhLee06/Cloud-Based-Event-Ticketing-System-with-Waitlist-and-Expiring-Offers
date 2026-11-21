import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class CreateReservationDto {
  @IsUUID()
  eventId!: string;

  // One ticket is held per reservation in this workflow.
  @IsInt()
  @Min(1)
  @Max(1)
  quantity!: number;
}

export interface ReservationResponse {
  id: string;
  eventId: string;
  userId: string;
  source: 'DIRECT' | 'WAITLIST_OFFER';
  status: 'HOLD' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';
  priceVnd: number;
  expiresAt: Date;
  ticketCode: string | null;
  receiptContent: unknown;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  event?: {
    id: string;
    slug: string;
    title: string;
    category: string;
    venue: string;
    city: string;
    poster: string;
    startsAt: Date;
  };
}
