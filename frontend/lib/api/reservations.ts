import { api, requestIdempotent } from './client';

export type ReservationStatus = 'HOLD' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';
export interface ReservationEventSummary {
  id: string; slug: string; title: string; category: string; venue: string;
  city: string; poster: string; startsAt: string;
}
export interface ApiReservation {
  id: string; eventId: string; userId: string; source: 'DIRECT' | 'WAITLIST_OFFER';
  status: ReservationStatus; priceVnd: number; expiresAt: string;
  ticketCode: string | null; receiptContent: Record<string, unknown> | null;
  confirmedAt: string | null; cancelledAt: string | null; createdAt: string;
  event?: ReservationEventSummary;
}
export async function createReservation(eventId: string): Promise<ApiReservation> {
  const { data } = await requestIdempotent<ApiReservation>('post', '/reservations', { eventId, quantity: 1 });
  return data;
}
export async function getReservation(id: string): Promise<ApiReservation> {
  const { data } = await api.get<ApiReservation>(`/reservations/${encodeURIComponent(id)}`);
  return data;
}
export async function getMyReservations(): Promise<ApiReservation[]> {
  const { data } = await api.get<ApiReservation[]>('/reservations/me');
  return data;
}
export async function confirmReservation(id: string): Promise<ApiReservation> {
  const { data } = await requestIdempotent<ApiReservation>('post', `/reservations/${encodeURIComponent(id)}/confirm`);
  return data;
}
export async function cancelReservation(id: string): Promise<ApiReservation> {
  const { data } = await requestIdempotent<ApiReservation>('delete', `/reservations/${encodeURIComponent(id)}`);
  return data;
}
