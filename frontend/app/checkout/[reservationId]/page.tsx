'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMockStore } from '@lib/mock/store';
import { cancelReservation as apiCancelReservation, confirmReservation as apiConfirmReservation, getReservation as apiGetReservation, type ApiReservation } from '@lib/api/reservations';
import { getApiErrorMessage } from '@lib/api/client';
import { useClientTime } from '@lib/hooks/useClientTime';
import { formatVND, formatDateVN } from '@lib/utils/format';
import Countdown from '@components/Countdown/Countdown';
import ConfirmDialog from '@components/Modal/ConfirmDialog';
import {
  Calendar,
  MapPin,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ShieldAlert,
  Info,
  XCircle,
  AlertCircle,
} from 'lucide-react';

const NoticeState: React.FC<{
  Icon: typeof AlertCircle;
  danger?: boolean;
  title: string;
  desc: React.ReactNode;
  href: string;
  cta: string;
  forwardArrow?: boolean;
}> = ({ Icon, danger, title, desc, href, cta, forwardArrow }) => (
  <div className='ef-container-sm'>
    <div
      className={`ef-icon-circle ${danger ? 'ef-icon-circle-danger' : 'ef-icon-circle-neutral'}`}
    >
      <Icon size={30} />
    </div>
    <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 8 }}>{title}</h1>
    <p
      style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginBottom: 24, lineHeight: 1.5 }}
    >
      {desc}
    </p>
    <Link href={href} className='ef-btn ef-btn-primary'>
      {!forwardArrow && <ArrowLeft size={16} />}
      <span>{cta}</span>
      {forwardArrow && <ArrowRight size={16} />}
    </Link>
  </div>
);

