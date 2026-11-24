'use client';

import React, { useCallback, useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import useClickOutside from '@hooks/useClickOutside';
import { useRouter } from 'next/navigation';
import { useAuth, ROLE_LABELS } from '@lib/auth/AuthProvider';
import { getMyWaitlist, WAITLIST_UPDATED_EVENT } from '@lib/api/waitlist';
import { getMyReservations } from '@lib/api/reservations';
import {
  Ticket,
  ChevronDown,
  Menu,
  X,
  User,
  PlusCircle,
  UserCog,
  ShieldCheck,
  LogOut,
} from 'lucide-react';

const menuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px',
  borderRadius: 6,
  fontSize: '0.84rem',
  color: '#18181b',
  textDecoration: 'none',
  backgroundColor: 'transparent',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
};

const mobileLinkStyle: React.CSSProperties = {
  padding: '8px 0',
  fontSize: '0.9rem',
  fontWeight: 500,
  color: '#18181b',
  textDecoration: 'none',
};

const Header: React.FC = () => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const router = useRouter();
  const { user: authUser, status: authStatus, logout } = useAuth();
  const isOrganizer = authUser?.role === 'ORGANIZER';
  const [waitlistCounts, setWaitlistCounts] = useState<{ offers: number; waiting: number }>({
    offers: 0,
    waiting: 0,
  });
  const [activeTicketsCount, setActiveTicketsCount] = useState(0);

  const handleLogout = () => {
    setUserDropdownOpen(false);
    setMobileMenuOpen(false);
    logout();
    router.push('/login');
  };

  useClickOutside(wrapperRef, () => {
    setUserDropdownOpen(false);
  });

  // Đóng menu khi đổi route
  useEffect(() => {
    setMobileMenuOpen(false);
    setUserDropdownOpen(false);
  }, [pathname]);

  // Đóng khi nhấn phím Escape (F15)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
        setUserDropdownOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const refreshWaitlistCounts = useCallback(async () => {
    if (authStatus !== 'authenticated' || !authUser) return;
    try {
      const items = await getMyWaitlist();
      setWaitlistCounts({
        offers: items.filter((w) => w.status === 'OFFERED').length,
        waiting: items.filter((w) => w.status === 'WAITING').length,
      });
    } catch {
      // Giữ nguyên số hiện tại nếu mất kết nối tạm thời
    }
  }, [authStatus, authUser]);

  // Đồng bộ badge vé của tôi, hàng chờ và offer thật từ PostgreSQL.
  useEffect(() => {
    if (authStatus !== 'authenticated' || !authUser) {
      setWaitlistCounts({ offers: 0, waiting: 0 });
      setActiveTicketsCount(0);
      return;
    }
    let active = true;
    void getMyWaitlist()
      .then((items) => {
        if (!active) return;
        setWaitlistCounts({
          offers: items.filter((w) => w.status === 'OFFERED').length,
          waiting: items.filter((w) => w.status === 'WAITING').length,
        });
      })
      .catch(() => {});

    void getMyReservations()
      .then((reservations) => {
        if (!active) return;
        const now = Date.now();
        const activeCount = reservations.filter(
          (r) =>
            r.status === 'CONFIRMED' ||
            (r.status === 'HOLD' && new Date(r.expiresAt).getTime() > now)
        ).length;
        setActiveTicketsCount(activeCount);
      })
      .catch(() => {});

    const onUpdated = () => {
      void refreshWaitlistCounts();
    };
    window.addEventListener(WAITLIST_UPDATED_EVENT, onUpdated);
    return () => {
      active = false;
      window.removeEventListener(WAITLIST_UPDATED_EVENT, onUpdated);
    };
  }, [authStatus, authUser, pathname, refreshWaitlistCounts]);

  const isAuthed = authStatus === 'authenticated' && !!authUser;
  const pendingOffersCount = isAuthed ? waitlistCounts.offers : 0;
  const waitingCount = isAuthed ? waitlistCounts.waiting : 0;
  const totalWaitlistBadge = pendingOffersCount > 0 ? pendingOffersCount : waitingCount;

  return (
    <header
      style={{
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e4e4e7',
        position: 'sticky',
        top: 0,
        zIndex: 1000,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 64,
          maxWidth: 1200,
          margin: '0 auto',
          padding: '0 20px',
        }}
      >
        {/* Brand Logo & Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <Link
            href='/'
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              textDecoration: 'none',
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: '#18181b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
              }}
            >
              <Ticket size={18} strokeWidth={2.2} />
            </div>
            <div
              style={{
                fontSize: '1.18rem',
                fontWeight: 700,
                color: '#18181b',
                letterSpacing: '-0.02em',
              }}
            >
              EventFlow
            </div>
          </Link>

          {/* Desktop Navigation Links (F22: aria-current="page" & consistent vocabulary) */}
          <nav
            aria-label='Điều hướng chính'
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
            className='desktop-nav'
          >
            <Link
              href='/'
              aria-current={pathname === '/' ? 'page' : undefined}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                fontSize: '0.88rem',
                fontWeight: pathname === '/' ? 700 : 500,
                color: pathname === '/' ? '#18181b' : '#52525b',
                backgroundColor: pathname === '/' ? '#f4f4f5' : 'transparent',
                textDecoration: 'none',
              }}
            >
              Khám phá
            </Link>

            <Link
              href='/my-tickets'
              aria-current={pathname === '/my-tickets' ? 'page' : undefined}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                fontSize: '0.88rem',
                fontWeight: pathname === '/my-tickets' ? 700 : 500,
                color: pathname === '/my-tickets' ? '#18181b' : '#52525b',
                backgroundColor: pathname === '/my-tickets' ? '#f4f4f5' : 'transparent',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>Vé của tôi</span>
              {activeTicketsCount > 0 && (
                <span
                  style={{
                    backgroundColor: '#18181b',
                    color: '#ffffff',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 999,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {activeTicketsCount}
                </span>
              )}
            </Link>

            <Link
              href='/my-waitlist'
              aria-current={pathname === '/my-waitlist' ? 'page' : undefined}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                fontSize: '0.88rem',
                fontWeight: pathname === '/my-waitlist' ? 700 : 500,
                color: pathname === '/my-waitlist' ? '#18181b' : '#52525b',
                backgroundColor: pathname === '/my-waitlist' ? '#f4f4f5' : 'transparent',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>Danh sách chờ</span>
              {totalWaitlistBadge > 0 && (
                <span
                  style={{
                    backgroundColor: pendingOffersCount > 0 ? '#92400e' : '#f4f4f5',
                    color: pendingOffersCount > 0 ? '#ffffff' : '#18181b',
                    border: pendingOffersCount > 0 ? 'none' : '1px solid #e4e4e7',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 999,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {totalWaitlistBadge}
                </span>
              )}
            </Link>
          </nav>
        </div>

        {/* Right Section: Organizer & User Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Organizer Shortcut */}
          <Link
            href='/organizer'
            aria-current={pathname === '/organizer' ? 'page' : undefined}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 6,
              fontSize: '0.82rem',
              fontWeight: 600,
              color: isOrganizer ? '#ffffff' : '#52525b',
              backgroundColor: isOrganizer ? '#18181b' : '#f4f4f5',
              border: '1px solid',
              borderColor: isOrganizer ? '#18181b' : '#e4e4e7',
              textDecoration: 'none',
            }}
            className='desktop-nav'
          >
            <PlusCircle size={15} />
            <span>Kênh Ban tổ chức</span>
          </Link>

          {/* ST-007: Tài khoản thật (JWT) */}
          {authStatus === 'loading' ? (
            <div
              aria-hidden='true'
              style={{ width: 120, height: 36, borderRadius: 999, backgroundColor: '#f4f4f5' }}
            />
          ) : !authUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Link
                href='/login'
                className='ef-btn ef-btn-secondary'
                style={{ padding: '6px 12px' }}
              >
                Đăng nhập
              </Link>
              <Link
                href='/register'
                className='ef-btn ef-btn-primary desktop-nav'
                style={{ padding: '6px 12px' }}
              >
                Đăng ký
              </Link>
            </div>
          ) : (
            <div ref={wrapperRef} style={{ position: 'relative' }}>
              <button
                type='button'
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                aria-expanded={userDropdownOpen}
                aria-haspopup='menu'
                aria-controls='user-dropdown-menu'
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 10px 4px 6px',
                  borderRadius: 999,
                  backgroundColor: '#ffffff',
                  border: '1px solid #e4e4e7',
                  cursor: 'pointer',
                }}
                aria-label='Tài khoản người dùng'
              >
                {authUser.avatar ? (
                  <img
                    src={authUser.avatar}
                    alt={authUser.name}
                    style={{ width: 28, height: 28, borderRadius: 999, objectFit: 'cover' }}
                  />
                ) : (
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      backgroundColor: '#18181b',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                    }}
                  >
                    {authUser.name.trim().charAt(0).toUpperCase() || <User size={14} />}
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    lineHeight: 1.15,
                  }}
                  className='desktop-nav'
                >
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#18181b' }}>
                    {authUser.name}
                  </span>
                  <span style={{ fontSize: '0.68rem', color: '#52525b' }}>
                    {ROLE_LABELS[authUser.role]}
                  </span>
                </div>
                <ChevronDown size={14} color='#71717a' />
              </button>

              {userDropdownOpen && (
                <div
                  id='user-dropdown-menu'
                  role='menu'
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: 6,
                    width: 240,
                    backgroundColor: '#ffffff',
                    borderRadius: 10,
                    border: '1px solid #e4e4e7',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.08)',
                    padding: 8,
                    zIndex: 2000,
                  }}
                >
                  <div style={{ padding: '6px 8px 8px' }}>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#18181b' }}>
                      {authUser.name}
                    </div>
                    <div
                      style={{
                        fontSize: '0.72rem',
                        color: '#52525b',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {authUser.email}
                    </div>
                  </div>
                  <div style={{ margin: '2px 0 6px', borderTop: '1px solid #e4e4e7' }} />

                  <Link href='/profile' role='menuitem' style={menuItemStyle}>
                    <UserCog size={15} />
                    <span>Hồ sơ cá nhân</span>
                  </Link>
                  {authUser.role === 'ADMIN' && (
                    <Link href='/admin' role='menuitem' style={menuItemStyle}>
                      <ShieldCheck size={15} />
                      <span>Trang quản trị</span>
                    </Link>
                  )}
                  {authUser.role === 'ORGANIZER' && (
                    <Link href='/organizer' role='menuitem' style={menuItemStyle}>
                      <PlusCircle size={15} />
                      <span>Kênh Ban tổ chức</span>
                    </Link>
                  )}

                  <div style={{ margin: '6px 0', borderTop: '1px solid #e4e4e7' }} />
                  <button
                    type='button'
                    role='menuitem'
                    onClick={handleLogout}
                    style={{ ...menuItemStyle, width: '100%', color: '#b91c1c' }}
                  >
                    <LogOut size={15} />
                    <span>Đăng xuất</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Mobile Menu Toggle Button (F15) */}
          <button
            type='button'
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-controls='mobile-nav-drawer'
            style={{
              display: 'none',
              padding: 6,
              borderRadius: 6,
              border: '1px solid #e4e4e7',
              backgroundColor: '#ffffff',
              color: '#18181b',
              cursor: 'pointer',
            }}
            className='mobile-menu-btn'
            aria-label='Mở menu điều hướng'
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer (F15) */}
      {mobileMenuOpen && (
        <nav
          id='mobile-nav-drawer'
          aria-label='Điều hướng trên di động'
          style={{
            borderTop: '1px solid #e4e4e7',
            backgroundColor: '#ffffff',
            padding: '12px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
          className='mobile-drawer'
        >
          <Link
            href='/'
            aria-current={pathname === '/' ? 'page' : undefined}
            onClick={() => setMobileMenuOpen(false)}
            style={{
              padding: '8px 0',
              fontSize: '0.9rem',
              fontWeight: pathname === '/' ? 700 : 500,
              color: '#18181b',
              textDecoration: 'none',
            }}
          >
            Khám phá
          </Link>
          <Link
            href='/my-tickets'
            aria-current={pathname === '/my-tickets' ? 'page' : undefined}
            onClick={() => setMobileMenuOpen(false)}
            style={{
              padding: '8px 0',
              fontSize: '0.9rem',
              fontWeight: pathname === '/my-tickets' ? 700 : 500,
              color: '#18181b',
              display: 'flex',
              justifyContent: 'space-between',
              textDecoration: 'none',
            }}
          >
            <span>Vé của tôi</span>
            {activeTicketsCount > 0 && (
              <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                ({activeTicketsCount})
              </span>
            )}
          </Link>
          <Link
            href='/my-waitlist'
            aria-current={pathname === '/my-waitlist' ? 'page' : undefined}
            onClick={() => setMobileMenuOpen(false)}
            style={{
              padding: '8px 0',
              fontSize: '0.9rem',
              fontWeight: pathname === '/my-waitlist' ? 700 : 500,
              color: '#18181b',
              display: 'flex',
              justifyContent: 'space-between',
              textDecoration: 'none',
            }}
          >
            <span>Danh sách chờ</span>
            {totalWaitlistBadge > 0 && (
              <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                ({totalWaitlistBadge})
              </span>
            )}
          </Link>
          <Link
            href='/organizer'
            aria-current={pathname === '/organizer' ? 'page' : undefined}
            onClick={() => setMobileMenuOpen(false)}
            style={{
              padding: '8px 0',
              fontSize: '0.9rem',
              fontWeight: pathname === '/organizer' ? 700 : 500,
              color: '#18181b',
              textDecoration: 'none',
            }}
          >
            Kênh Ban tổ chức
          </Link>
          <div style={{ margin: '4px 0', borderTop: '1px solid #e4e4e7' }} />
          {authUser ? (
            <>
              <Link
                href='/profile'
                onClick={() => setMobileMenuOpen(false)}
                style={mobileLinkStyle}
              >
                Hồ sơ cá nhân
              </Link>
              {authUser.role === 'ADMIN' && (
                <Link
                  href='/admin'
                  onClick={() => setMobileMenuOpen(false)}
                  style={mobileLinkStyle}
                >
                  Trang quản trị
                </Link>
              )}
              <button
                type='button'
                onClick={handleLogout}
                style={{
                  ...mobileLinkStyle,
                  color: '#b91c1c',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Đăng xuất
              </button>
            </>
          ) : (
            <Link href='/register' onClick={() => setMobileMenuOpen(false)} style={mobileLinkStyle}>
              Đăng ký tài khoản
            </Link>
          )}
        </nav>
      )}

      <style jsx>{`
        @media (max-width: 768px) {
          :global(.desktop-nav) {
            display: none !important;
          }
          :global(.mobile-menu-btn) {
            display: flex !important;
          }
        }
      `}</style>
    </header>
  );
};

export default Header;
