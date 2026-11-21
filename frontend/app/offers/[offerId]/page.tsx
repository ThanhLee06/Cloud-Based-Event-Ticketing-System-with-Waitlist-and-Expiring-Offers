'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth, loginRedirectPath } from '@lib/auth/AuthProvider';
import {
  getOffer,
  acceptOffer,
  declineOffer,
  type OfferDetailResponse,
  type AcceptOfferResponse,
} from '@lib/api/offers';
import { getApiErrorMessage } from '@lib/api/client';
import { formatVND, formatDateVN } from '@lib/utils/format';
import { useClientTime } from '@lib/hooks/useClientTime';
import Countdown from '@components/Countdown/Countdown';
import ConfirmDialog from '@components/Modal/ConfirmDialog';
import {
  Calendar,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  ShieldAlert,
  Info,
  XCircle,
  AlertCircle,
  Ticket,
} from 'lucide-react';

// Khung thông báo lỗi hoặc điều hướng trang.
const OfferNotice: React.FC<{
  Icon: typeof AlertCircle;
  title: string;
  desc: React.ReactNode;
  href: string;
  cta: string;
}> = ({ Icon, title, desc, href, cta }) => (
  <div className='ef-container-sm' style={{ textAlign: 'center', padding: '60px 16px' }}>
    <div
      className='ef-icon-circle ef-icon-circle-danger'
      style={{
        margin: '0 auto 16px auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon size={32} />
    </div>
    <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 8 }}>{title}</h1>
    <p
      style={{
        color: 'var(--text-muted)',
        fontSize: '0.92rem',
        marginBottom: 24,
        lineHeight: 1.5,
      }}
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
  const { status, loggedOutByUser } = useAuth();
  const now = useClientTime();
  const [offer, setOffer] = useState<OfferDetailResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isDeclining, setIsDeclining] = useState<boolean>(false);
  const [acceptResult, setAcceptResult] = useState<AcceptOfferResponse | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showDeclineDialog, setShowDeclineDialog] = useState<boolean>(false);
  const hasTriggeredExpireRef = useRef<boolean>(false);

  // Đặt lại cờ kích hoạt hết hạn khi offerId thay đổi.
  useEffect(() => {
    hasTriggeredExpireRef.current = false;
  }, [offerId]);

  // Tải thông tin chi tiết Offer từ Backend API.
  const loadOffer = useCallback(async () => {
    if (!offerId) return;
    try {
      setLoading(true);
      setErrorStatus(null);
      setErrorMessage(null);
      const data = await getOffer(offerId);
      setOffer(data);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { message?: string } } };
      const code = axiosErr.response?.status ?? 500;
      setErrorStatus(code);
      setErrorMessage(getApiErrorMessage(err, 'Không thể tải thông tin quyền mua vé.'));
    } finally {
      setLoading(false);
    }
  }, [offerId]);

  // Kiểm tra phiên đăng nhập và tải dữ liệu.
  useEffect(() => {
    if (status === 'anonymous') {
      router.replace(loginRedirectPath(`/offers/${offerId}`, loggedOutByUser));
      return;
    }
    if (status === 'authenticated') {
      void loadOffer();
    }
  }, [status, loggedOutByUser, offerId, router, loadOffer]);

  // Làm mới thông tin khi bộ đếm giờ kết thúc.
  const handleCountdownExpire = useCallback(() => {
    if (hasTriggeredExpireRef.current) return;
    hasTriggeredExpireRef.current = true;
    void loadOffer();
  }, [loadOffer]);

  // Xử lý xác nhận nhận vé từ Offer.
  const handleAccept = async () => {
    if (!offer || isSubmitting) return;
    try {
      setIsSubmitting(true);
      setActionError(null);
      const res = await acceptOffer(offer.id);
      setAcceptResult(res);
      setOffer((prev) => (prev ? { ...prev, status: 'ACCEPTED' } : prev));
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number } };
      if (axiosErr.response?.status === 410) {
        setActionError('Quyền mua vé đã hết hạn.');
        void loadOffer();
      } else {
        setActionError(getApiErrorMessage(err, 'Xác nhận mua vé thất bại.'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Xử lý từ chối quyền mua vé và chuyển cho người tiếp theo.
  const handleDecline = async () => {
    if (!offer || isDeclining) return;
    try {
      setIsDeclining(true);
      setActionError(null);
      await declineOffer(offer.id);
      setShowDeclineDialog(false);
      setOffer((prev) => (prev ? { ...prev, status: 'DECLINED' } : prev));
      router.push('/my-waitlist');
    } catch (err: unknown) {
      setShowDeclineDialog(false);
      setActionError(getApiErrorMessage(err, 'Từ chối quyền mua vé thất bại.'));
    } finally {
      setIsDeclining(false);
    }
  };

  if (loading || status === 'loading') {
    return (
      <div className='ef-container-sm' style={{ textAlign: 'center', padding: '60px 16px' }}>
        <div className='ef-loading'>Đang tải thông tin quyền mua vé...</div>
      </div>
    );
  }

  // Xử lý lỗi phân quyền hoặc không tìm thấy.
  if (errorStatus === 403) {
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

  if (errorStatus === 404 || !offer) {
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

  if (errorStatus) {
    return (
      <OfferNotice
        Icon={AlertCircle}
        title='Lỗi tải dữ liệu'
        desc={errorMessage || 'Không thể tải thông tin quyền mua vé.'}
        href='/my-waitlist'
        cta='Quay lại danh sách chờ'
      />
    );
  }

  const isExpired =
    offer.status === 'EXPIRED' ||
    (offer.status === 'PENDING' && now > 0 && new Date(offer.expiresAt).getTime() <= now);
  const isAccepted = offer.status === 'ACCEPTED' || !!acceptResult;
  const isDeclined = offer.status === 'DECLINED';
  const isTerminal = isExpired || isAccepted || isDeclined;

  const event = offer.event;
  const priceDisplay = event.priceVnd === 0 ? 'Miễn phí' : formatVND(event.priceVnd);
  const ticketCode = acceptResult?.ticketCode || offer.reservation?.ticketCode;

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
        {isAccepted && (
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
                Vé đã được thêm vào tài khoản của bạn.
                {ticketCode && (
                  <span style={{ display: 'block', marginTop: 4, fontWeight: 600 }}>
                    Mã vé: <code style={{ fontSize: '0.95rem' }}>{ticketCode}</code>
                  </span>
                )}
                <span
                  style={{
                    display: 'block',
                    marginTop: 6,
                    fontSize: '0.8rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  Lưu ý: Trang &quot;Vé của tôi&quot; đồng bộ tự động sẽ hoàn thiện ở ST-021. Mã vé
                  và biên lai của bạn đã được xác nhận an toàn trên cơ sở dữ liệu.
                </span>
              </div>
            </div>
          </div>
        )}
        {actionError && (
          <div
            className='ef-badge-danger'
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              fontSize: '0.86rem',
              marginBottom: 20,
            }}
          >
            {actionError}
          </div>
        )}
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
          {event.poster ? (
            <img
              src={event.poster}
              alt={event.title}
              style={{
                width: 80,
                height: 80,
                borderRadius: 8,
                objectFit: 'cover',
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: 8,
                backgroundColor: 'var(--surface-hover)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Ticket size={28} style={{ color: 'var(--text-muted)' }} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 200 }}>
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
              style={{
                fontWeight: 600,
                color: 'var(--text)',
                fontVariantNumeric: 'tabular-nums',
              }}
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
              style={{
                fontSize: '1.35rem',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {priceDisplay}
            </span>
          </div>
        </div>
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
            <strong>Lưu ý:</strong> Xác nhận để hoàn tất nhận vé ngay lập tức. Nếu quá thời gian đếm
            ngược, quyền mua vé sẽ tự động được thu hồi và chuyển giao cho người tiếp theo.
          </div>
        </div>
        {!isTerminal ? (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              type='button'
              onClick={handleAccept}
              disabled={isSubmitting || isDeclining}
              className='ef-btn ef-btn-primary'
              style={{ flex: '1 1 240px', padding: '13px 20px', fontSize: '0.94rem' }}
            >
              <CheckCircle2 size={18} />
              <span>{isSubmitting ? 'Đang xử lý...' : 'Xác nhận mua vé'}</span>
            </button>
            <button
              type='button'
              onClick={() => setShowDeclineDialog(true)}
              disabled={isSubmitting || isDeclining}
              className='ef-btn ef-btn-danger'
              style={{
                flex: '1 1 140px',
                padding: '13px 16px',
                backgroundColor: 'var(--surface)',
              }}
            >
              Bỏ lượt
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {isAccepted && (
              <button
                type='button'
                disabled
                className='ef-btn ef-btn-secondary'
                style={{
                  flex: '1 1 200px',
                  padding: '12px 20px',
                  opacity: 0.65,
                  cursor: 'not-allowed',
                }}
                title='Trang danh sách vé (/my-tickets) đang chờ kết nối cơ sở dữ liệu thực tế ở ST-021'
              >
                <span>Xem vé của tôi (Chờ ST-021)</span>
              </button>
            )}
            <Link
              href='/my-waitlist'
              className={isAccepted ? 'ef-btn ef-btn-primary' : 'ef-btn ef-btn-secondary'}
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
