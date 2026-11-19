import { api } from './client';

export interface OrganizerEvent {
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
  organizerName: string;
  nextWaitlistSeq: number;
  featured?: boolean;
}

export interface OrganizerStats {
  totalEvents: number;
  totalSold: number;
  totalReserved: number;
  totalWaiting: number;
  totalOffersActive: number;
}

export interface OrganizerWaitlistEntry {
  id: string;
  eventId: string;
  userId: string;
  sequenceNo: number;
  status: 'WAITING' | 'OFFERED' | 'FULFILLED' | 'EXPIRED' | 'CANCELLED';
  joinedAt: string;
  name: string;
  email: string;
}

export interface OrganizerAttendee {
  ticketCode: string;
  name: string;
  email: string;
  priceVnd: number;
  source: string;
  confirmedAt: string;
}

export async function getOrganizerEvents(): Promise<OrganizerEvent[]> {
  const { data } = await api.get<OrganizerEvent[]>('/organizer/events');
  return data;
}

export async function getOrganizerStats(): Promise<OrganizerStats> {
  const { data } = await api.get<OrganizerStats>('/organizer/stats');
  return data;
}

export async function getOrganizerWaitlist(eventId: string): Promise<OrganizerWaitlistEntry[]> {
  const { data } = await api.get<OrganizerWaitlistEntry[]>(`/organizer/events/${eventId}/waitlist`);
  return data;
}

export async function promoteOrganizerWaitlist(eventId: string) {
  const { data } = await api.post(`/organizer/events/${eventId}/promote`);
  return data;
}

export async function getOrganizerAttendees(eventId: string): Promise<OrganizerAttendee[]> {
  const { data } = await api.get<OrganizerAttendee[]>(`/organizer/events/${eventId}/attendees`);
  return data;
}

export async function downloadOrganizerAttendeesCsv(eventId: string): Promise<void> {
  const response = await api.get<Blob>(`/organizer/events/${eventId}/attendees/csv`, {
    responseType: 'blob',
  });
  const blobUrl = URL.createObjectURL(response.data);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = `attendees-${eventId}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}
