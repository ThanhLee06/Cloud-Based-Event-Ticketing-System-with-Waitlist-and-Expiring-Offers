'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useMockStore } from '@lib/mock/store';
import { formatDateVN } from '@lib/utils/format';
import Countdown from '@components/Countdown/Countdown';
import ConfirmDialog from '@components/Modal/ConfirmDialog';
import { Calendar, MapPin, CheckCircle2, ArrowRight, Sparkles } from 'lucide-react';

const MyWaitlistPage: React.FC = () => {
  const { state, getUserWaitlist, getUserOffers, getEvent, leaveWaitlist, isHydrated } =
    useMockStore();

  const [selectedEntryToLeave, setSelectedEntryToLeave] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  if (!isHydrated) {
    return <div className='ef-loading'>Đang tải thông tin danh sách chờ...</div>;
  }

  const waitlistEntries = getUserWaitlist();
  const offers = getUserOffers();

  const activeWaitingList = waitlistEntries.filter((w) => w.status === 'WAITING');
  const offeredList = waitlistEntries.filter((w) => w.status === 'OFFERED');
  const historyList = waitlistEntries.filter(
    (w) => w.status === 'FULFILLED' || w.status === 'CANCELLED' || w.status === 'EXPIRED'
  );

  const handleConfirmLeave = () => {
    if (!selectedEntryToLeave) return;
    const res = leaveWaitlist(selectedEntryToLeave);
    setSelectedEntryToLeave(null);

    if (res.success) {
      setFeedbackMessage(res.message || 'Đã rời danh sách chờ thành công');
      setTimeout(() => setFeedbackMessage(null), 4000);
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
          Danh sách chờ của tôi
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem' }}>
          Theo dõi vị trí hàng chờ FIFO và nhận quyền mua vé khi có vé hoàn lại từ hệ thống.
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

      {/* Offers Ready to Claim */}
      {offeredList.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Sparkles size={20} color='#18181b' />
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>
              Bạn có {offeredList.length} lượt mua vé đang mở
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {offeredList.map((entry) => {
              const event = getEvent(entry.eventId);
              const relatedOffer = offers.find(
                (o) => o.waitlistEntryId === entry.id && o.status === 'PENDING'
              );
              if (!event || !relatedOffer) return null;

              return (
                <div
                  key={entry.id}
                  className='ef-card'
                  style={{
                    padding: '18px 20px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 16,
                    justifyContent: 'space-between',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: 14,
                      alignItems: 'center',
                      flex: '1 1 240px',
                      minWidth: 0,
                    }}
                  >
                    <img
                      src={event.poster}
                      alt={event.title}
                      style={{
                        width: 68,
                        height: 68,
                        borderRadius: 8,
                        objectFit: 'cover',
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <span
                        className='ef-badge ef-badge-warning'
                        style={{ padding: '2px 8px', fontSize: '0.74rem', marginBottom: 4 }}
                      >
                        Lượt mua có thời hạn
                      </span>
                      <h3
                        style={{
                          fontSize: '1.05rem',
                          fontWeight: 700,
                          marginBottom: 4,
                          lineHeight: 1.35,
                          wordBreak: 'break-word',
                        }}
                      >
                        {event.title}
                      </h3>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        Đã có vé trống từ sự kiện. Vui lòng xác nhận trước khi hết hạn.
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <Countdown expiresAt={relatedOffer.expiresAt} compact />
                    <Link
                      href={`/offers/${relatedOffer.id}`}
                      className='ef-btn ef-btn-primary'
                      style={{ padding: '9px 16px', fontSize: '0.86rem', whiteSpace: 'nowrap' }}
                    >
                      <span>Xem lượt mua</span>
                      <ArrowRight size={15} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Currently Waiting */}
      <div style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 14 }}>
          Hàng chờ đang tham gia ({activeWaitingList.length})
        </h2>

        {activeWaitingList.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {activeWaitingList.map((entry) => {
              const event = getEvent(entry.eventId);
              if (!event) return null;

              const currentRank =
                state.waitlistEntries.filter(
                  (w) =>
                    w.eventId === entry.eventId &&
                    w.status === 'WAITING' &&
                    w.sequenceNo < entry.sequenceNo
                ).length + 1;

              return (
                <div
                  key={entry.id}
                  className='ef-card'
                  style={{
                    padding: '18px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 16,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: 16,
                      alignItems: 'center',
                      flex: '1 1 260px',
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        backgroundColor: '#f4f4f5',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        minWidth: 60,
                      }}
                    >
                      <div
                        style={{
                          fontSize: '0.66rem',
                          color: 'var(--text-muted)',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                        }}
                      >
                        Vị trí
                      </div>
                      <div
                        style={{
                          fontSize: '1.25rem',
                          fontWeight: 700,
                          lineHeight: 1.1,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        #{currentRank}
                      </div>
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 500 }}
                      >
                        {event.category} • Tham gia {formatDateVN(entry.joinedAt)}
                      </div>
                      <h3
                        style={{
                          fontSize: '1.05rem',
                          fontWeight: 700,
                          margin: '3px 0 6px 0',
                          lineHeight: 1.35,
                          wordBreak: 'break-word',
                        }}
                      >
                        {event.title}
                      </h3>
                      <div
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--text-muted)',
                          display: 'flex',
                          gap: 12,
                          flexWrap: 'wrap',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <MapPin size={13} />
                          <span>
                            {event.venue}, {event.city}
                          </span>
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Calendar size={13} />
                          <span>{formatDateVN(event.startsAt)}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      flexWrap: 'wrap',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Đăng ký ban đầu: #{entry.sequenceNo}
                    </div>
                    <button
                      type='button'
                      onClick={() => setSelectedEntryToLeave(entry.id)}
                      className='ef-btn ef-btn-secondary'
                      style={{
                        padding: '8px 14px',
                        fontSize: '0.82rem',
                        color: 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Rời hàng chờ
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            className='ef-card'
            style={{
              padding: '32px 16px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '0.88rem',
            }}
          >
            Bạn không có lượt đăng ký chờ nào đang hoạt động.
          </div>
        )}
      </div>

      {/* History */}
      {historyList.length > 0 && (
        <div>
          <h2
            style={{
              fontSize: '1.1rem',
              fontWeight: 700,
              color: 'var(--text-muted)',
              marginBottom: 12,
            }}
          >
            Lịch sử danh sách chờ
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {historyList.map((entry) => {
              const event = getEvent(entry.eventId);
              if (!event) return null;

              const statusText =
                entry.status === 'FULFILLED'
                  ? 'Đã nhận vé thành công'
                  : entry.status === 'CANCELLED'
                    ? 'Đã rời hàng'
                    : 'Đã hết hạn lượt';

              return (
                <div
                  key={entry.id}
                  className='ef-card'
                  style={{
                    padding: '12px 16px',
                    borderRadius: 8,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.84rem',
                    color: 'var(--text-muted)',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <div>
                    <strong style={{ color: 'var(--text)' }}>{event.title}</strong>
                    <span style={{ margin: '0 8px' }}>•</span>
                    <span>Đăng ký #{entry.sequenceNo}</span>
                  </div>
                  <span
                    className={
                      entry.status === 'FULFILLED'
                        ? 'ef-badge ef-badge-success'
                        : 'ef-badge ef-badge-neutral'
                    }
                    style={{ padding: '2px 8px', fontSize: '0.74rem' }}
                  >
                    {statusText}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(selectedEntryToLeave)}
        title='Rời danh sách chờ?'
        message='Khi rời hàng chờ, bạn sẽ mất vị trí ưu tiên hiện tại. Nếu sau này muốn tham gia lại, bạn sẽ nhận số thứ tự mới ở cuối hàng.'
        confirmText='Đồng ý rời'
        cancelText='Ở lại hàng chờ'
        isDestructive
        onConfirm={handleConfirmLeave}
        onCancel={() => setSelectedEntryToLeave(null)}
      />
    </div>
  );
};

export default MyWaitlistPage;
