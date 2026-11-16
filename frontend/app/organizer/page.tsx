'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useMockStore } from '@lib/mock/store';
import { formatVND, formatDateVN } from '@lib/utils/format';
import {
  Calendar,
  Clock,
  Hourglass,
  Send,
  CheckCircle2,
  X,
  ExternalLink,
  ShieldAlert,
  Plus,
  ArrowLeft,
  Users,
} from 'lucide-react';

const OrganizerPage: React.FC = () => {
  const { state, currentUser, getAvailableTickets, promoteNextWaitlist, createEvent, isHydrated } =
    useMockStore();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string>('');

  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Âm nhạc');
  const [newVenue, setNewVenue] = useState('');
  const [newCity, setNewCity] = useState('TP. Hồ Chí Minh');
  const [newPrice, setNewPrice] = useState('0');
  const [newCapacity, setNewCapacity] = useState('50');
  const [newStartsAt, setNewStartsAt] = useState('');
  const [newSalesCloseAt, setNewSalesCloseAt] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showCreateModal) return;
    const now = Date.now();
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const fmtLocal = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

    setNewStartsAt(fmtLocal(new Date(now + 7 * 86400000)));
    setNewSalesCloseAt(fmtLocal(new Date(now + 6 * 86400000)));

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowCreateModal(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCreateModal]);

  if (!isHydrated) {
    return <div className='ef-loading'>Đang tải bảng điều khiển Ban tổ chức...</div>;
  }

  if (currentUser.role !== 'ORGANIZER') {
    return (
      <div className='ef-container-sm'>
        <div className='ef-icon-circle ef-icon-circle-danger'>
          <ShieldAlert size={32} />
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 10 }}>
          Khu vực dành cho Ban tổ chức
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginBottom: 28 }}>
          Tài khoản hiện tại của bạn (<strong>{currentUser.name}</strong>) là tài khoản{' '}
          <em>Người mua vé</em> và không có quyền truy cập kênh quản lý sự kiện.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href='/' className='ef-btn ef-btn-primary'>
            <ArrowLeft size={16} />
            <span>Quay lại Khám phá</span>
          </Link>
          <Link href='/login?next=/organizer' className='ef-btn ef-btn-secondary'>
            Đăng nhập bằng tài khoản Ban tổ chức
          </Link>
        </div>
      </div>
    );
  }

  const myEvents = state.events.filter((e) => e.organizerId === currentUser.id);
  const myEventIds = new Set(myEvents.map((e) => e.id));
  const totalSold = myEvents.reduce((acc, e) => acc + e.soldCount, 0);
  const totalReserved = myEvents.reduce((acc, e) => acc + e.reservedCount, 0);
  const totalWaiting = state.waitlistEntries.filter(
    (w) => myEventIds.has(w.eventId) && w.status === 'WAITING'
  ).length;
  const totalOffersActive = state.offers.filter(
    (o) => myEventIds.has(o.eventId) && o.status === 'PENDING'
  ).length;

  const metrics = [
    {
      label: 'Sự kiện của tôi',
      val: myEvents.length,
      sub: 'Đang quản lý',
      color: '#18181b',
      Icon: Calendar,
    },
    {
      label: 'Vé đã bán',
      val: totalSold,
      sub: 'Xác nhận thành công',
      color: '#166534',
      Icon: CheckCircle2,
    },
    {
      label: 'Đang giữ chỗ',
      val: totalReserved,
      sub: 'Trong 10 phút giữ vé',
      color: '#92400e',
      Icon: Clock,
    },
    {
      label: 'Trong hàng chờ',
      val: totalWaiting,
      sub: 'Chờ vé FIFO',
      color: '#18181b',
      Icon: Hourglass,
    },
    {
      label: 'Lượt mua đang mở',
      val: totalOffersActive,
      sub: 'Quyền mua có hạn',
      color: '#18181b',
      Icon: Users,
    },
  ];

  const activeSelectedEventId = selectedEventId || myEvents[0]?.id || '';
  const selectedEvent = myEvents.find((e) => e.id === activeSelectedEventId) || myEvents[0];
  const selectedEventWaitlist = selectedEvent
    ? state.waitlistEntries
        .filter((w) => w.eventId === selectedEvent.id)
        .sort((a, b) => a.sequenceNo - b.sequenceNo)
    : [];

  const handlePromote = (evtId: string) => {
    const res = promoteNextWaitlist(evtId);
    setActionFeedback(res.message || 'Đã thực hiện thao tác cấp offer');
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!newTitle.trim() || !newVenue.trim()) {
      setFormError('Vui lòng nhập đầy đủ tên sự kiện và địa điểm tổ chức');
      return;
    }
    const price = parseInt(newPrice, 10);
    if (isNaN(price) || price < 0) {
      setFormError('Giá vé phải là số nguyên không âm (>= 0)');
      return;
    }
    const capacity = parseInt(newCapacity, 10);
    if (isNaN(capacity) || capacity <= 0) {
      setFormError('Sức chứa sự kiện phải lớn hơn 0');
      return;
    }
    const startsAtDate = new Date(newStartsAt);
    const salesCloseAtDate = new Date(newSalesCloseAt);
    if (isNaN(startsAtDate.getTime()) || isNaN(salesCloseAtDate.getTime())) {
      setFormError('Vui lòng chọn thời gian diễn ra và thời gian đóng bán hợp lệ');
      return;
    }
    if (salesCloseAtDate.getTime() > startsAtDate.getTime()) {
      setFormError('Thời gian đóng bán vé phải trước hoặc trùng với thời điểm bắt đầu sự kiện');
      return;
    }

    const created = createEvent({
      title: newTitle.trim(),
      category: newCategory,
      venue: newVenue.trim(),
      city: newCity,
      priceVnd: price,
      capacity,
      startsAt: startsAtDate.toISOString(),
      salesCloseAt: salesCloseAtDate.toISOString(),
      description: newDescription.trim() || 'Mô tả sự kiện chi tiết...',
    });

    setSelectedEventId(created.id);
    setShowCreateModal(false);
    setActionFeedback(`Đã tạo thành công sự kiện: "${created.title}"`);
    setTimeout(() => setActionFeedback(null), 4000);
    setNewTitle('');
    setNewVenue('');
    setNewPrice('0');
    setNewDescription('');
  };

  return (
    <div className='ef-container'>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 28,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              marginBottom: 6,
              letterSpacing: '-0.02em',
            }}
          >
            Kênh quản lý Ban tổ chức
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem' }}>
            Quản trị các sự kiện do <strong>{currentUser.name}</strong> tổ chức. Theo dõi số lượng
            vé, giữ chỗ và danh sách chờ.
          </p>
        </div>

        <button
          type='button'
          onClick={() => setShowCreateModal(true)}
          className='ef-btn ef-btn-primary'
        >
          <Plus size={16} />
          <span>Tạo sự kiện mới</span>
        </button>
      </div>

      {/* Feedback Toast */}
      {actionFeedback && (
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
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* Scoped Metric Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 32,
        }}
      >
        {metrics.map(({ label, val, sub, color, Icon }) => (
          <div key={label} className='ef-card' style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                }}
              >
                {label}
              </span>
              <Icon size={18} color={color === '#18181b' ? '#71717a' : color} />
            </div>
            <div
              style={{
                fontSize: '1.75rem',
                fontWeight: 700,
                color,
                margin: '8px 0 2px 0',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {val}
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Main Section */}
      {myEvents.length > 0 ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 320px) minmax(0, 1fr)',
            gap: 24,
            alignItems: 'start',
          }}
          className='organizer-layout-grid'
        >
          {/* Left: Events Selector */}
          <div className='ef-card' style={{ padding: 18 }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 14 }}>
              Sự kiện của bạn ({myEvents.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {myEvents.map((evt) => {
                const isSelected = evt.id === selectedEvent?.id;
                const available = getAvailableTickets(evt);
                const isSoldOut = available <= 0;

                return (
                  <button
                    key={evt.id}
                    type='button'
                    onClick={() => setSelectedEventId(evt.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      borderRadius: 8,
                      border: isSelected ? '1.5px solid var(--action)' : '1px solid var(--border)',
                      backgroundColor: isSelected ? '#f4f4f5' : 'var(--surface)',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                      <div
                        style={{
                          fontSize: '0.88rem',
                          fontWeight: isSelected ? 700 : 500,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {evt.title}
                      </div>
                      <div
                        style={{
                          fontSize: '0.76rem',
                          color: 'var(--text-muted)',
                          marginTop: 2,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        Bán: {evt.soldCount}/{evt.capacity} vé
                      </div>
                    </div>
                    <span
                      className={
                        isSoldOut ? 'ef-badge ef-badge-neutral' : 'ef-badge ef-badge-success'
                      }
                      style={{ fontSize: '0.7rem', padding: '2px 6px', whiteSpace: 'nowrap' }}
                    >
                      {isSoldOut ? 'Hết vé' : `Còn ${available}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Details & Waitlist */}
          {selectedEvent && (
            <div className='ef-card-lg'>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: 12,
                  marginBottom: 20,
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                    }}
                  >
                    {selectedEvent.category}
                  </span>
                  <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: '2px 0 4px 0' }}>
                    {selectedEvent.title}
                  </h2>
                  <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                    {selectedEvent.venue}, {selectedEvent.city} • Giá vé:{' '}
                    <strong>
                      {selectedEvent.priceVnd === 0
                        ? 'Miễn phí'
                        : formatVND(selectedEvent.priceVnd)}
                    </strong>
                  </div>
                </div>
                <Link
                  href={`/events/${selectedEvent.slug}`}
                  target='_blank'
                  className='ef-btn ef-btn-secondary'
                  style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                >
                  <span>Xem trang sự kiện</span>
                  <ExternalLink size={14} />
                </Link>
              </div>

              {/* Inventory Bar */}
              <div
                style={{
                  backgroundColor: 'var(--canvas)',
                  padding: 14,
                  borderRadius: 8,
                  marginBottom: 20,
                  border: '1px solid var(--border)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.82rem',
                    color: 'var(--text-muted)',
                    marginBottom: 8,
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <div>
                    Đã bán: <strong>{selectedEvent.soldCount}</strong>
                  </div>
                  <div>
                    Đang giữ: <strong>{selectedEvent.reservedCount}</strong>
                  </div>
                  <div>
                    Còn lại: <strong>{getAvailableTickets(selectedEvent)}</strong> /{' '}
                    {selectedEvent.capacity}
                  </div>
                </div>
                <div
                  style={{
                    height: 8,
                    width: '100%',
                    backgroundColor: 'var(--border)',
                    borderRadius: 999,
                    overflow: 'hidden',
                    display: 'flex',
                  }}
                >
                  <div
                    style={{
                      width: `${(selectedEvent.soldCount / selectedEvent.capacity) * 100}%`,
                      backgroundColor: 'var(--action)',
                    }}
                  />
                  <div
                    style={{
                      width: `${(selectedEvent.reservedCount / selectedEvent.capacity) * 100}%`,
                      backgroundColor: '#a1a1aa',
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <button
                  type='button'
                  onClick={() => handlePromote(selectedEvent.id)}
                  className='ef-btn ef-btn-primary'
                  style={{ padding: '9px 16px', fontSize: '0.84rem' }}
                >
                  <Send size={15} />
                  <span>Cấp quyền mua cho người tiếp theo (FIFO)</span>
                </button>
              </div>

              {/* Waitlist Queue Table */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 12,
                  }}
                >
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                    Hàng chờ sự kiện này ({selectedEventWaitlist.length})
                  </h3>
                  <span
                    style={{
                      fontSize: '0.78rem',
                      color: 'var(--text-muted)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    Thứ tự cấp lượt tiếp theo: <strong>#{selectedEvent.nextWaitlistSeq}</strong>
                  </span>
                </div>

                {selectedEventWaitlist.length > 0 ? (
                  <div
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      overflowX: 'auto',
                    }}
                  >
                    <table
                      style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}
                    >
                      <thead>
                        <tr
                          style={{
                            backgroundColor: '#f4f4f5',
                            borderBottom: '1px solid var(--border)',
                            textAlign: 'left',
                            color: 'var(--text-muted)',
                          }}
                        >
                          <th style={{ padding: '8px 12px' }}>Thứ tự</th>
                          <th style={{ padding: '8px 12px' }}>Người tham gia</th>
                          <th style={{ padding: '8px 12px' }}>Thời điểm vào</th>
                          <th style={{ padding: '8px 12px' }}>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedEventWaitlist.map((w) => {
                          const user = state.users.find((u) => u.id === w.userId);
                          const statusBadge =
                            w.status === 'OFFERED'
                              ? { cls: 'ef-badge ef-badge-warning', text: 'Đang có Offer (5 phút)' }
                              : w.status === 'WAITING'
                                ? { cls: 'ef-badge ef-badge-neutral', text: 'Đang chờ lượt' }
                                : w.status === 'FULFILLED'
                                  ? { cls: 'ef-badge ef-badge-success', text: 'Đã mua thành công' }
                                  : { cls: 'ef-badge ef-badge-neutral', text: 'Đã hủy/Hết hạn' };

                          return (
                            <tr key={w.id} style={{ borderBottom: '1px solid #f4f4f5' }}>
                              <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                                #{w.sequenceNo}
                              </td>
                              <td style={{ padding: '8px 12px' }}>{user ? user.name : w.userId}</td>
                              <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>
                                {formatDateVN(w.joinedAt)}
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                <span
                                  className={statusBadge.cls}
                                  style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                                >
                                  {statusBadge.text}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div
                    style={{
                      padding: 24,
                      textAlign: 'center',
                      backgroundColor: 'var(--canvas)',
                      borderRadius: 8,
                      color: 'var(--text-muted)',
                      fontSize: '0.86rem',
                      border: '1px solid var(--border)',
                    }}
                  >
                    Hiện chưa có ai đăng ký danh sách chờ cho sự kiện này.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className='ef-card' style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 6 }}>
            Bạn chưa tạo sự kiện nào
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 20 }}>
            Hãy tạo sự kiện đầu tiên để bắt đầu bán vé và quản lý danh sách chờ tự động.
          </p>
          <button
            type='button'
            onClick={() => setShowCreateModal(true)}
            className='ef-btn ef-btn-primary'
          >
            Tạo sự kiện đầu tiên
          </button>
        </div>
      )}

      {/* Modal Tạo sự kiện mới */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(24, 24, 27, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreateModal(false);
          }}
        >
          <div
            ref={modalRef}
            role='dialog'
            aria-modal='true'
            aria-labelledby='create-event-modal-title'
            className='ef-card-lg'
            style={{
              maxWidth: 540,
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 18,
              }}
            >
              <h2 id='create-event-modal-title' style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                Tạo sự kiện mới
              </h2>
              <button
                type='button'
                onClick={() => setShowCreateModal(false)}
                aria-label='Đóng modal tạo sự kiện'
                style={{ color: '#71717a', padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div
                className='ef-badge-danger'
                style={{
                  padding: '10px 14px',
                  borderRadius: 6,
                  fontSize: '0.84rem',
                  marginBottom: 16,
                }}
              >
                {formError}
              </div>
            )}

            <form
              onSubmit={handleCreateSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <div>
                <label htmlFor='evt-title-input' className='ef-label'>
                  Tên sự kiện *
                </label>
                <input
                  id='evt-title-input'
                  name='title'
                  type='text'
                  required
                  placeholder='Ví dụ: Đêm Nhạc Mùa Thu 2026'
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className='ef-input'
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label htmlFor='evt-category-select' className='ef-label'>
                    Danh mục
                  </label>
                  <select
                    id='evt-category-select'
                    name='category'
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className='ef-input'
                  >
                    {[
                      'Âm nhạc',
                      'Công nghệ',
                      'Nghệ thuật',
                      'Thể thao',
                      'Hội thảo',
                      'Kịch nghệ',
                    ].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor='evt-city-select' className='ef-label'>
                    Thành phố
                  </label>
                  <select
                    id='evt-city-select'
                    name='city'
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    className='ef-input'
                  >
                    {['TP. Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng', 'Nha Trang'].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor='evt-venue-input' className='ef-label'>
                  Địa điểm tổ chức *
                </label>
                <input
                  id='evt-venue-input'
                  name='venue'
                  type='text'
                  required
                  placeholder='Ví dụ: Nhà Hát Thành Phố'
                  value={newVenue}
                  onChange={(e) => setNewVenue(e.target.value)}
                  className='ef-input'
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label htmlFor='evt-starts-at-input' className='ef-label'>
                    Thời gian diễn ra *
                  </label>
                  <input
                    id='evt-starts-at-input'
                    name='startsAt'
                    type='datetime-local'
                    required
                    value={newStartsAt}
                    onChange={(e) => setNewStartsAt(e.target.value)}
                    className='ef-input'
                  />
                </div>
                <div>
                  <label htmlFor='evt-sales-close-input' className='ef-label'>
                    Đóng bán vé *
                  </label>
                  <input
                    id='evt-sales-close-input'
                    name='salesCloseAt'
                    type='datetime-local'
                    required
                    value={newSalesCloseAt}
                    onChange={(e) => setNewSalesCloseAt(e.target.value)}
                    className='ef-input'
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label htmlFor='evt-price-input' className='ef-label'>
                    Giá vé (VND - Nhập 0 nếu miễn phí)
                  </label>
                  <input
                    id='evt-price-input'
                    name='priceVnd'
                    type='number'
                    min='0'
                    step='10000'
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className='ef-input'
                  />
                </div>
                <div>
                  <label htmlFor='evt-capacity-input' className='ef-label'>
                    Tổng sức chứa (Vé)
                  </label>
                  <input
                    id='evt-capacity-input'
                    name='capacity'
                    type='number'
                    min='1'
                    max='5000'
                    value={newCapacity}
                    onChange={(e) => setNewCapacity(e.target.value)}
                    className='ef-input'
                  />
                </div>
              </div>

              <div>
                <label htmlFor='evt-desc-textarea' className='ef-label'>
                  Mô tả sự kiện
                </label>
                <textarea
                  id='evt-desc-textarea'
                  name='description'
                  rows={3}
                  placeholder='Giới thiệu ngắn về sự kiện...'
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className='ef-input'
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
                <button
                  type='button'
                  onClick={() => setShowCreateModal(false)}
                  className='ef-btn ef-btn-secondary'
                >
                  Hủy
                </button>
                <button type='submit' className='ef-btn ef-btn-primary'>
                  Xuất bản sự kiện
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrganizerPage;
