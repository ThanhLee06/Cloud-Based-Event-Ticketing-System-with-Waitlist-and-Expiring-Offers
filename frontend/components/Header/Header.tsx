'use client';

import React, { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import useClickOutside from '@hooks/useClickOutside';
import { useMockStore } from '@lib/mock/store';
import { Ticket, ChevronDown, Menu, X, User, Check, PlusCircle } from 'lucide-react';

const Header: React.FC = () => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const {
    state,
    currentUser,
    switchUser,
    getUserReservations,
    getUserOffers,
    getUserWaitlist,
    isHydrated,
  } = useMockStore();

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

  const myReservations = isHydrated ? getUserReservations() : [];
  const activeTicketsCount = myReservations.filter(
    (r) => r.status === 'CONFIRMED' || r.status === 'HOLD'
  ).length;

  const myOffers = isHydrated ? getUserOffers() : [];
  const pendingOffersCount = myOffers.filter((o) => o.status === 'PENDING').length;
  const myWaitlist = isHydrated ? getUserWaitlist() : [];
  const waitingCount = myWaitlist.filter((w) => w.status === 'WAITING').length;
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
              color: currentUser.role === 'ORGANIZER' ? '#ffffff' : '#52525b',
              backgroundColor: currentUser.role === 'ORGANIZER' ? '#18181b' : '#f4f4f5',
              border: '1px solid',
              borderColor: currentUser.role === 'ORGANIZER' ? '#18181b' : '#e4e4e7',
              textDecoration: 'none',
            }}
            className='desktop-nav'
          >
            <PlusCircle size={15} />
            <span>Kênh Ban tổ chức</span>
          </Link>

          {/* User Profile Switcher */}
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
              {currentUser.avatar ? (
                <img
                  src={currentUser.avatar}
                  alt={currentUser.name}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    objectFit: 'cover',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    backgroundColor: '#f4f4f5',
                    color: '#18181b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <User size={14} />
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
                  {currentUser.name}
                </span>
                <span style={{ fontSize: '0.68rem', color: '#52525b' }}>
                  {currentUser.role === 'ORGANIZER' ? 'Ban tổ chức' : 'Người mua'}
                </span>
              </div>
              <ChevronDown size={14} color='#71717a' />
            </button>

            {/* Dropdown Menu (F15) */}
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
                <div
                  style={{
                    padding: '6px 8px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: '#52525b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Tài khoản trải nghiệm:
                </div>

                {state.users.map((user) => {
                  const isSelected = user.id === currentUser.id;
                  return (
                    <button
                      key={user.id}
                      type='button'
                      role='menuitem'
                      onClick={() => {
                        switchUser(user.id);
                        setUserDropdownOpen(false);
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        borderRadius: 6,
                        backgroundColor: isSelected ? '#f4f4f5' : 'transparent',
                        textAlign: 'left',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <img
                          src={user.avatar}
                          alt={user.name}
                          style={{ width: 24, height: 24, borderRadius: 999, objectFit: 'cover' }}
                        />
                        <div>
                          <div
                            style={{
                              fontSize: '0.82rem',
                              fontWeight: isSelected ? 700 : 500,
                              color: '#18181b',
                            }}
                          >
                            {user.name}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: '#52525b' }}>
                            {user.role === 'ORGANIZER' ? 'Ban tổ chức' : 'Người mua'}
                          </div>
                        </div>
                      </div>

                      {isSelected && <Check size={14} color='#18181b' strokeWidth={2.5} />}
                    </button>
                  );
                })}

                <div style={{ margin: '6px 0', borderTop: '1px solid #e4e4e7' }} />

                <Link
                  href='/login'
                  role='menuitem'
                  onClick={() => setUserDropdownOpen(false)}
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    padding: '6px 0',
                    fontSize: '0.78rem',
                    color: '#52525b',
                    textDecoration: 'none',
                  }}
                >
                  Màn hình đăng nhập demo
                </Link>
              </div>
            )}
          </div>

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
