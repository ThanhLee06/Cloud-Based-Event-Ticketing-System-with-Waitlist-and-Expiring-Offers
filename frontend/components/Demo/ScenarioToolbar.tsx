'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useMockStore } from '@lib/mock/store';
import { ScenarioType } from '@lib/mock/types';
import {
  SlidersHorizontal,
  X,
  RotateCcw,
  Sparkles,
  Clock,
  TimerOff,
  Inbox,
  Send,
  ListOrdered,
  CheckCircle2,
} from 'lucide-react';

const ScenarioToolbar: React.FC = () => {
  const pathname = usePathname();
  const {
    state,
    currentUser,
    switchUser,
    loadScenario,
    resetStore,
    promoteNextWaitlist,
    isHydrated,
  } = useMockStore();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // F05: Hide in live mode or on checkout / offer transaction pages
  const isLiveMode = process.env.NEXT_PUBLIC_APP_MODE === 'live';
  const isTransactionPage = pathname.startsWith('/checkout') || pathname.startsWith('/offers');

  if (!isHydrated || isLiveMode || isTransactionPage) return null;

  const showFeedback = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3500);
  };

  const handleSelectScenario = (sc: ScenarioType, label: string) => {
    loadScenario(sc);
    showFeedback(`Đã chuyển: ${label}`);
  };

  const handleReset = () => {
    if (confirm('Đặt lại toàn bộ dữ liệu mẫu về mặc định?')) {
      resetStore();
      showFeedback('Đã đặt lại dữ liệu mẫu');
    }
  };

  const handlePromoteNext = () => {
    const evtWithWaitlist = state.events.find((e) =>
      state.waitlistEntries.some((w) => w.eventId === e.id && w.status === 'WAITING')
    );

    if (!evtWithWaitlist) {
      showFeedback('Không có sự kiện nào có người chờ trong hàng đợi!');
      return;
    }

    const res = promoteNextWaitlist(evtWithWaitlist.id);
    showFeedback(res.message || 'Đã cấp quyền mua cho người tiếp theo');
  };

  return (
    <aside
      aria-label='Demo Scenarios'
      style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 9999, fontFamily: 'inherit' }}
    >
      {/* Toast Feedback */}
      {message && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            right: 0,
            marginBottom: 8,
            backgroundColor: '#18181b',
            color: '#ffffff',
            padding: '8px 14px',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            fontSize: '0.82rem',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <CheckCircle2 size={14} color='#10b981' />
          <span>{message}</span>
        </div>
      )}

      {/* Floating Toggle Button (Discreet, compact) */}
      {!isOpen ? (
        <button
          type='button'
          onClick={() => setIsOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            backgroundColor: '#18181b',
            color: '#ffffff',
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.15)',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.15)',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <SlidersHorizontal size={14} />
          <span>Demo Controls</span>
        </button>
      ) : (
        /* Expanded Drawer */
        <div
          style={{
            width: 320,
            backgroundColor: '#ffffff',
            borderRadius: 14,
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.1)',
            border: '1px solid #e4e4e7',
            padding: '16px',
            animation: 'slideUp 0.15s ease',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
              paddingBottom: 8,
              borderBottom: '1px solid #e4e4e7',
            }}
          >
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#18181b' }}>
                Bảng điều khiển Demo
              </div>
              <div style={{ fontSize: '0.72rem', color: '#52525b' }}>Mô phỏng kịch bản dữ liệu</div>
            </div>
            <button
              type='button'
              onClick={() => setIsOpen(false)}
              aria-label='Đóng demo controls'
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#71717a',
                padding: 4,
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Quick Actor Switcher */}
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                color: '#52525b',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              Đổi vai người dùng (Actor):
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {state.users.map((u) => {
                const isSelected = u.id === currentUser.id;
                return (
                  <button
                    key={u.id}
                    type='button'
                    onClick={() => {
                      switchUser(u.id);
                      showFeedback(`Đã chuyển: ${u.name}`);
                    }}
                    style={{
                      padding: '6px 8px',
                      borderRadius: 6,
                      fontSize: '0.76rem',
                      fontWeight: isSelected ? 700 : 500,
                      backgroundColor: isSelected ? '#18181b' : '#f4f4f5',
                      color: isSelected ? '#ffffff' : '#18181b',
                      border: '1px solid',
                      borderColor: isSelected ? '#18181b' : '#e4e4e7',
                      cursor: 'pointer',
                      textAlign: 'left',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {u.name.split(' ')[0]} ({u.role === 'ORGANIZER' ? 'BTC' : 'Mua'})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scenarios */}
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                color: '#52525b',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              Nạp nhanh kịch bản:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button
                type='button'
                onClick={() => handleSelectScenario('EVENT_AVAILABLE', 'Sự kiện còn vé')}
                style={scenarioItemStyle(state.activeScenario === 'EVENT_AVAILABLE')}
              >
                <Clock size={13} />
                <span>1. Sự kiện còn vé (Đặt giữ 10p)</span>
              </button>

              <button
                type='button'
                onClick={() => handleSelectScenario('EVENT_SOLD_OUT', 'Sự kiện hết vé')}
                style={scenarioItemStyle(state.activeScenario === 'EVENT_SOLD_OUT')}
              >
                <Inbox size={13} />
                <span>2. Sự kiện hết vé (Join Waitlist)</span>
              </button>

              <button
                type='button'
                onClick={() => handleSelectScenario('WAITING_POSITION', 'Đang xếp hàng thứ 3')}
                style={scenarioItemStyle(state.activeScenario === 'WAITING_POSITION')}
              >
                <ListOrdered size={13} />
                <span>3. Đang trong hàng chờ (#3 FIFO)</span>
              </button>

              <button
                type='button'
                onClick={() => handleSelectScenario('ACTIVE_OFFER', 'Đến lượt nhận offer')}
                style={scenarioItemStyle(state.activeScenario === 'ACTIVE_OFFER')}
              >
                <Sparkles size={13} />
                <span>4. Có lượt mua vé (Countdown 5p)</span>
              </button>

              <button
                type='button'
                onClick={() => handleSelectScenario('EXPIRED_OFFER', 'Lượt mua hết hạn')}
                style={scenarioItemStyle(state.activeScenario === 'EXPIRED_OFFER')}
              >
                <TimerOff size={13} />
                <span>5. Quyền mua vé đã hết hạn</span>
              </button>
            </div>
          </div>

          {/* Actions */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              borderTop: '1px solid #e4e4e7',
              paddingTop: 10,
            }}
          >
            <button
              type='button'
              onClick={handlePromoteNext}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                padding: '7px 10px',
                borderRadius: 6,
                backgroundColor: '#18181b',
                color: '#ffffff',
                border: 'none',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Send size={13} />
              <span>Cấp offer kế tiếp</span>
            </button>

            <button
              type='button'
              onClick={handleReset}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                padding: '7px 10px',
                borderRadius: 6,
                backgroundColor: '#f4f4f5',
                color: '#52525b',
                border: '1px solid #e4e4e7',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};

const scenarioItemStyle = (isActive: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px',
  borderRadius: 6,
  fontSize: '0.78rem',
  fontWeight: isActive ? 700 : 500,
  backgroundColor: isActive ? '#f4f4f5' : 'transparent',
  color: isActive ? '#18181b' : '#52525b',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
  transition: 'background-color 0.15s ease',
});

export default ScenarioToolbar;
