'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, AlertCircle, ArrowRight, UserCheck } from 'lucide-react';
import { useAuth, homePathForRole, ROLE_LABELS } from '@lib/auth/AuthProvider';
import { getApiErrorMessage } from '@lib/api/client';
import type { UserRole } from '@lib/api/auth';

/** Tài khoản có sẵn trong DB sau khi chạy `pnpm prisma:seed` (ST-001). */
const DEMO_PASSWORD = 'Eventflow@123';
const DEMO_ACCOUNTS: { email: string; role: UserRole; note: string }[] = [
  { email: 'student001@eventflow.vn', role: 'CUSTOMER', note: '100 tài khoản: student001 → 100' },
  { email: 'organizer01@eventflow.vn', role: 'ORGANIZER', note: 'organizer01, organizer02' },
  { email: 'admin@eventflow.vn', role: 'ADMIN', note: 'Quản trị toàn hệ thống' },
];

/** Chỉ chấp nhận đường dẫn nội bộ để tránh open-redirect. */
const readNextPath = (): string | null => {
  if (typeof window === 'undefined') return null;
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') && next !== '/login' ? next : null;
};

const LoginPage: React.FC = () => {
  const router = useRouter();
  const { login, user, status } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Đã đăng nhập mà vào /login → chuyển về trang phù hợp.
  useEffect(() => {
    if (status === 'authenticated' && user && !isSubmitting) {
      router.replace(readNextPath() ?? homePathForRole(user.role));
    }
  }, [status, user, isSubmitting, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const u = await login(email.trim(), password);
      router.push(readNextPath() ?? homePathForRole(u.role));
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, 'Đăng nhập thất bại. Vui lòng thử lại.'));
      setIsSubmitting(false);
    }
  };

  const fillDemo = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    setErrorMessage(null);
  };

  return (
    <div style={{ maxWidth: 460, margin: '40px auto 80px auto', padding: '0 20px' }}>
      <div className='ef-card-lg' style={{ padding: '32px 28px' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            className='ef-icon-circle ef-icon-circle-neutral'
            style={{ width: 48, height: 48, borderRadius: 10 }}
          >
            <Lock size={22} />
          </div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 700, marginBottom: 6 }}>
            Đăng nhập tài khoản
          </h1>
          <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)' }}>
            Hệ thống bán vé sự kiện EventFlow
          </p>
        </div>

        {/* Điền nhanh tài khoản demo có thật trong PostgreSQL */}
        <div
          style={{
            marginBottom: 20,
            padding: 14,
            backgroundColor: 'var(--canvas)',
            borderRadius: 10,
            border: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              fontSize: '0.74rem',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: 10,
            }}
          >
            Điền nhanh tài khoản demo (mật khẩu {DEMO_PASSWORD}):
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {DEMO_ACCOUNTS.map((acc) => {
              const isFilled = email === acc.email;
              return (
                <button
                  key={acc.email}
                  type='button'
                  onClick={() => fillDemo(acc.email)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: isFilled ? '1.5px solid var(--action)' : '1px solid var(--border)',
                    backgroundColor: isFilled ? '#f4f4f5' : 'var(--surface)',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.84rem', fontWeight: isFilled ? 700 : 600 }}>
                      {ROLE_LABELS[acc.role]} • {acc.email}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {acc.note}
                    </div>
                  </div>
                  {isFilled && <UserCheck size={16} color='#18181b' strokeWidth={2.5} />}
                </button>
              );
            })}
          </div>
        </div>

        {errorMessage && (
          <div
            role='alert'
            className='ef-badge-danger'
            style={{
              padding: '10px 14px',
              borderRadius: 6,
              marginBottom: 16,
              display: 'flex',
              gap: 8,
              fontSize: '0.84rem',
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label htmlFor='login-email-input' className='ef-label'>
              Địa chỉ Email
            </label>
            <input
              id='login-email-input'
              name='email'
              type='email'
              required
              autoComplete='email'
              placeholder='student001@eventflow.vn'
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className='ef-input'
            />
          </div>

          <div>
            <label htmlFor='login-password-input' className='ef-label'>
              Mật khẩu
            </label>
            <input
              id='login-password-input'
              name='password'
              type='password'
              required
              autoComplete='current-password'
              placeholder='••••••••'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className='ef-input'
            />
          </div>

          <button
            type='submit'
            disabled={isSubmitting}
            className='ef-btn ef-btn-primary ef-btn-full'
          >
            <span>{isSubmitting ? 'Đang xác thực...' : 'Đăng nhập'}</span>
            <ArrowRight size={16} />
          </button>
        </form>

        <div
          style={{
            marginTop: 20,
            textAlign: 'center',
            fontSize: '0.84rem',
            color: 'var(--text-muted)',
          }}
        >
          Chưa có tài khoản?{' '}
          <Link
            href='/register'
            style={{ color: 'var(--text)', fontWeight: 600, textDecoration: 'underline' }}
          >
            Đăng ký ngay
          </Link>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