const CheckoutPage: React.FC = () => {
  const params = useParams();
  const router = useRouter();
  const reservationId = params?.reservationId as string;

  const {
    state,
    currentUser,
    getReservation,
    getEvent,
    confirmReservation,
    cancelReservation,
    isHydrated,
  } = useMockStore();
  const now = useClientTime();
  const [apiReservation, setApiReservation] = useState<ApiReservation | null>(null);
  const [apiLoading, setApiLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!isHydrated || !reservationId) return;
    if (getReservation(reservationId)) { setApiLoading(false); return; }
    let active = true;
    apiGetReservation(reservationId)
      .then((value) => { if (active) setApiReservation(value); })
      .catch((error: unknown) => { if (active) setApiError(getApiErrorMessage(error, 'Không thể tải lượt giữ chỗ.')); })
      .finally(() => { if (active) setApiLoading(false); });
    return () => { active = false; };
  }, [isHydrated, reservationId]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  if (!isHydrated) {
    return <div className='ef-loading'>Đang tải thông tin đơn đặt vé...</div>;
  }

  const localReservation = getReservation(reservationId);
  const reservation = localReservation ?? apiReservation;
  const event = localReservation ? getEvent(localReservation.eventId) : apiReservation?.event;

  if (apiLoading && !localReservation) {
    return <div className='ef-loading'>Đang tải thông tin đơn đặt vé...</div>;
  }

  if (!reservation || !event) {
    return (
      <NoticeState
        Icon={AlertCircle}
        danger
        title='Không tìm thấy lượt giữ vé'
        desc={apiError || <>Mã giữ chỗ <code>{reservationId}</code> không tồn tại hoặc đã bị hủy.</>}
        href='/'
        cta='Khám phá sự kiện khác'
      />
    );
  }

  if (reservation.userId !== currentUser.id && currentUser.role !== 'ORGANIZER') {
    return (
      <NoticeState
        Icon={ShieldAlert}
        danger
        title='Không có quyền truy cập'
        desc='Lượt giữ chỗ này thuộc về tài khoản khác. Vui lòng đăng nhập đúng tài khoản sở hữu để tiếp tục.'
        href='/'
        cta='Quay lại Khám phá'
      />
    );
  }

  if (reservation.source === 'WAITLIST_OFFER') {
    const relatedOffer = state.offers.find((o) => o.reservationId === reservation.id);
    return (
      <NoticeState
        Icon={Clock}
        title='Quyền mua vé từ Hàng chờ'
        desc='Lượt giữ chỗ này được cấp từ Danh sách chờ có thời hạn. Vui lòng xác nhận quyền mua vé tại trang Quyền mua vé để đồng bộ trạng thái đơn hàng.'
        href={relatedOffer ? `/offers/${relatedOffer.id}` : '/my-waitlist'}
        cta='Đến trang Quyền mua vé'
        forwardArrow
      />
    );
  }

  const isExpired =
    reservation.status === 'EXPIRED' ||
    (reservation.status === 'HOLD' && new Date(reservation.expiresAt).getTime() <= now);
  const isAlreadyConfirmed = reservation.status === 'CONFIRMED';
  const isCancelled = reservation.status === 'CANCELLED';
  const isTerminal = isExpired || isAlreadyConfirmed || isCancelled || isSuccess;

  const handleConfirmPayment = async () => {
    if (isTerminal) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      if (apiReservation) {
        const updated = await apiConfirmReservation(reservation.id);
        setApiReservation(updated);
        setIsSuccess(true);
      } else {
        const result = confirmReservation(reservation.id);
        if (result.success) setIsSuccess(true);
        else setErrorMessage(result.message || 'Xác nhận thanh toán thất bại');
      }
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, 'Xác nhận thanh toán thất bại'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelHold = async () => {
    setIsSubmitting(true);
    try {
      if (apiReservation) await apiCancelReservation(reservation.id);
      else cancelReservation(reservation.id);
      setShowCancelDialog(false);
      router.push(`/events/${event.slug}`);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, 'Không thể hủy lượt giữ vé.'));
      setShowCancelDialog(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const priceDisplay = reservation.priceVnd === 0 ? 'Miễn phí' : formatVND(reservation.priceVnd);

  return (
    <div style={{ maxWidth: 720, margin: '24px auto 60px auto', padding: '0 16px' }}>
      <nav
        aria-label='Breadcrumb'
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: '0.84rem',
          color: 'var(--text-muted)',
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <Link href='/' style={{ color: 'var(--text)', fontWeight: 500 }}>
          Khám phá
        </Link>
        <span>/</span>
        <Link href={`/events/${event.slug}`} style={{ fontWeight: 500 }}>
          {event.title}
        </Link>
        <span>/</span>
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>Xác nhận vé</span>
      </nav>

      <div className='ef-card-lg'>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            marginBottom: 20,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 700, marginBottom: 4 }}>
              Xác nhận thông tin đặt vé
            </h1>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Mã giữ chỗ: <strong>{reservation.id}</strong>
            </div>
          </div>
          <span className='ef-badge ef-badge-neutral' style={{ padding: '4px 10px' }}>
            Bản trải nghiệm mô phỏng
          </span>
        </div>

        {!isTerminal && (
          <div style={{ marginBottom: 20 }}>
            <Countdown
              expiresAt={reservation.expiresAt}
              label='Vé đang được giữ riêng cho bạn trong:'
            />
          </div>
        )}

        {isExpired && !isAlreadyConfirmed && (
          <div
            className='ef-badge-danger'
            style={{
              padding: '14px 16px',
              borderRadius: 10,
              marginBottom: 20,
              display: 'flex',
              gap: 12,
            }}
          >
            <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 2 }}>
                Lượt giữ vé đã hết thời hạn
              </div>
              <div style={{ fontSize: '0.84rem', lineHeight: 1.5 }}>
                Khoảng thời gian 10 phút đã kết thúc. Vé đã được tự động hoàn lại vào kho hoặc
                chuyển cho người chờ tiếp theo theo thứ tự FIFO.
              </div>
            </div>
          </div>
        )}

        {isCancelled && (
          <div
            className='ef-badge-neutral'
            style={{
              padding: '14px 16px',
              borderRadius: 10,
              marginBottom: 20,
              display: 'flex',
              gap: 12,
            }}
          >
            <XCircle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  marginBottom: 2,
                  color: 'var(--text)',
                }}
              >
                Lượt giữ vé đã được hủy bỏ
              </div>
              <div style={{ fontSize: '0.84rem', lineHeight: 1.5 }}>
                Bạn đã hủy lượt giữ chỗ này. Chỗ ngồi đã được trả lại về kho vé sự kiện.
              </div>
            </div>
          </div>
        )}

        {(isSuccess || isAlreadyConfirmed) && (
          <div
            className='ef-badge-success'
            style={{ padding: 16, borderRadius: 10, marginBottom: 20, display: 'flex', gap: 12 }}
          >
            <CheckCircle2 size={22} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.94rem', marginBottom: 4 }}>
                Đặt vé thành công!
              </div>
              <div style={{ fontSize: '0.86rem', lineHeight: 1.5 }}>
                Mã vé điện tử của bạn:{' '}
                <strong>{reservation.ticketCode || 'EVT-TKT-CONFIRMED'}</strong>. Thông tin vé đã
                được lưu trong mục Vé của tôi.
              </div>
            </div>
          </div>
        )}

        {errorMessage && (
          <div
            className='ef-badge-danger'
            style={{ padding: '12px 16px', borderRadius: 8, fontSize: '0.86rem', marginBottom: 20 }}
          >
            {errorMessage}
          </div>
        )}

        {/* Event Summary */}
        <div
          style={{
            display: 'flex',
            gap: 16,
            padding: 16,
            backgroundColor: 'var(--canvas)',
            borderRadius: 12,
            border: '1px solid var(--border)',
            marginBottom: 24,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <img
            src={event.poster}
            alt={event.title}
            style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div
              style={{
                fontSize: '0.78rem',
                color: 'var(--text-muted)',
                fontWeight: 600,
                marginBottom: 2,
              }}
            >
              {event.category}
            </div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 6, lineHeight: 1.4 }}>
              {event.title}
            </h2>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12,
                fontSize: '0.82rem',
                color: 'var(--text-muted)',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={14} />
                <span>{formatDateVN(event.startsAt)}</span>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <MapPin size={14} />
                <span>
                  {event.venue}, {event.city}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Order Breakdown */}
        <div
          style={{
            borderTop: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
            padding: '16px 0',
            marginBottom: 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.9rem',
              color: 'var(--text-muted)',
              marginBottom: 10,
            }}
          >
            <span>1 × Vé tham dự tiêu chuẩn</span>
            <span
              style={{ fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}
            >
              {priceDisplay}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.9rem',
              color: 'var(--text-muted)',
              marginBottom: 12,
            }}
          >
            <span>Phí xử lý giao dịch</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>0 ₫</span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              paddingTop: 12,
              borderTop: '1px dashed var(--border)',
            }}
          >
            <span style={{ fontSize: '1rem', fontWeight: 700 }}>Tổng thanh toán</span>
            <span
              style={{ fontSize: '1.35rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
            >
              {priceDisplay}
            </span>
          </div>
        </div>

        {/* Demo Note */}
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 8,
            backgroundColor: 'var(--canvas)',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            fontSize: '0.82rem',
            lineHeight: 1.5,
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Info size={18} style={{ flexShrink: 0, color: 'var(--text)' }} />
          <div>
            <strong>Lưu ý:</strong> Đây là bản mô phỏng giao dịch. Nhấn xác nhận để hoàn tất đặt vé
            ngay mà không cần thông tin thanh toán thật.
          </div>
        </div>

        {/* Actions */}
        {!isTerminal ? (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              type='button'
              onClick={handleConfirmPayment}
              disabled={isSubmitting}
              className='ef-btn ef-btn-primary'
              style={{ flex: '1 1 240px', padding: '13px 20px', fontSize: '0.94rem' }}
            >
              <CheckCircle2 size={18} />
              <span>{isSubmitting ? 'Đang xử lý...' : 'Xác nhận đặt vé'}</span>
            </button>
            <button
              type='button'
              onClick={() => setShowCancelDialog(true)}
              disabled={isSubmitting}
              className='ef-btn ef-btn-secondary'
              style={{ flex: '1 1 140px', padding: '13px 16px' }}
            >
              Hủy giữ vé
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {(isSuccess || isAlreadyConfirmed) && (
              <Link
                href='/my-tickets'
                className='ef-btn ef-btn-primary'
                style={{ flex: '1 1 200px', padding: '12px 20px' }}
              >
                <span>Xem vé của tôi</span>
                <ArrowRight size={16} />
              </Link>
            )}
            <Link
              href='/'
              className='ef-btn ef-btn-secondary'
              style={{ flex: '1 1 160px', padding: '12px 18px' }}
            >
              <ArrowLeft size={16} />
              <span>Về trang khám phá</span>
            </Link>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={showCancelDialog}
        title='Hủy giữ vé này?'
        message='Khi hủy, vé sẽ được hoàn lại kho sự kiện ngay lập tức để cấp cho người khác. Bạn có chắc chắn muốn hủy?'
        confirmText='Hủy giữ vé'
        cancelText='Tiếp tục giữ'
        isDestructive
        onConfirm={handleCancelHold}
        onCancel={() => setShowCancelDialog(false)}
      />
    </div>
  );
};

export default CheckoutPage;
