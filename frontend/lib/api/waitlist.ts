import { api } from './client';

export type WaitlistStatus = 'WAITING' | 'OFFERED' | 'FULFILLED' | 'EXPIRED' | 'CANCELLED';

export interface WaitlistEventSummary {
  id: string;
  title: string;
  slug: string;
  category: string;
  venue: string;
  city: string;
  startsAt: string;
  poster: string;
}

export interface WaitlistPendingOfferSummary {
  id: string;
  status: string;
  expiresAt: string;
}

export interface JoinWaitlistResponse {
  id: string;
  eventId: string;
  userId: string;
  sequenceNo: number;
  status: WaitlistStatus;
  joinedAt: string;
  currentRank: number;
}

export interface MyWaitlistItemResponse {
  id: string;
  eventId: string;
  sequenceNo: number;
  status: WaitlistStatus;
  joinedAt: string;
  currentRank: number | null;
  event: WaitlistEventSummary;
  pendingOffer: WaitlistPendingOfferSummary | null;
}

export interface LeaveWaitlistResponse {
  id: string;
  status: WaitlistStatus;
}

export const WAITLIST_UPDATED_EVENT = 'ef:waitlist-updated';

// Thông báo cho Header và các component khác cập nhật lại số lượng hàng chờ/offer thật.
export const notifyWaitlistUpdated = (): void => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(WAITLIST_UPDATED_EVENT));
  }
};

// Đăng ký tham gia hàng chờ theo eventId.
export const joinWaitlist = async (eventId: string): Promise<JoinWaitlistResponse> => {
  const { data } = await api.post<JoinWaitlistResponse>('/waitlist', { eventId });
  notifyWaitlistUpdated();
  return data;
};

// Lấy danh sách hàng chờ của người dùng hiện tại.
export const getMyWaitlist = async (): Promise<MyWaitlistItemResponse[]> => {
  const { data } = await api.get<MyWaitlistItemResponse[]>('/waitlist/me');
  return data;
};

// Rời khỏi hàng chờ theo entryId.
export const leaveWaitlist = async (entryId: string): Promise<LeaveWaitlistResponse> => {
  const { data } = await api.delete<LeaveWaitlistResponse>(`/waitlist/${entryId}`);
  notifyWaitlistUpdated();
  return data;
};
