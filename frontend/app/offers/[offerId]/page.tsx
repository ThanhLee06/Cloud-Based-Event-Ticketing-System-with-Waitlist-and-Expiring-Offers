'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMockStore } from '@lib/mock/store';
import { useClientTime } from '@lib/hooks/useClientTime';
import { formatVND, formatDateVN } from '@lib/utils/format';
import Countdown from '@components/Countdown/Countdown';
import ConfirmDialog from '@components/Modal/ConfirmDialog';
import {
  Calendar,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ShieldAlert,
  Info,
  XCircle,
  AlertCircle,
} from 'lucide-react';

const OfferNotice: React.FC<{
  Icon: typeof AlertCircle;
  title: string;
  desc: React.ReactNode;
  href: string;
  cta: string;
}> = ({ Icon, title, desc, href, cta }) => (
  <div className='ef-container-sm'>
    <div className='ef-icon-circle ef-icon-circle-danger'>
      <Icon size={30} />
    </div>
    <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 8 }}>{title}</h1>
    <p
      style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginBottom: 24, lineHeight: 1.5 }}
    >
      {desc}
    </p>
    <Link href={href} className='ef-btn ef-btn-primary'>
      <ArrowLeft size={16} />
      <span>{cta}</span>
    </Link>
  </div>
);

