'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth, loginRedirectPath } from '@lib/auth/AuthProvider';
import { joinWaitlist as apiJoinWaitlist } from '@lib/api/waitlist';
import { getApiErrorMessage, getApiErrorStatus } from '@lib/api/client';
import { getEventBySlug, type EventDetailResponse } from '@lib/api/events';
import { useMockStore } from '@lib/mock/store';
import type { Event } from '@lib/mock/types';
import { useClientTime } from '@lib/hooks/useClientTime';
import { formatVND, formatDateVN } from '@lib/utils/format';
import {
  Calendar,
  MapPin,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Hourglass,
  Clock,
  Ticket,
  Info,
  AlertCircle,
  ImageOff,
} from 'lucide-react';

const REAL_BOOKING_DISABLED_MESSAGE =
  'Chức năng đặt vé trực tiếp cho sự kiện thật chưa được kết nối API. Vui lòng quay lại sau.';

/** Kết quả gọi GET /api/events/:slug, gắn kèm slug để bỏ qua kết quả cũ khi đổi trang. */
type EventLoadResult =
  | { slug: string; state: 'real'; event: EventDetailResponse }
  | { slug: string; state: 'notFound' }
  | { slug: string; state: 'error'; message: string };

const EventDetailPage: React.FC = () => {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;
  const { status, loggedOutByUser } = useAuth();

  const { getEvent, getAvailableTickets, getUserReservations, createReservation, isHydrated } =
    useMockStore();
  const now = useClientTime();

  const [loadResult, setLoadResult] = useState<EventLoadResult | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadingAction, setLoadingAction] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  // ST-010: Lấy sự kiện thật từ Backend. Chờ AuthProvider xác định phiên xong để
  // interceptor gửi đúng JWT (hoặc không gửi) và Backend trả userContext tương ứng.
  useEffect(() => {
    if (status === 'loading' || !slug) return;
    let active = true;
    getEventBySlug(slug)
      .then((data) => {
        if (active) setLoadResult({ slug, state: 'real', event: data });
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (getApiErrorStatus(err) === 404) {
          setLoadResult({ slug, state: 'notFound' });
        } else {
          setLoadResult({
            slug,
            state: 'error',
            message: getApiErrorMessage(err, 'Không thể tải thông tin sự kiện. Vui lòng thử lại.'),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [slug, status, reloadKey]);

  const currentResult = status !== 'loading' && loadResult?.slug === slug ? loadResult : null;

  if (!currentResult || (currentResult.state === 'notFound' && !isHydrated)) {
    return <div className='ef-loading'>Đang tải thông tin sự kiện...</div>;
  }

  if (currentResult.state === 'error') {
    return (
      <div className='ef-container-sm'>
        <div className='ef-icon-circle ef-icon-circle-danger'>
          <AlertCircle size={32} />
        </div>
        <h1 style={{ fontSize: '1.45rem', fontWeight: 700, marginBottom: 12 }}>
          Không thể tải sự kiện
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginBottom: 24 }}>
          {currentResult.message}
        </p>
        <button
          type='button'
          className='ef-btn ef-btn-primary'
          onClick={() => {
            setLoadResult(null);
            setReloadKey((k) => k + 1);
          }}
        >
          <span>Thử lại</span>
        </button>
      </div>
    );
  }

  // HTTP 200 → dùng dữ liệu thật; HTTP 404 → thử sự kiện Mock (demo) theo slug.
  const apiEvent = currentResult.state === 'real' ? currentResult.event : null;
  const event: Event | undefined = apiEvent ?? getEvent(slug);
  const isRealEvent = apiEvent !== null;

  if (!event) {
    return (
      <div className='ef-container-sm'>
        <div className='ef-icon-circle ef-icon-circle-danger'>
          <AlertCircle size={32} />
        </div>
        <h1 style={{ fontSize: '1.45rem', fontWeight: 700, marginBottom: 12 }}>
          Không tìm thấy sự kiện
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginBottom: 24 }}>
          Sự kiện với đường dẫn <code>{slug}</code> không tồn tại hoặc đã bị gỡ bỏ.
        </p>
        <Link href='/' className='ef-btn ef-btn-primary'>
          <ArrowLeft size={16} />
          <span>Quay lại danh sách sự kiện</span>
        </Link>
      </div>
    );
  }

  // Sự kiện thật: số vé do Backend tính. Sự kiện Mock: giữ cách tính của Mock Store.
  const available = apiEvent ? apiEvent.availableTickets : getAvailableTickets(event);
  const isSoldOut = available <= 0;

  const isNotExpired = (iso: string) => now === 0 || new Date(iso).getTime() > now;

  // Sự kiện thật: trạng thái người dùng lấy từ userContext (null khi chưa đăng nhập).
  // Sự kiện Mock: giữ nguyên dữ liệu Mock Store; không trộn hàng chờ/offer thật vào.
  const userContext = apiEvent?.userContext ?? null;
  const realReservation = userContext?.activeReservation ?? null;
  const mockReservations = isRealEvent ? [] : getUserReservations();

  const activeConfirmed = isRealEvent
    ? realReservation?.status === 'CONFIRMED'
      ? realReservation
      : undefined
    : mockReservations.find((r) => r.eventId === event.id && r.status === 'CONFIRMED');
  const activeHold = isRealEvent
    ? realReservation?.status === 'HOLD' && isNotExpired(realReservation.expiresAt)
      ? realReservation
      : undefined
    : mockReservations.find(
        (r) =>
          r.eventId === event.id && r.status === 'HOLD' && new Date(r.expiresAt).getTime() > now
      );
  const activeOffer =
    userContext?.activeOffer && isNotExpired(userContext.activeOffer.expiresAt)
      ? userContext.activeOffer
      : null;
  const activeWaitlist = userContext?.activeWaitlist ?? null;

  const handleBookTicket = () => {
    // Sự kiện thật: tuyệt đối không tạo đơn giả trong Mock Store.
    if (isRealEvent) {
      setErrorMessage(REAL_BOOKING_DISABLED_MESSAGE);
      return;
    }
    setLoadingAction(true);
    setErrorMessage(null);
    setTimeout(() => {
      const res = createReservation(event.id);
      setLoadingAction(false);
      if (res.success && res.reservation) router.push(`/checkout/${res.reservation.id}`);
      else setErrorMessage(res.message || 'Không thể tạo đơn giữ vé. Vui lòng thử lại.');
    }, 350);
  };

  const handleJoinWaitlist = async () => {
    if (status === 'anonymous') {
      router.push(loginRedirectPath(`/events/${slug}`, loggedOutByUser));
      return;
    }
    if (!isRealEvent) {
      setErrorMessage(
        'Hàng chờ thật tạm khóa (BLOCKED_UPSTREAM: ST-010). Sự kiện cần được nạp qua GET /api/events/:slug khi hoàn thành ST-010.'
      );
      return;
    }
    setLoadingAction(true);
    setErrorMessage(null);
    try {
      await apiJoinWaitlist(event.id);
      router.push('/my-waitlist');
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, 'Không thể tham gia hàng chờ. Vui lòng thử lại.'));
    } finally {
      setLoadingAction(false);
    }
  };

  const linkCta = activeConfirmed
    ? {
        cls: 'ef-badge-success',
        Icon: CheckCircle2,
        notice: 'Bạn đã có vé xác nhận',
        href: '/my-tickets',
        btn: 'Xem vé của tôi',
      }
    : activeHold
      ? {
          cls: 'ef-badge-warning',
          Icon: Clock,
          notice: 'Đang có 1 lượt giữ chỗ',
          href: `/checkout/${activeHold.id}`,
          btn: 'Tiếp tục xác nhận vé',
        }
      : activeOffer
        ? {
            cls: 'ef-badge-warning',
            Icon: Clock,
            notice: 'Đến lượt mua vé của bạn!',
            href: `/offers/${activeOffer.id}`,
            btn: 'Xem lượt mua vé',
          }
        : activeWaitlist
          ? {
              cls: 'ef-badge-neutral',
              Icon: Hourglass,
              notice: `Đang ở số thứ tự #${activeWaitlist.sequenceNo}${activeWaitlist.currentRank ? ` (Vị trí #${activeWaitlist.currentRank})` : ''}`,
              href: '/my-waitlist',
              btn: 'Xem danh sách chờ',
            }
          : null;

  const renderActionContent = (isMobileBar = false) => {
    if (linkCta) {
      const { cls, Icon, notice, href, btn } = linkCta;
      return (
        <div style={{ width: '100%' }}>
          {!isMobileBar && (
            <div
              className={cls}
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: '0.84rem',
                fontWeight: 600,
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Icon size={16} />
              <span>{notice}</span>
            </div>
          )}
          <Link
            href={href}
            className='ef-btn ef-btn-primary ef-btn-full'
            style={{ padding: isMobileBar ? '10px 16px' : '12px' }}
          >
            <span>{btn}</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      );
    }

    if (!isSoldOut && isRealEvent) {
      return (
        <div style={{ width: '100%' }}>
          <button
            type='button'
            disabled
            className='ef-btn ef-btn-secondary ef-btn-full'
            style={{
              padding: isMobileBar ? '11px 18px' : '13px',
              fontSize: '0.9rem',
              cursor: 'not-allowed',
              opacity: 0.85,
            }}
            title={REAL_BOOKING_DISABLED_MESSAGE}
          >
            <Ticket size={16} />
            <span>Đặt vé (Chưa mở)</span>
          </button>
          {!isMobileBar && (
            <div
              style={{
                fontSize: '0.76rem',
                color: 'var(--text-muted)',
                textAlign: 'center',
                marginTop: 8,
              }}
            >
              {REAL_BOOKING_DISABLED_MESSAGE}
            </div>
          )}
        </div>
      );
    }

    if (!isSoldOut) {
      return (
        <button
          type='button'
          onClick={handleBookTicket}
          disabled={loadingAction}
          className='ef-btn ef-btn-primary ef-btn-full'
          style={{ padding: isMobileBar ? '11px 18px' : '13px', fontSize: '0.92rem' }}
        >
          <Ticket size={16} />
          <span>{loadingAction ? 'Đang xử lý...' : 'Đặt vé ngay'}</span>
        </button>
      );
    }

    if (!isRealEvent) {
      return (
        <div style={{ width: '100%' }}>
          <button
            type='button'
            disabled
            className='ef-btn ef-btn-secondary ef-btn-full'
            style={{
              padding: isMobileBar ? '11px 18px' : '13px',
              fontSize: '0.9rem',
              cursor: 'not-allowed',
              opacity: 0.85,
            }}
            title='Chờ API sự kiện thật (ST-010) từ Thành viên 2'
          >
            <Hourglass size={16} />
            <span>Hàng chờ thật (Chờ ST-010)</span>
          </button>
          {!isMobileBar && (
            <div
              style={{
                fontSize: '0.76rem',
                color: 'var(--text-muted)',
                textAlign: 'center',
                marginTop: 8,
              }}
            >
              Sự kiện mẫu (mock). Kết nối hàng chờ thật chờ API ST-010.
            </div>
          )}
        </div>
      );
    }

    return (
      <div style={{ width: '100%' }}>
        <button
          type='button'
          onClick={handleJoinWaitlist}
          disabled={loadingAction}
          className='ef-btn ef-btn-primary ef-btn-full'
          style={{ padding: isMobileBar ? '11px 18px' : '13px', fontSize: '0.92rem' }}
        >
          <Hourglass size={16} />
          <span>{loadingAction ? 'Đang đăng ký...' : 'Tham gia danh sách chờ'}</span>
        </button>
        {!isMobileBar && (
          <div
            style={{
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
              textAlign: 'center',
              marginTop: 8,
            }}
          >
            Thứ tự chờ tiếp theo: <strong>#{event.nextWaitlistSeq}</strong>
          </div>
        )}
      </div>
    );
  };

  const priceDisplay = event.priceVnd === 0 ? 'Miễn phí' : formatVND(event.priceVnd);

  return (
    <div className='ef-container' style={{ marginBottom: 80 }}>
      <nav
        aria-label='Breadcrumb'
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: '0.84rem',
          color: 'var(--text-muted)',
          marginBottom: 20,
        }}
      >
        <Link href='/' style={{ color: 'var(--text)', fontWeight: 500 }}>
          Khám phá
        </Link>
        <span>/</span>
        <span>{event.category}</span>
        <span>/</span>
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{event.title}</span>
      </nav>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 360px',
          gap: 32,
          alignItems: 'start',
        }}
        className='event-detail-grid'
      >
        <div>
          <div
            style={{
              borderRadius: 12,
              overflow: 'hidden',
              backgroundColor: '#f4f4f5',
              aspectRatio: '16 / 9',
              marginBottom: 24,
              border: '1px solid var(--border)',
            }}
          >
            {!imgError ? (
              <img
                src={event.poster}
                alt={event.title}
                onError={() => setImgError(true)}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#71717a',
                  gap: 8,
                }}
              >
                <ImageOff size={36} />
                <span style={{ fontSize: '0.88rem' }}>{event.category}</span>
              </div>
            )}
          </div>

          <div
            style={{
              fontSize: '0.78rem',
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: 8,
            }}
          >
            {event.category}
          </div>

          <h1
            style={{
              fontSize: '1.95rem',
              fontWeight: 700,
              lineHeight: 1.3,
              marginBottom: 16,
              letterSpacing: '-0.02em',
            }}
          >
            {event.title}
          </h1>

          {/* Quick Info */}
          <div
            className='ef-card'
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
              padding: 16,
              marginBottom: 24,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ padding: 8, borderRadius: 6, backgroundColor: '#f4f4f5' }}>
                <Calendar size={18} />
              </div>
              <div>
                <div
                  style={{
                    fontSize: '0.74rem',
                    color: 'var(--text-muted)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                  }}
                >
                  Thời gian
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, marginTop: 2 }}>
                  {formatDateVN(event.startsAt)}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ padding: 8, borderRadius: 6, backgroundColor: '#f4f4f5' }}>
                <MapPin size={18} />
              </div>
              <div>
                <div
                  style={{
                    fontSize: '0.74rem',
                    color: 'var(--text-muted)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                  }}
                >
                  Địa điểm
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, marginTop: 2 }}>
                  {event.venue}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {event.address}, {event.city}
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className='ef-card-lg' style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 12 }}>
              Giới thiệu sự kiện
            </h2>
            <div
              style={{
                fontSize: '0.92rem',
                lineHeight: 1.65,
                color: '#3f3f46',
                whiteSpace: 'pre-line',
              }}
            >
              {event.description}
            </div>
          </div>

          {/* Organizer */}
          <div
            className='ef-card'
            style={{
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: '0.76rem',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                Ban tổ chức
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: 2 }}>
                {event.organizerName}
              </div>
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Xác thực trên nền tảng EventFlow
            </span>
          </div>
        </div>

        {/* Sticky Sidebar */}
        <aside className='ef-card-lg event-sidebar' style={{ position: 'sticky', top: 84 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              Giá vé tham dự
            </div>
            <div
              style={{
                fontSize: '1.65rem',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                marginTop: 2,
              }}
            >
              {priceDisplay}
            </div>
          </div>

          <div
            className={isSoldOut ? 'ef-badge-neutral' : 'ef-badge-success'}
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.84rem',
            }}
          >
            <span style={{ fontWeight: 600 }}>
              {isSoldOut ? 'Đã hết vé trực tiếp' : 'Đang mở bán'}
            </span>
            <span
              style={{ fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}
            >
              {isSoldOut ? 'Hàng chờ mở' : `Còn ${available} vé`}
            </span>
          </div>

          {errorMessage && (
            <div
              className='ef-badge-danger'
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: '0.84rem',
                marginBottom: 16,
              }}
            >
              {errorMessage}
            </div>
          )}

          {renderActionContent(false)}

          <div
            style={{
              marginTop: 20,
              padding: 14,
              borderRadius: 8,
              backgroundColor: 'var(--canvas)',
              border: '1px solid var(--border)',
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              lineHeight: 1.5,
            }}
          >
            <div
              style={{
                fontWeight: 600,
                color: 'var(--text)',
                marginBottom: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Info size={15} />
              <span>Cơ chế đặt vé &amp; Hàng chờ</span>
            </div>
            <ul style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <li>Giữ vé 10 phút để xác nhận thanh toán.</li>
              <li>Khi hết vé, người tham gia xếp hàng theo thứ tự FIFO.</li>
              <li>Vé trả lại được cấp dưới dạng quyền mua vé có thời hạn.</li>
            </ul>
          </div>
        </aside>
      </div>

      {/* Mobile Sticky Bottom Action Bar */}
      <div
        className='mobile-action-bar'
        style={{
          display: 'none',
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'var(--surface)',
          borderTop: '1px solid var(--border)',
          padding: '12px 16px',
          zIndex: 999,
          boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.05)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Giá vé</div>
            <div
              style={{ fontSize: '1.15rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
            >
              {priceDisplay}
            </div>
          </div>
          <div style={{ flex: '1 1 180px', maxWidth: 220 }}>{renderActionContent(true)}</div>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 768px) {
          :global(.event-detail-grid) {
            grid-template-columns: 1fr !important;
          }
          :global(.event-sidebar) {
            position: static !important;
            box-shadow: none !important;
          }
          :global(.mobile-action-bar) {
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
};

export default EventDetailPage;
