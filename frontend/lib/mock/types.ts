export type UserRole = 'ATTENDEE' | 'ORGANIZER';

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  phone?: string;
}

export type EventStatus = 'PUBLISHED' | 'SOLD_OUT' | 'UPCOMING' | 'CLOSED';

export interface Event {
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
  startsAt: string; // ISO string
  salesCloseAt: string; // ISO string
  capacity: number;
  reservedCount: number;
  soldCount: number;
  organizerId: string;
  organizerName: string;
  nextWaitlistSeq: number;
  featured?: boolean;
}

export type ReservationStatus = 'HOLD' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';

export interface Reservation {
  id: string;
  eventId: string;
  userId: string;
  source: 'DIRECT' | 'WAITLIST_OFFER';
  status: ReservationStatus;
  priceVnd: number;
  expiresAt: string; // ISO string
  confirmedAt?: string;
  cancelledAt?: string;
  createdAt: string;
  ticketCode?: string;
}

export type WaitlistStatus = 'WAITING' | 'OFFERED' | 'FULFILLED' | 'EXPIRED' | 'CANCELLED';

export interface WaitlistEntry {
  id: string;
  eventId: string;
  userId: string;
  sequenceNo: number;
  status: WaitlistStatus;
  joinedAt: string;
}

export type OfferStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

export interface Offer {
  id: string;
  reservationId: string;
  waitlistEntryId: string;
  eventId: string;
  userId: string;
  status: OfferStatus;
  expiresAt: string; // ISO string
  createdAt: string;
  acceptedAt?: string;
}

export type ScenarioType =
  | 'DEFAULT'
  | 'EVENT_AVAILABLE'
  | 'EVENT_SOLD_OUT'
  | 'WAITING_POSITION'
  | 'ACTIVE_OFFER'
  | 'EXPIRED_OFFER'
  | 'EXPIRING_HOLD'
  | 'EMPTY_STATE';

export interface StoreState {
  currentUser: DemoUser;
  users: DemoUser[];
  events: Event[];
  reservations: Reservation[];
  waitlistEntries: WaitlistEntry[];
  offers: Offer[];
  activeScenario: ScenarioType;
}