const OfferDetailPage: React.FC = () => {
  const params = useParams();
  const router = useRouter();
  const offerId = params?.offerId as string;

  const { currentUser, getOffer, getEvent, acceptOffer, declineOffer, expireOffer, isHydrated } =
    useMockStore();
  const now = useClientTime();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDeclineDialog, setShowDeclineDialog] = useState(false);

  if (!isHydrated) {
    return <div className='ef-loading'>Đang tải thông tin quyền mua vé...</div>;
  }

  const offer = getOffer(offerId);
  const event = offer ? getEvent(offer.eventId) : undefined;

  if (!offer || !event) {
    return (
      <OfferNotice
        Icon={AlertCircle}
        title='Không tìm thấy quyền mua vé'
        desc={
          <>
            Mã quyền mua <code>{offerId}</code> không tồn tại hoặc đã bị thu hồi.
          </>
        }
        href='/my-waitlist'
        cta='Quay lại danh sách chờ'
      />
    );
  }

  if (offer.userId !== currentUser.id && currentUser.role !== 'ORGANIZER') {
    return (
      <OfferNotice
        Icon={ShieldAlert}
        title='Không có quyền truy cập'
        desc='Quyền mua vé này thuộc về tài khoản khác. Vui lòng đăng nhập đúng tài khoản sở hữu để tiếp tục.'
        href='/'
        cta='Quay lại Khám phá'
      />
    );
  }

  const isExpired =
    offer.status === 'EXPIRED' ||
    (offer.status === 'PENDING' && new Date(offer.expiresAt).getTime() <= now);
  const isAccepted = offer.status === 'ACCEPTED';
  const isDeclined = offer.status === 'DECLINED';
  const isTerminal = isExpired || isAccepted || isDeclined || isSuccess;

  const handleAccept = () => {
    if (isTerminal) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    setTimeout(() => {
      const res = acceptOffer(offer.id);
      setIsSubmitting(false);
      if (res.success) setIsSuccess(true);
      else setErrorMessage(res.message || 'Xác nhận nhận vé thất bại');
    }, 500);
  };

  const handleDecline = () => {
    declineOffer(offer.id);
    setShowDeclineDialog(false);
    router.push('/my-waitlist');
  };

  const handleCountdownExpire = () => {
    if (offer.status === 'PENDING') expireOffer(offer.id);
  };

  const priceDisplay = event.priceVnd === 0 ? 'Miễn phí' : formatVND(event.priceVnd);

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
        <Link href='/my-waitlist' style={{ fontWeight: 500 }}>
          Danh sách chờ
        </Link>
        <span>/</span>
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>Lượt mua vé</span>
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
              Đến lượt mua vé của bạn
            </h1>
            <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
              Quyền mua vé được cấp từ danh sách chờ FIFO theo thứ tự đăng ký.
            </div>
          </div>
          <span className='ef-badge ef-badge-neutral' style={{ padding: '4px 10px' }}>
            Lượt mua có thời hạn
          </span>
        </div>

        {!isTerminal && (
          <div style={{ marginBottom: 20 }}>
            <Countdown
              expiresAt={offer.expiresAt}
              onExpire={handleCountdownExpire}
              label='Thời gian còn lại để nhận vé:'
            />
          </div>
        )}

        {isExpired && !isAccepted && (
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
                Quyền mua vé đã hết hạn
              </div>
              <div style={{ fontSize: '0.84rem', lineHeight: 1.5 }}>
                Thời hạn nhận vé đã kết thúc. Quyền mua vé này đã được chuyển tiếp cho người chờ
                tiếp theo trong danh sách chờ.
              </div>
            </div>
          </div>
        )}

        {isDeclined && (
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
                Đã từ chối quyền mua vé
              </div>
              <div style={{ fontSize: '0.84rem', lineHeight: 1.5 }}>
                Bạn đã từ chối quyền mua vé này. Lượt mua đã được chuyển giao cho người chờ tiếp
                theo.
              </div>
            </div>
          </div>
        )}

        {(isSuccess || isAccepted) && (
          <div
            className='ef-badge-success'
            style={{ padding: 16, borderRadius: 10, marginBottom: 20, display: 'flex', gap: 12 }}
          >
            <CheckCircle2 size={22} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.94rem', marginBottom: 4 }}>
                Nhận vé thành công!
              </div>
              <div style={{ fontSize: '0.86rem', lineHeight: 1.5 }}>
                Vé đã được thêm vào tài khoản của bạn. Bạn có thể kiểm tra mã vé trong mục Vé của
                tôi.
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

        {/* Pricing */}
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
            <span>1 × Vé tham dự (Dành riêng từ hàng chờ)</span>
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
            <span>Phí dịch vụ</span>
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
            <strong>Lưu ý:</strong> Thanh toán mô phỏng trong bản thử nghiệm. Nhấn xác nhận để nhận
            vé ngay.
          </div>
        </div>

        {/* Action CTAs */}
        {!isTerminal ? (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              type='button'
              onClick={handleAccept}
              disabled={isSubmitting}
              className='ef-btn ef-btn-primary'
              style={{ flex: '1 1 240px', padding: '13px 20px', fontSize: '0.94rem' }}
            >
              <CheckCircle2 size={18} />
              <span>{isSubmitting ? 'Đang xử lý...' : 'Xác nhận mua vé'}</span>
            </button>
            <button
              type='button'
              onClick={() => setShowDeclineDialog(true)}
              disabled={isSubmitting}
              className='ef-btn ef-btn-danger'
              style={{ flex: '1 1 140px', padding: '13px 16px', backgroundColor: 'var(--surface)' }}
            >
              Bỏ lượt
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {(isSuccess || isAccepted) && (
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
              href='/my-waitlist'
              className='ef-btn ef-btn-secondary'
              style={{ flex: '1 1 160px', padding: '12px 18px' }}
            >
              <ArrowLeft size={16} />
              <span>Quay lại danh sách chờ</span>
            </Link>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={showDeclineDialog}
        title='Bỏ lượt mua vé này?'
        message='Khi bỏ lượt, cơ hội nhận vé sẽ được chuyển giao ngay lập tức cho người tiếp theo trong danh sách chờ FIFO. Bạn có chắc chắn muốn bỏ qua?'
        confirmText='Xác nhận bỏ lượt'
        cancelText='Giữ lại'
        isDestructive
        onConfirm={handleDecline}
        onCancel={() => setShowDeclineDialog(false)}
      />
    </div>
  );
};

export default OfferDetailPage;
