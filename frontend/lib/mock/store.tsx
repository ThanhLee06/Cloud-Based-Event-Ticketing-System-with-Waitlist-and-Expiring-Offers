'use client';

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import {
  StoreState,
  DemoUser,
  Event,
  Reservation,
  WaitlistEntry,
  Offer,
  ScenarioType,
} from './types';
import { getInitialState } from './initialData';

const STORAGE_KEY = 'eventflow_mock_store_v2';

interface MockStoreContextType {
  state: StoreState;
  currentUser: DemoUser;
  isHydrated: boolean;
  switchUser: (userId: string) => void;
  getEvent: (slugOrId: string) => Event | undefined;
  getAvailableTickets: (event: Event) => number;
  getUserReservations: (userId?: string) => Reservation[];
  getUserWaitlist: (userId?: string) => WaitlistEntry[];
  getUserOffers: (userId?: string) => Offer[];
  getReservation: (reservationId: string) => Reservation | undefined;
  getOffer: (offerId: string) => Offer | undefined;
  createReservation: (eventId: string) => {
    success: boolean;
    reservation?: Reservation;
    message?: string;
  };
  confirmReservation: (reservationId: string) => { success: boolean; message?: string };
  cancelReservation: (reservationId: string) => { success: boolean; message?: string };
  joinWaitlist: (eventId: string) => { success: boolean; entry?: WaitlistEntry; message?: string };
  leaveWaitlist: (entryId: string) => { success: boolean; message?: string };
  acceptOffer: (offerId: string) => { success: boolean; message?: string };
  declineOffer: (offerId: string) => { success: boolean; message?: string };
  expireOffer: (offerId: string) => void;
  expireReservation: (reservationId: string) => void;
  promoteNextWaitlist: (eventId: string) => { success: boolean; message?: string };
  createEvent: (eventData: Partial<Event>) => Event;
  registerUser: (name: string, email: string) => DemoUser;
  loadScenario: (scenario: ScenarioType) => void;
  resetStore: () => void;
}

const MockStoreContext = createContext<MockStoreContextType | null>(null);

// Hàm nội bộ: Cấp offer FIFO cho người đang chờ đầu tiên của event
const tryPromoteLocked = (
  currentEvents: Event[],
  currentWaitlist: WaitlistEntry[],
  currentReservations: Reservation[],
  currentOffers: Offer[],
  eventId: string
): {
  events: Event[];
  waitlist: WaitlistEntry[];
  reservations: Reservation[];
  offers: Offer[];
  promoted: boolean;
} => {
  const targetEvent = currentEvents.find((e) => e.id === eventId);
  if (!targetEvent) {
    return {
      events: currentEvents,
      waitlist: currentWaitlist,
      reservations: currentReservations,
      offers: currentOffers,
      promoted: false,
    };
  }

  const available = targetEvent.capacity - targetEvent.reservedCount - targetEvent.soldCount;
  if (available <= 0) {
    return {
      events: currentEvents,
      waitlist: currentWaitlist,
      reservations: currentReservations,
      offers: currentOffers,
      promoted: false,
    };
  }

  // Tìm người có status WAITING có sequence nhỏ nhất (FIFO)
  const waitingList = currentWaitlist
    .filter((w) => w.eventId === eventId && w.status === 'WAITING')
    .sort((a, b) => a.sequenceNo - b.sequenceNo);

  if (waitingList.length === 0) {
    return {
      events: currentEvents,
      waitlist: currentWaitlist,
      reservations: currentReservations,
      offers: currentOffers,
      promoted: false,
    };
  }

  const headUserEntry = waitingList[0];
  const newReservationId = `res-offer-${Date.now()}`;
  const newOfferId = `offer-${Date.now()}`;
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 phút

  const updatedWaitlist = currentWaitlist.map((w) =>
    w.id === headUserEntry.id ? { ...w, status: 'OFFERED' as const } : w
  );

  const newReservation: Reservation = {
    id: newReservationId,
    eventId,
    userId: headUserEntry.userId,
    source: 'WAITLIST_OFFER',
    status: 'HOLD',
    priceVnd: targetEvent.priceVnd,
    expiresAt,
    createdAt: new Date().toISOString(),
  };

  const newOffer: Offer = {
    id: newOfferId,
    reservationId: newReservationId,
    waitlistEntryId: headUserEntry.id,
    eventId,
    userId: headUserEntry.userId,
    status: 'PENDING',
    expiresAt,
    createdAt: new Date().toISOString(),
  };

  const updatedEvents = currentEvents.map((e) =>
    e.id === eventId ? { ...e, reservedCount: e.reservedCount + 1 } : e
  );

  return {
    events: updatedEvents,
    waitlist: updatedWaitlist,
    reservations: [...currentReservations, newReservation],
    offers: [...currentOffers, newOffer],
    promoted: true,
  };
};

