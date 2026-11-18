import { api } from './client';
import { notifyWaitlistUpdated } from './waitlist';

export type OfferStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
export type ReservationStatus = 'HOLD' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';

export interface OfferEventInfo {
  id: string;
  title: string;
  slug: string;
  venue: string;
  address: string;
  city: string;
  startsAt: string;
  priceVnd: number;
  poster: string;
}

export interface OfferReservationInfo {
  id: string;
  status: ReservationStatus;
  priceVnd: number;
  expiresAt: string;
  ticketCode: string | null;
}

export interface OfferDetailResponse {
  id: string;
  eventId: string;
  userId: string;
  status: OfferStatus;
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
  serverTime: string;
  event: OfferEventInfo;
  reservation: OfferReservationInfo;
}

export interface AcceptOfferResponse {
  success: boolean;
  message: string;
  offerId: string;
  reservationId: string;
  ticketCode: string;
  confirmedAt: string;
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

// Lấy thông tin chi tiết Offer của chính mình.
export const getOffer = async (id: string): Promise<OfferDetailResponse> => {
  const { data } = await api.get<OfferDetailResponse>(`/offers/${id}`);
  return data;
};

// Chấp nhận nhận vé từ Offer.
export const acceptOffer = async (id: string): Promise<AcceptOfferResponse> => {
  const { data } = await api.post<AcceptOfferResponse>(`/offers/${id}/accept`);
  notifyWaitlistUpdated();
  return data;
};

// Từ chối quyền mua vé.
export const declineOffer = async (id: string): Promise<DeclineOfferResponse> => {
  const { data } = await api.post<DeclineOfferResponse>(`/offers/${id}/decline`);
  notifyWaitlistUpdated();
  return data;
};
