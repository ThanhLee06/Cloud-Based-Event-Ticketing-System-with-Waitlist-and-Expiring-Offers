'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Ticket, HelpCircle, X, Clock, Hourglass, ShieldCheck } from 'lucide-react';

const Footer: React.FC = () => {
  const pathname = usePathname();
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Shell detection (F20)
  const isTransactionOrAuth =
    pathname.startsWith('/checkout') ||
    pathname.startsWith('/offers') ||
    pathname === '/login' ||
    pathname === '/register';

  const isOrganizer = pathname.startsWith('/organizer');

  // Minimal footer for Transaction and Auth shells
  if (isTransactionOrAuth) {
    return (
      <footer
        style={{
          borderTop: '1px solid #e4e4e7',
          backgroundColor: '#ffffff',
          padding: '16px 20px',
          textAlign: 'center',
          fontSize: '0.8rem',
          color: '#71717a',
          marginTop: 'auto',
        }}
      >
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          © 2026 EventFlow · Bản trải nghiệm mô phỏng quy trình đặt vé và hàng chờ
        </div>
      </footer>
    );
  }

  // Minimal footer for Organizer shell
  if (isOrganizer) {
    return (
      <footer
        style={{
          borderTop: '1px solid #e4e4e7',
          backgroundColor: '#ffffff',
          padding: '16px 20px',
          textAlign: 'center',
          fontSize: '0.8rem',
          color: '#71717a',
          marginTop: 'auto',
        }}
      >
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          © 2026 EventFlow · Kênh quản trị dành cho Ban tổ chức
        </div>
      </footer>
    );
  }

  // Concise footer for Public & Personal shells (F20, F21)
  return (
    <footer
      style={{
        backgroundColor: '#ffffff',
        borderTop: '1px solid #e4e4e7',
        padding: '36px 0 24px 0',
        marginTop: 'auto',
        color: '#52525b',
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '0 20px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 24,
            marginBottom: 28,
          }}
        >
          {/* Brand & Purpose */}
          <div style={{ maxWidth: 440 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  backgroundColor: '#18181b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                }}
              >
                <Ticket size={15} />
              </div>
              <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#18181b' }}>
                EventFlow
              </span>
            </div>
            <p style={{ fontSize: '0.84rem', lineHeight: 1.5, margin: 0 }}>
              Hệ thống bán vé sự kiện trực tuyến với cơ chế giữ chỗ 10 phút, tự động điều phối danh
              sách chờ FIFO và cấp quyền mua vé có thời hạn.
            </p>
          </div>

          {/* Real Action Links */}
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            <div>
              <div
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: '#18181b',
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                Điều hướng
              </div>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.84rem' }}
              >
                <Link href='/' style={{ color: '#52525b', textDecoration: 'none' }}>
                  Khám phá sự kiện
                </Link>
                <Link href='/my-tickets' style={{ color: '#52525b', textDecoration: 'none' }}>
                  Vé của tôi
                </Link>
                <Link href='/my-waitlist' style={{ color: '#52525b', textDecoration: 'none' }}>
                  Danh sách chờ
                </Link>
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: '#18181b',
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                Hỗ trợ &amp; Trợ giúp
              </div>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.84rem' }}
              >
                <button
                  type='button'
                  onClick={() => setShowHelpModal(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: '#18181b',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <HelpCircle size={14} />
                  <span>Cách thức hoạt động</span>
                </button>
                <Link href='/organizer' style={{ color: '#52525b', textDecoration: 'none' }}>
                  Kênh Ban tổ chức
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Line */}
        <div
          style={{
            borderTop: '1px solid #f4f4f5',
            paddingTop: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            fontSize: '0.78rem',
            color: '#71717a',
          }}
        >
          <div>© 2026 EventFlow. Đề tài Cloud-Based Event Ticketing System with Waitlist.</div>
          <div>Bản trải nghiệm mô phỏng · Không phát sinh chi phí thanh toán</div>
        </div>
      </div>

      {/* Help Modal (F21: Real content, no fake href="/") */}
      {showHelpModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(24, 24, 27, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowHelpModal(false);
            }
          }}
        >
          <div
            role='dialog'
            aria-modal='true'
            aria-labelledby='help-dialog-title'
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 14,
              padding: '24px',
              maxWidth: 520,
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e4e4e7',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <h2
                id='help-dialog-title'
                style={{ fontSize: '1.2rem', fontWeight: 700, color: '#18181b', margin: 0 }}
              >
                Quy trình đặt vé &amp; Hàng chờ EventFlow
              </h2>
              <button
                type='button'
                onClick={() => setShowHelpModal(false)}
                aria-label='Đóng trợ giúp'
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#71717a',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 4,
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                fontSize: '0.86rem',
                color: '#52525b',
                lineHeight: 1.55,
              }}
            >
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <Clock size={18} style={{ color: '#18181b', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <strong style={{ color: '#18181b' }}>1. Giữ vé 10 phút:</strong> Khi chọn mua vé,
                  hệ thống tạm giữ chỗ trong 10 phút để bạn hoàn tất đơn hàng mà không bị tranh chấp
                  bởi người khác.
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <Hourglass size={18} style={{ color: '#18181b', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <strong style={{ color: '#18181b' }}>2. Danh sách chờ FIFO:</strong> Khi sự kiện
                  hết vé, người tham gia đăng ký vào hàng chờ nhận số thứ tự chính xác, phục vụ theo
                  nguyên tắc đến trước được phục vụ trước.
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <ShieldCheck size={18} style={{ color: '#18181b', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <strong style={{ color: '#18181b' }}>3. Quyền mua vé có thời hạn:</strong> Khi có
                  vé hủy hoặc hết hạn thanh toán, hệ thống tự động cấp quyền mua vé (Offer) cho
                  người kế tiếp trong hàng chờ với thời gian giới hạn để xác nhận.
                </div>
              </div>
            </div>

            <div style={{ marginTop: 24, textAlign: 'right' }}>
              <button
                type='button'
                onClick={() => setShowHelpModal(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  backgroundColor: '#18181b',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                }}
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
};

export default Footer;