export const MockStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<StoreState>(getInitialState);
  const [isHydrated, setIsHydrated] = useState(false);

  // Khôi phục state từ localStorage phía client
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as StoreState;
        if (parsed.events && parsed.users) {
          setState(parsed);
        }
      }
    } catch {
      // Fallback
    }
    setIsHydrated(true);
  }, []);

  // Lưu state vào localStorage khi có thay đổi
  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Bỏ qua
    }
  }, [state, isHydrated]);

  const currentUser = state.currentUser;

  const switchUser = useCallback((userId: string) => {
    setState((prev) => {
      const found = prev.users.find((u) => u.id === userId);
      if (!found) return prev;
      return { ...prev, currentUser: found };
    });
  }, []);

  const getEvent = useCallback(
    (slugOrId: string): Event | undefined => {
      return state.events.find((e) => e.slug === slugOrId || e.id === slugOrId);
    },
    [state.events]
  );

  const getAvailableTickets = useCallback((event: Event): number => {
    return Math.max(0, event.capacity - event.reservedCount - event.soldCount);
  }, []);

  const getUserReservations = useCallback(
    (userId?: string): Reservation[] => {
      const uid = userId || currentUser.id;
      return state.reservations.filter((r) => r.userId === uid);
    },
    [state.reservations, currentUser.id]
  );

  const getUserWaitlist = useCallback(
    (userId?: string): WaitlistEntry[] => {
      const uid = userId || currentUser.id;
      return state.waitlistEntries.filter((w) => w.userId === uid);
    },
    [state.waitlistEntries, currentUser.id]
  );

  const getUserOffers = useCallback(
    (userId?: string): Offer[] => {
      const uid = userId || currentUser.id;
      return state.offers.filter((o) => o.userId === uid);
    },
    [state.offers, currentUser.id]
  );

  const getReservation = useCallback(
    (reservationId: string): Reservation | undefined => {
      return state.reservations.find((r) => r.id === reservationId);
    },
    [state.reservations]
  );

  const getOffer = useCallback(
    (offerId: string): Offer | undefined => {
      return state.offers.find((o) => o.id === offerId);
    },
    [state.offers]
  );

  // Hết hạn giữ vé (Expire Reservation)
  const expireReservation = useCallback((reservationId: string) => {
    setState((prev) => {
      const reservation = prev.reservations.find((r) => r.id === reservationId);
      if (!reservation || reservation.status !== 'HOLD') return prev;

      const updatedReservations = prev.reservations.map((r) =>
        r.id === reservationId ? { ...r, status: 'EXPIRED' as const } : r
      );

      const updatedEvents = prev.events.map((e) =>
        e.id === reservation.eventId ? { ...e, reservedCount: Math.max(0, e.reservedCount - 1) } : e
      );

      const promotion = tryPromoteLocked(
        updatedEvents,
        prev.waitlistEntries,
        updatedReservations,
        prev.offers,
        reservation.eventId
      );

      return {
        ...prev,
        events: promotion.events,
        waitlistEntries: promotion.waitlist,
        reservations: promotion.reservations,
        offers: promotion.offers,
      };
    });
  }, []);

  // Hết hạn quyền mua vé (Expire Offer)
  const expireOffer = useCallback((offerId: string) => {
    setState((prev) => {
      const offer = prev.offers.find((o) => o.id === offerId);
      if (!offer || offer.status !== 'PENDING') return prev;

      const updatedOffers = prev.offers.map((o) =>
        o.id === offerId ? { ...o, status: 'EXPIRED' as const } : o
      );

      const updatedWaitlist = prev.waitlistEntries.map((w) =>
        w.id === offer.waitlistEntryId ? { ...w, status: 'EXPIRED' as const } : w
      );

      const updatedReservations = prev.reservations.map((r) =>
        r.id === offer.reservationId ? { ...r, status: 'EXPIRED' as const } : r
      );

      const updatedEvents = prev.events.map((e) =>
        e.id === offer.eventId ? { ...e, reservedCount: Math.max(0, e.reservedCount - 1) } : e
      );

      const promotion = tryPromoteLocked(
        updatedEvents,
        updatedWaitlist,
        updatedReservations,
        updatedOffers,
        offer.eventId
      );

      return {
        ...prev,
        events: promotion.events,
        offers: promotion.offers,
        waitlistEntries: promotion.waitlist,
        reservations: promotion.reservations,
      };
    });
  }, []);

  // Xác nhận đặt vé qua thanh toán mô phỏng (CONFIRMED)
  const confirmReservation = useCallback(
    (reservationId: string): { success: boolean; message?: string } => {
      const reservation = state.reservations.find((r) => r.id === reservationId);
      if (!reservation) return { success: false, message: 'Lượt giữ vé không tồn tại' };

      // F03: Guard kiểm tra quyền sở hữu
      if (reservation.userId !== currentUser.id && currentUser.role !== 'ORGANIZER') {
        return {
          success: false,
          message: 'Bạn không có quyền thực hiện thao tác trên lượt giữ vé này',
        };
      }

      // F02: Chặn xác nhận reservation WAITLIST_OFFER trực tiếp tại checkout
      if (reservation.source === 'WAITLIST_OFFER') {
        return {
          success: false,
          message: 'Lượt mua từ danh sách chờ phải được xác nhận tại trang Quyền mua vé',
        };
      }

      if (reservation.status !== 'HOLD')
        return { success: false, message: 'Trạng thái giữ vé không hợp lệ' };

      if (new Date(reservation.expiresAt).getTime() <= Date.now()) {
        expireReservation(reservationId);
        return { success: false, message: 'Lượt giữ vé đã hết hạn quá thời gian quy định' };
      }

      const ticketCode = `EVT-TKT-${Math.floor(10000 + Math.random() * 90000)}`;

      setState((prev) => {
        const updatedReservations = prev.reservations.map((r) =>
          r.id === reservationId
            ? {
                ...r,
                status: 'CONFIRMED' as const,
                confirmedAt: new Date().toISOString(),
                ticketCode,
              }
            : r
        );

        const updatedEvents = prev.events.map((e) =>
          e.id === reservation.eventId
            ? {
                ...e,
                reservedCount: Math.max(0, e.reservedCount - 1),
                soldCount: Math.min(e.capacity, e.soldCount + 1),
              }
            : e
        );

        return {
          ...prev,
          events: updatedEvents,
          reservations: updatedReservations,
        };
      });

      return { success: true };
    },
    [state.reservations, currentUser.id, currentUser.role, expireReservation]
  );

  // Hủy giữ vé hoặc hủy vé đã mua
  const cancelReservation = useCallback(
    (reservationId: string): { success: boolean; message?: string } => {
      const reservation = state.reservations.find((r) => r.id === reservationId);
      if (!reservation) return { success: false, message: 'Vé không tồn tại' };

      // F03: Guard kiểm tra quyền sở hữu
      if (reservation.userId !== currentUser.id && currentUser.role !== 'ORGANIZER') {
        return {
          success: false,
          message: 'Bạn không có quyền hủy vé này',
        };
      }

      if (reservation.status === 'CANCELLED' || reservation.status === 'EXPIRED') {
        return { success: false, message: 'Vé đã ở trạng thái hủy/hết hạn' };
      }

      setState((prev) => {
        const wasConfirmed = reservation.status === 'CONFIRMED';
        const updatedReservations = prev.reservations.map((r) =>
          r.id === reservationId
            ? { ...r, status: 'CANCELLED' as const, cancelledAt: new Date().toISOString() }
            : r
        );

        const updatedEvents = prev.events.map((e) => {
          if (e.id !== reservation.eventId) return e;
          if (wasConfirmed) {
            return { ...e, soldCount: Math.max(0, e.soldCount - 1) };
          } else {
            return { ...e, reservedCount: Math.max(0, e.reservedCount - 1) };
          }
        });

        const promotion = tryPromoteLocked(
          updatedEvents,
          prev.waitlistEntries,
          updatedReservations,
          prev.offers,
          reservation.eventId
        );

        return {
          ...prev,
          events: promotion.events,
          waitlistEntries: promotion.waitlist,
          reservations: promotion.reservations,
          offers: promotion.offers,
        };
      });

      return { success: true, message: 'Đã hủy vé thành công' };
    },
    [state.reservations, currentUser.id, currentUser.role]
  );

  // Đặt giữ vé trực tiếp (Direct Reservation HOLD - 10 phút)
  const createReservation = useCallback(
    (eventId: string): { success: boolean; reservation?: Reservation; message?: string } => {
      const event = state.events.find((e) => e.id === eventId);
      if (!event) return { success: false, message: 'Sự kiện không tồn tại' };

      const available = event.capacity - event.reservedCount - event.soldCount;
      if (available <= 0) {
        return { success: false, message: 'Sự kiện đã hết vé. Vui lòng tham gia danh sách chờ!' };
      }

      const existing = state.reservations.find(
        (r) =>
          r.eventId === eventId &&
          r.userId === currentUser.id &&
          (r.status === 'HOLD' || r.status === 'CONFIRMED')
      );
      if (existing) {
        return {
          success: false,
          message:
            existing.status === 'CONFIRMED'
              ? 'Bạn đã sở hữu vé cho sự kiện này'
              : 'Bạn đang có một lượt giữ vé chưa hoàn tất',
        };
      }

      const reservationId = `res-${Date.now()}`;
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const newReservation: Reservation = {
        id: reservationId,
        eventId,
        userId: currentUser.id,
        source: 'DIRECT',
        status: 'HOLD',
        priceVnd: event.priceVnd,
        expiresAt,
        createdAt: new Date().toISOString(),
      };

      setState((prev) => {
        const updatedEvents = prev.events.map((e) =>
          e.id === eventId ? { ...e, reservedCount: e.reservedCount + 1 } : e
        );
        return {
          ...prev,
          events: updatedEvents,
          reservations: [...prev.reservations, newReservation],
        };
      });

      return { success: true, reservation: newReservation };
    },
    [state.events, state.reservations, currentUser.id]
  );

  // Nhận quyền mua vé (Accept Offer)
  const acceptOffer = useCallback(
    (offerId: string): { success: boolean; message?: string } => {
      const offer = state.offers.find((o) => o.id === offerId);
      if (!offer) return { success: false, message: 'Quyền mua vé không tồn tại' };

      // F03: Guard kiểm tra quyền sở hữu
      if (offer.userId !== currentUser.id && currentUser.role !== 'ORGANIZER') {
        return {
          success: false,
          message: 'Bạn không có quyền xác nhận quyền mua vé này',
        };
      }

      if (offer.status !== 'PENDING')
        return { success: false, message: 'Quyền mua vé không còn ở trạng thái khả dụng' };

      if (new Date(offer.expiresAt).getTime() <= Date.now()) {
        expireOffer(offerId);
        return { success: false, message: 'Quyền mua vé đã hết hạn' };
      }

      // F02: Kiểm tra liên kết reservation và ngăn ngừa double increment
      const targetReservation = state.reservations.find((r) => r.id === offer.reservationId);
      const isAlreadyConfirmed = targetReservation?.status === 'CONFIRMED';

      const targetEvent = state.events.find((e) => e.id === offer.eventId);
      if (!targetEvent) return { success: false, message: 'Sự kiện không tồn tại' };

      const ticketCode = `EVT-OFFER-${Math.floor(10000 + Math.random() * 90000)}`;

      setState((prev) => {
        const updatedOffers = prev.offers.map((o) =>
          o.id === offerId
            ? { ...o, status: 'ACCEPTED' as const, acceptedAt: new Date().toISOString() }
            : o
        );

        const updatedWaitlist = prev.waitlistEntries.map((w) =>
          w.id === offer.waitlistEntryId ? { ...w, status: 'FULFILLED' as const } : w
        );

        const updatedReservations = prev.reservations.map((r) =>
          r.id === offer.reservationId
            ? {
                ...r,
                status: 'CONFIRMED' as const,
                confirmedAt: new Date().toISOString(),
                ticketCode,
              }
            : r
        );

        // F02: Chỉ tăng soldCount nếu reservation chưa từng được confirm trước đó
        const updatedEvents = prev.events.map((e) => {
          if (e.id !== offer.eventId) return e;
          if (isAlreadyConfirmed) return e;
          return {
            ...e,
            reservedCount: Math.max(0, e.reservedCount - 1),
            soldCount: Math.min(e.capacity, e.soldCount + 1),
          };
        });

        return {
          ...prev,
          events: updatedEvents,
          offers: updatedOffers,
          waitlistEntries: updatedWaitlist,
          reservations: updatedReservations,
        };
      });

      return {
        success: true,
        message: 'Xác nhận nhận vé thành công! Vé đã được thêm vào mục Vé của tôi.',
      };
    },
    [state.offers, state.reservations, state.events, currentUser.id, currentUser.role, expireOffer]
  );

  // Từ chối quyền mua vé (Decline Offer)
  const declineOffer = useCallback(
    (offerId: string): { success: boolean; message?: string } => {
      const offer = state.offers.find((o) => o.id === offerId);
      if (!offer) return { success: false, message: 'Quyền mua vé không tồn tại' };

      // F03: Guard quyền sở hữu
      if (offer.userId !== currentUser.id && currentUser.role !== 'ORGANIZER') {
        return {
          success: false,
          message: 'Bạn không có quyền từ chối quyền mua vé này',
        };
      }

      setState((prev) => {
        const updatedOffers = prev.offers.map((o) =>
          o.id === offerId ? { ...o, status: 'DECLINED' as const } : o
        );

        const updatedWaitlist = prev.waitlistEntries.map((w) =>
          w.id === offer.waitlistEntryId ? { ...w, status: 'CANCELLED' as const } : w
        );

        const updatedReservations = prev.reservations.map((r) =>
          r.id === offer.reservationId ? { ...r, status: 'CANCELLED' as const } : r
        );

        const updatedEvents = prev.events.map((e) =>
          e.id === offer.eventId ? { ...e, reservedCount: Math.max(0, e.reservedCount - 1) } : e
        );

        const promotion = tryPromoteLocked(
          updatedEvents,
          updatedWaitlist,
          updatedReservations,
          updatedOffers,
          offer.eventId
        );

        return {
          ...prev,
          events: promotion.events,
          offers: promotion.offers,
          waitlistEntries: promotion.waitlist,
          reservations: promotion.reservations,
        };
      });

      return {
        success: true,
        message: 'Đã từ chối quyền mua vé. Lượt mua đã được chuyển cho người chờ tiếp theo.',
      };
    },
    [state.offers, currentUser.id, currentUser.role]
  );

  // Tham gia danh sách chờ (Join Waitlist FIFO)
  const joinWaitlist = useCallback(
    (eventId: string): { success: boolean; entry?: WaitlistEntry; message?: string } => {
      const event = state.events.find((e) => e.id === eventId);
      if (!event) return { success: false, message: 'Sự kiện không tồn tại' };

      const existingWaitlist = state.waitlistEntries.find(
        (w) =>
          w.eventId === eventId &&
          w.userId === currentUser.id &&
          (w.status === 'WAITING' || w.status === 'OFFERED')
      );
      if (existingWaitlist) {
        return { success: false, message: 'Bạn đã đăng ký trong danh sách chờ của sự kiện này' };
      }

      const seq = event.nextWaitlistSeq;
      const entryId = `wl-${Date.now()}`;
      const newEntry: WaitlistEntry = {
        id: entryId,
        eventId,
        userId: currentUser.id,
        sequenceNo: seq,
        status: 'WAITING',
        joinedAt: new Date().toISOString(),
      };

      setState((prev) => {
        const updatedEvents = prev.events.map((e) =>
          e.id === eventId ? { ...e, nextWaitlistSeq: e.nextWaitlistSeq + 1 } : e
        );
        return {
          ...prev,
          events: updatedEvents,
          waitlistEntries: [...prev.waitlistEntries, newEntry],
        };
      });

      return { success: true, entry: newEntry };
    },
    [state.events, state.waitlistEntries, currentUser.id]
  );

  // Rời hàng chờ
  const leaveWaitlist = useCallback(
    (entryId: string): { success: boolean; message?: string } => {
      const entry = state.waitlistEntries.find((w) => w.id === entryId);
      if (!entry) return { success: false, message: 'Không tìm thấy lượt chờ' };

      // F03: Guard quyền sở hữu
      if (entry.userId !== currentUser.id && currentUser.role !== 'ORGANIZER') {
        return {
          success: false,
          message: 'Bạn không có quyền thao tác trên lượt chờ này',
        };
      }

      if (entry.status === 'OFFERED') {
        const relatedOffer = state.offers.find((o) => o.waitlistEntryId === entryId);
        if (relatedOffer) {
          declineOffer(relatedOffer.id);
          return { success: true, message: 'Đã từ chối quyền mua vé và rời hàng chờ' };
        }
      }

      setState((prev) => {
        const updatedWaitlist = prev.waitlistEntries.map((w) =>
          w.id === entryId ? { ...w, status: 'CANCELLED' as const } : w
        );
        return { ...prev, waitlistEntries: updatedWaitlist };
      });

      return { success: true, message: 'Đã rời danh sách chờ thành công' };
    },
    [state.waitlistEntries, state.offers, currentUser.id, currentUser.role, declineOffer]
  );

  // Ban tổ chức demo: Mô phỏng cấp offer cho người kế tiếp
  const promoteNextWaitlist = useCallback(
    (eventId: string): { success: boolean; message?: string } => {
      // F04: Guard quyền Ban tổ chức
      if (currentUser.role !== 'ORGANIZER') {
        return {
          success: false,
          message: 'Chỉ tài khoản Ban tổ chức mới có quyền điều phối hàng chờ',
        };
      }

      let promotedSuccess = false;

      setState((prev) => {
        const promotion = tryPromoteLocked(
          prev.events,
          prev.waitlistEntries,
          prev.reservations,
          prev.offers,
          eventId
        );
        promotedSuccess = promotion.promoted;

        return {
          ...prev,
          events: promotion.events,
          waitlistEntries: promotion.waitlist,
          reservations: promotion.reservations,
          offers: promotion.offers,
        };
      });

      if (!promotedSuccess) {
        return {
          success: false,
          message: 'Không thể cấp offer: Hết vé hoặc không còn ai trong hàng chờ',
        };
      }
      return {
        success: true,
        message: 'Đã cấp quyền mua vé có thời hạn cho người tiếp theo trong hàng chờ',
      };
    },
    [currentUser.role]
  );

  // Tạo sự kiện mới phía Ban tổ chức
  const createEvent = useCallback(
    (eventData: Partial<Event>): Event => {
      // F04: Guard quyền Ban tổ chức
      if (currentUser.role !== 'ORGANIZER') {
        throw new Error('Chỉ tài khoản Ban tổ chức mới có quyền tạo sự kiện');
      }

      // F18: Xử lý giá 0đ hợp lệ và chống slug collision
      const baseSlug = (eventData.title || 'su-kien-moi')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
      const uniqueSuffix = Date.now().toString().slice(-4);
      const slug = `${baseSlug}-${uniqueSuffix}`;

      const priceVnd =
        typeof eventData.priceVnd === 'number' && !isNaN(eventData.priceVnd)
          ? Math.max(0, eventData.priceVnd)
          : 0;

      const capacity =
        typeof eventData.capacity === 'number' && eventData.capacity > 0 ? eventData.capacity : 50;

      const newEvent: Event = {
        id: `evt-${Date.now()}`,
        slug,
        title: eventData.title || 'Sự kiện mới',
        category: eventData.category || 'Âm nhạc',
        description: eventData.description || 'Mô tả sự kiện chi tiết...',
        venue: eventData.venue || 'Địa điểm tổ chức',
        address: eventData.address || 'Địa chỉ sự kiện',
        city: eventData.city || 'TP. Hồ Chí Minh',
        poster:
          eventData.poster ||
          'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?auto=format&fit=crop&w=800&q=80',
        priceVnd,
        startsAt: eventData.startsAt || new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        salesCloseAt:
          eventData.salesCloseAt || new Date(Date.now() + 6 * 24 * 3600 * 1000).toISOString(),
        capacity,
        reservedCount: 0,
        soldCount: 0,
        organizerId: currentUser.id,
        organizerName: currentUser.name,
        nextWaitlistSeq: 1,
        featured: false,
      };

      setState((prev) => ({
        ...prev,
        events: [newEvent, ...prev.events],
      }));

      return newEvent;
    },
    [currentUser]
  );

  // F17: Đăng ký tài khoản demo cục bộ không ghi đè thành user-1
  const registerUser = useCallback((name: string, email: string): DemoUser => {
    const newUser: DemoUser = {
      id: `user-${Date.now()}`,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: 'ATTENDEE',
      avatar:
        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80',
    };

    setState((prev) => ({
      ...prev,
      users: [...prev.users, newUser],
      currentUser: newUser,
    }));

    return newUser;
  }, []);

  // Chuyển đổi kịch bản demo (Scenario Switcher)
  const loadScenario = useCallback((scenario: ScenarioType) => {
    setState((prev) => {
      const now = Date.now();
      const user = prev.currentUser;

      switch (scenario) {
        case 'EVENT_AVAILABLE':
          return {
            ...prev,
            activeScenario: scenario,
          };

        case 'EVENT_SOLD_OUT':
          return {
            ...prev,
            activeScenario: scenario,
          };

        case 'WAITING_POSITION':
          return {
            ...prev,
            activeScenario: scenario,
            waitlistEntries: [
              ...prev.waitlistEntries.filter(
                (w) => !(w.eventId === 'evt-3' && w.userId === user.id)
              ),
              {
                id: `wl-user-${now}`,
                eventId: 'evt-3',
                userId: user.id,
                sequenceNo: 3,
                status: 'WAITING',
                joinedAt: new Date().toISOString(),
              },
            ],
          };

        case 'ACTIVE_OFFER': {
          const offerId = `offer-${now}`;
          const resId = `res-offer-${now}`;
          const wlId = `wl-offer-${now}`;
          const expiresAt = new Date(now + 5 * 60 * 1000).toISOString();

          return {
            ...prev,
            activeScenario: scenario,
            reservations: [
              ...prev.reservations.filter((r) => r.id !== resId),
              {
                id: resId,
                eventId: 'evt-5',
                userId: user.id,
                source: 'WAITLIST_OFFER',
                status: 'HOLD',
                priceVnd: 350000,
                expiresAt,
                createdAt: new Date().toISOString(),
              },
            ],
            waitlistEntries: [
              ...prev.waitlistEntries.filter(
                (w) => !(w.eventId === 'evt-5' && w.userId === user.id)
              ),
              {
                id: wlId,
                eventId: 'evt-5',
                userId: user.id,
                sequenceNo: 1,
                status: 'OFFERED',
                joinedAt: new Date(now - 3600000).toISOString(),
              },
            ],
            offers: [
              ...prev.offers.filter((o) => !(o.eventId === 'evt-5' && o.userId === user.id)),
              {
                id: offerId,
                reservationId: resId,
                waitlistEntryId: wlId,
                eventId: 'evt-5',
                userId: user.id,
                status: 'PENDING',
                expiresAt,
                createdAt: new Date().toISOString(),
              },
            ],
          };
        }

        case 'EXPIRED_OFFER': {
          const offerId = `offer-exp-${now}`;
          const resId = `res-exp-${now}`;
          const wlId = `wl-exp-${now}`;
          const pastDate = new Date(now - 60 * 1000).toISOString();

          return {
            ...prev,
            activeScenario: scenario,
            reservations: [
              ...prev.reservations,
              {
                id: resId,
                eventId: 'evt-5',
                userId: user.id,
                source: 'WAITLIST_OFFER',
                status: 'EXPIRED',
                priceVnd: 350000,
                expiresAt: pastDate,
                createdAt: new Date(now - 360000).toISOString(),
              },
            ],
            waitlistEntries: [
              ...prev.waitlistEntries,
              {
                id: wlId,
                eventId: 'evt-5',
                userId: user.id,
                sequenceNo: 1,
                status: 'EXPIRED',
                joinedAt: new Date(now - 3600000).toISOString(),
              },
            ],
            offers: [
              ...prev.offers,
              {
                id: offerId,
                reservationId: resId,
                waitlistEntryId: wlId,
                eventId: 'evt-5',
                userId: user.id,
                status: 'EXPIRED',
                expiresAt: pastDate,
                createdAt: new Date(now - 360000).toISOString(),
              },
            ],
          };
        }

        case 'EXPIRING_HOLD': {
          const holdResId = `res-hold-30s-${now}`;
          const expiresAt = new Date(now + 30 * 1000).toISOString();

          return {
            ...prev,
            activeScenario: scenario,
            reservations: [
              ...prev.reservations.filter((r) => r.id !== holdResId),
              {
                id: holdResId,
                eventId: 'evt-4',
                userId: user.id,
                source: 'DIRECT',
                status: 'HOLD',
                priceVnd: 220000,
                expiresAt,
                createdAt: new Date().toISOString(),
              },
            ],
          };
        }

        case 'EMPTY_STATE':
          return {
            ...prev,
            activeScenario: scenario,
            reservations: prev.reservations.filter((r) => r.userId !== user.id),
            waitlistEntries: prev.waitlistEntries.filter((w) => w.userId !== user.id),
            offers: prev.offers.filter((o) => o.userId !== user.id),
          };

        default:
          return getInitialState();
      }
    });
  }, []);

  const resetStore = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Bỏ qua
    }
    setState(getInitialState());
  }, []);

  const contextValue = useMemo(
    () => ({
      state,
      currentUser,
      isHydrated,
      switchUser,
      getEvent,
      getAvailableTickets,
      getUserReservations,
      getUserWaitlist,
      getUserOffers,
      getReservation,
      getOffer,
      createReservation,
      confirmReservation,
      cancelReservation,
      joinWaitlist,
      leaveWaitlist,
      acceptOffer,
      declineOffer,
      expireOffer,
      expireReservation,
      promoteNextWaitlist,
      createEvent,
      registerUser,
      loadScenario,
      resetStore,
    }),
    [
      state,
      currentUser,
      isHydrated,
      switchUser,
      getEvent,
      getAvailableTickets,
      getUserReservations,
      getUserWaitlist,
      getUserOffers,
      getReservation,
      getOffer,
      createReservation,
      confirmReservation,
      cancelReservation,
      joinWaitlist,
      leaveWaitlist,
      acceptOffer,
      declineOffer,
      expireOffer,
      expireReservation,
      promoteNextWaitlist,
      createEvent,
      registerUser,
      loadScenario,
      resetStore,
    ]
  );

  return <MockStoreContext.Provider value={contextValue}>{children}</MockStoreContext.Provider>;
};

export const useMockStore = () => {
  const context = useContext(MockStoreContext);
  if (!context) {
    throw new Error('useMockStore phải được sử dụng bên trong MockStoreProvider');
  }
  return context;
};
