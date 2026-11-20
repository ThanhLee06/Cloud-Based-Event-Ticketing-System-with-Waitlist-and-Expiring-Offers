import { api } from './client';

export type ReservationSource = 'DIRECT' | 'WAITLIST_OFFER';
export type ActiveReservationStatus = 'HOLD' | 'CONFIRMED';

export interface ActiveReservationSummary {
  id: string;
  source: ReservationSource;
  status: ActiveReservationStatus;
  priceVnd: number;
  expiresAt: string;
  ticketCode: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

export interface ActiveOfferSummary {
  id: string;
  reservationId: string;
  waitlistEntryId: string;
  status: 'PENDING';
  expiresAt: string;
  createdAt: string;
}

export interface ActiveWaitlistSummary {
  id: string;
  sequenceNo: number;
  status: 'WAITING';
  joinedAt: string;
  currentRank: number;
}

export interface EventUserContext {
  activeReservation: ActiveReservationSummary | null;
  activeOffer: ActiveOfferSummary | null;
  activeWaitlist: ActiveWaitlistSummary | null;
}

export interface EventDetailResponse {
  id: string;
  slug: string;
  title: string;
  category: string;
  description: string;
  venue: string;
  address: string;
  city: string;
  poster: string;
  priceVnd: number;
  startsAt: string;
  salesCloseAt: string;
  capacity: number;
  reservedCount: number;
  soldCount: number;
  organizerId: string;
  nextWaitlistSeq: number;
  featured: boolean;
  createdAt: string;
  organizerName: string;
  availableTickets: number;
  userContext: EventUserContext | null;
}

/**
 * ST-010 — Lấy chi tiết sự kiện theo slug (GET /api/events/:slug).
 * Sử dụng Axios instance dùng chung (`api`) để tự động đính kèm JWT nếu đã đăng nhập.
 */
export const getEventBySlug = async (slug: string): Promise<EventDetailResponse> => {
  const { data } = await api.get<EventDetailResponse>(`/events/${encodeURIComponent(slug)}`);
  return data;
};
