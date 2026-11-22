'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMockStore } from '@lib/mock/store';
import { cancelReservation as apiCancelReservation, getMyReservations, type ApiReservation } from '@lib/api/reservations';
import { getApiErrorMessage, tokenStorage } from '@lib/api/client';
import { useClientTime } from '@lib/hooks/useClientTime';
import { formatVND, formatDateVN } from '@lib/utils/format';
import Countdown from '@components/Countdown/Countdown';
import ConfirmDialog from '@components/Modal/ConfirmDialog';
import {
  Calendar,
  MapPin,
  CheckCircle2,
  Clock,
  XCircle,
  History,
  ShieldCheck,
  ArrowRight,
  Compass,
} from 'lucide-react';

type TicketTab = 'CONFIRMED' | 'HOLD' | 'HISTORY';

const MyTicketsPage: React.FC = () => {
  const { state, getUserReservations, getEvent, cancelReservation, isHydrated } = useMockStore();
  const now = useClientTime();
  const [apiReservations, setApiReservations] = useState<ApiReservation[] | null>(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!isHydrated || !tokenStorage.get()) return;
    let active = true;
    setApiLoading(true);
    getMyReservations()
      .then((items) => { if (active) setApiReservations(items); })
      .catch((error: unknown) => { if (active) { setApiReservations([]); setApiError(getApiErrorMessage(error, 'Không thể tải danh sách vé từ máy chủ.')); } })
      .finally(() => { if (active) setApiLoading(false); });
    return () => { active = false; };
  }, [isHydrated]);

  const [activeTab, setActiveTab] = useState<TicketTab>('CONFIRMED');
  const [selectedTicketToCancel, setSelectedTicketToCancel] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const reservations = isHydrated ? (apiReservations ?? getUserReservations()) : [];
  const confirmedTickets = reservations.filter((r) => r.status === 'CONFIRMED');
  const holdTickets = reservations.filter(
    (r) => r.status === 'HOLD' && new Date(r.expiresAt).getTime() > now
  );
  const historyTickets = reservations.filter(
    (r) =>
      r.status === 'CANCELLED' ||
      r.status === 'EXPIRED' ||
      (r.status === 'HOLD' && new Date(r.expiresAt).getTime() <= now)
  );

  const tabs: { id: TicketTab; label: string; count: number; Icon: typeof ShieldCheck }[] = [
    { id: 'CONFIRMED', label: 'Vé đã xác nhận', count: confirmedTickets.length, Icon: ShieldCheck },
    { id: 'HOLD', label: 'Đang giữ chỗ', count: holdTickets.length, Icon: Clock },
    { id: 'HISTORY', label: 'Lịch sử', count: historyTickets.length, Icon: History },
  ];

  const displayedList =
    activeTab === 'CONFIRMED'
      ? confirmedTickets
      : activeTab === 'HOLD'
        ? holdTickets
        : historyTickets;

  const handleConfirmCancel = async () => {
    if (!selectedTicketToCancel) return;
    const id = selectedTicketToCancel;
    setSelectedTicketToCancel(null);
    try {
      if (apiReservations) {
        const updated = await apiCancelReservation(id);
        setApiReservations((current) => current?.map((item) => item.id === id ? updated : item) ?? []);
      } else {
        const result = cancelReservation(id);
        if (!result.success) throw new Error(result.message || 'Không thể hủy vé.');
      }
      setFeedbackMessage('Đã hủy vé thành công. Chỗ ngồi đã được trả lại kho sự kiện.');
      setTimeout(() => setFeedbackMessage(null), 4000);
    } catch (error) {
      setApiError(getApiErrorMessage(error, error instanceof Error ? error.message : 'Không thể hủy vé.'));
    }
  };

  return (
    <div className='ef-container-md'>
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontSize: '1.75rem',
            fontWeight: 700,
            marginBottom: 6,
            letterSpacing: '-0.02em',
          }}
        >
          Vé của tôi
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem' }}>
          Quản lý các vé đã xác nhận, vé đang giữ chỗ thanh toán và lịch sử giao dịch.
        </p>
      </div>

      {feedbackMessage && (
        <div
          className='ef-badge-success'
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            marginBottom: 24,
            display: 'flex',
            gap: 10,
            fontSize: '0.88rem',
          }}
        >
          <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {apiLoading && <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>Đang đồng bộ vé với máy chủ...</p>}
      {apiError && <p className='ef-badge-danger' style={{ padding: 12, marginBottom: 16 }}>{apiError}</p>}
      {/* Tabs */}
      <div
        role='tablist'
        style={{
          display: 'flex',
          gap: 6,
          borderBottom: '1px solid var(--border)',
          marginBottom: 24,
          flexWrap: 'wrap',
        }}
      >
        {tabs.map(({ id, label, count, Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type='button'
              role='tab'
              aria-selected={isActive}
              onClick={() => setActiveTab(id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                borderBottom: isActive ? '2px solid var(--action)' : '2px solid transparent',
                color: isActive ? 'var(--text)' : 'var(--text-muted)',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.88rem',
                marginBottom: -1,
              }}
            >
              <Icon size={16} />
              <span>
                {label} ({count})
              </span>
            </button>
          );
        })}
      </div>

      {/* Tickets List */}
      {displayedList.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {displayedList.map((res) => {
            const event = ('event' in res && res.event) ? res.event : getEvent(res.eventId);
            if (!event) return null;

            const isHold = res.status === 'HOLD' && new Date(res.expiresAt).getTime() > now;
            const isConfirmed = res.status === 'CONFIRMED';
            const isWaitlistOffer = res.source === 'WAITLIST_OFFER';
            const relatedOffer = isWaitlistOffer
              ? state.offers.find((o) => o.reservationId === res.id)
              : undefined;

            const badge = isConfirmed
              ? { cls: 'ef-badge ef-badge-success', text: 'Vé hợp lệ' }
              : isHold
                ? { cls: 'ef-badge ef-badge-warning', text: 'Đang giữ chỗ' }
                : {
                    cls: 'ef-badge ef-badge-neutral',
                    text: res.status === 'CANCELLED' ? 'Đã hủy' : 'Đã hết hạn',
                  };

            return (
              <div
                key={res.id}
                className='ef-card'
                style={{
                  padding: 20,
                  display: 'flex',
                  gap: 20,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <img
                  src={event.poster}
                  alt={event.title}
                  style={{
                    width: 100,
                    height: 100,
                    borderRadius: 8,
                    objectFit: 'cover',
                    flexShrink: 0,
                  }}
                />

                <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                      }}
                    >
                      {event.category}
                    </span>
                    <span className={badge.cls} style={{ padding: '2px 8px', fontSize: '0.72rem' }}>
                      {badge.text}
                    </span>
                  </div>

                  <h2
                    style={{
                      fontSize: '1.05rem',
                      fontWeight: 700,
                      marginBottom: 6,
                      lineHeight: 1.35,
                      wordBreak: 'break-word',
                    }}
                  >
                    {event.title}
                  </h2>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)',
                      marginBottom: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Calendar size={13} />
                      <span>{formatDateVN(event.startsAt)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <MapPin size={13} />
                      <span>
                        {event.venue}, {event.city}
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: 16,
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)',
                      flexWrap: 'wrap',
                    }}
                  >
                    {res.ticketCode && (
                      <div>
                        Mã vé:{' '}
                        <strong
                          style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}
                        >
                          {res.ticketCode}
                        </strong>
                      </div>
                    )}
                    <div>
                      Giá vé:{' '}
                      <strong style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                        {res.priceVnd === 0 ? 'Miễn phí' : formatVND(res.priceVnd)}
                      </strong>
                    </div>
                    <div>
                      Nguồn:{' '}
                      <span>{isWaitlistOffer ? 'Quyền mua từ hàng chờ' : 'Đặt trực tiếp'}</span>
                    </div>
                  </div>
                </div>

                {/* Action Column */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    minWidth: 180,
                    alignItems: 'stretch',
                  }}
                >
                  {isConfirmed && 'receiptContent' in res && res.receiptContent && (
                    <details
                      style={{
                        marginBottom: 8,
                        padding: '8px 10px',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        fontSize: '0.8rem',
                      }}
                    >
                      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                        Xem biên lai điện tử
                      </summary>
                      <pre
                        style={{
                          marginTop: 8,
                          whiteSpace: 'pre-wrap',
                          overflowWrap: 'anywhere',
                          color: 'var(--text-muted)',
                          fontSize: '0.74rem',
                        }}
                      >
                        {JSON.stringify(res.receiptContent, null, 2)}
                      </pre>
                    </details>
                  )}
                  {isHold ? (
                    <div>
                      <div style={{ marginBottom: 8 }}>
                        <Countdown expiresAt={res.expiresAt} compact />
                      </div>
                      <Link
                        href={
                          isWaitlistOffer
                            ? relatedOffer
                              ? `/offers/${relatedOffer.id}`
                              : '/my-waitlist'
                            : `/checkout/${res.id}`
                        }
                        className='ef-btn ef-btn-primary ef-btn-full'
                        style={{ padding: '9px 16px', fontSize: '0.86rem' }}
                      >
                        <span>{isWaitlistOffer ? 'Xem lượt mua' : 'Tiếp tục xác nhận'}</span>
                        <ArrowRight size={15} />
                      </Link>
                    </div>
                  ) : isConfirmed ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <Link
                        href={`/events/${event.slug}`}
                        className='ef-btn ef-btn-secondary'
                        style={{
                          padding: '8px 14px',
                          fontSize: '0.84rem',
                          backgroundColor: '#f4f4f5',
                        }}
                      >
                        <span>Xem sự kiện</span>
                      </Link>
                      <button
                        type='button'
                        onClick={() => setSelectedTicketToCancel(res.id)}
                        className='ef-btn ef-btn-danger'
                        style={{
                          padding: '7px 12px',
                          fontSize: '0.8rem',
                          backgroundColor: 'var(--surface)',
                        }}
                      >
                        <XCircle size={14} />
                        <span>Hủy vé này</span>
                      </button>
                    </div>
                  ) : (
                    <Link
                      href={`/events/${event.slug}`}
                      className='ef-btn ef-btn-secondary'
                      style={{
                        padding: '8px 14px',
                        fontSize: '0.82rem',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <span>Xem lại sự kiện</span>
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className='ef-card' style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: 6 }}>
            {activeTab === 'CONFIRMED'
              ? 'Bạn chưa có vé xác nhận nào'
              : activeTab === 'HOLD'
                ? 'Không có vé nào đang trong thời gian giữ chỗ'
                : 'Chưa có lịch sử giao dịch vé nào'}
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 20 }}>
            Khám phá các sự kiện đang mở bán để đặt vé hoặc tham gia danh sách chờ.
          </p>
          <Link href='/' className='ef-btn ef-btn-primary'>
            <Compass size={16} />
            <span>Khám phá sự kiện ngay</span>
          </Link>
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(selectedTicketToCancel)}
        title='Hủy vé đã mua?'
        message='Khi hủy, vé của bạn sẽ bị vô hiệu hóa và chỗ ngồi sẽ được hoàn lại vào kho sự kiện để cấp cho người đang chờ. Thao tác này không thể hoàn tác.'
        confirmText='Xác nhận hủy vé'
        cancelText='Giữ lại vé'
        isDestructive
        onConfirm={handleConfirmCancel}
        onCancel={() => setSelectedTicketToCancel(null)}
      />
    </div>
  );
};

export default MyTicketsPage;
