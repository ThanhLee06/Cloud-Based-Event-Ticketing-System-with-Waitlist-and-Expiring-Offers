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

// ----------------------------- ST-009 / ST-011: Danh sách sự kiện -----------------------------

/** Một phần tử trong GET /api/events (không có organizerName / userContext). */
export type EventListItem = Omit<EventDetailResponse, 'organizerName' | 'userContext'>;

export interface EventListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface EventListResponse {
  data: EventListItem[];
  meta: EventListMeta;
}

export type EventAvailabilityFilter = 'ALL' | 'AVAILABLE' | 'SOLD_OUT';

export interface GetEventsParams {
  q?: string;
  city?: string;
  category?: string;
  availability?: EventAvailabilityFilter;
  /** Bắt đầu từ 1. */
  page?: number;
  /** Backend giới hạn tối đa 100. */
  limit?: number;
}

/** Bỏ các tham số rỗng để Backend (forbidNonWhitelisted) nhận đúng giá trị mặc định. */
const toQueryParams = (params: GetEventsParams): Record<string, string | number> => {
  const query: Record<string, string | number> = {};
  if (params.q?.trim()) query.q = params.q.trim();
  if (params.city?.trim()) query.city = params.city.trim();
  if (params.category?.trim()) query.category = params.category.trim();
  if (params.availability && params.availability !== 'ALL') {
    query.availability = params.availability;
  }
  if (params.page) query.page = params.page;
  if (params.limit) query.limit = params.limit;
  return query;
};

/** ST-011 — Lấy danh sách sự kiện (GET /api/events), trả về { data, meta }. */
export const getEvents = async (params: GetEventsParams = {}): Promise<EventListResponse> => {
  const { data } = await api.get<EventListResponse>('/events', { params: toQueryParams(params) });
  return data;
};
