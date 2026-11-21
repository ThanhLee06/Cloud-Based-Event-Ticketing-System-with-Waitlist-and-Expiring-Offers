'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, AlertCircle, ArrowRight, LogOut } from 'lucide-react';
import { useAuth, homePathForRole, ROLE_LABELS } from '@lib/auth/AuthProvider';
import { getApiErrorCode, getApiErrorMessage } from '@lib/api/client';
import PasswordInput from '@components/Form/PasswordInput';

/** Chỉ chấp nhận đường dẫn nội bộ để tránh open-redirect. */
const readNextPath = (): string | null => {
  if (typeof window === 'undefined') return null;
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') && next !== '/login' ? next : null;
};

const LoginPage: React.FC = () => {
  const router = useRouter();
  const { login, logout, user, status } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const u = await login(email.trim(), password);
      router.push(readNextPath() ?? homePathForRole(u.role));
    } catch (err) {
      if (getApiErrorCode(err) === 'EMAIL_NOT_VERIFIED') {
        // Đúng mật khẩu nhưng chưa xác thực email → chuyển sang màn nhập mã OTP.
        const params = new URLSearchParams({ email: email.trim().toLowerCase(), from: 'login' });
        router.push(`/verify-email?${params.toString()}`);
        return;
      }
      setErrorMessage(getApiErrorMessage(err, 'Đăng nhập thất bại. Vui lòng thử lại.'));
      setIsSubmitting(false);
    }
  };

  const continueAsCurrent = () => {
    if (user) router.push(readNextPath() ?? homePathForRole(user.role));
  };

  // Đang đăng nhập sẵn: KHÔNG tự chuyển trang (tránh vòng lặp /organizer ⇄ /login),
  // mà cho người dùng chọn tiếp tục hoặc đăng xuất để dùng tài khoản khác.
  const showSwitchAccount = status === 'authenticated' && !!user && !isSubmitting;

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

        {showSwitchAccount && user ? (
          <div
            style={{
              padding: 16,
              borderRadius: 10,
              border: '1px solid var(--border)',
              backgroundColor: 'var(--canvas)',
            }}
          >
            <p style={{ fontSize: '0.9rem', marginBottom: 14, lineHeight: 1.5 }}>
              Bạn đang đăng nhập với tài khoản <strong>{user.name}</strong> (
              {ROLE_LABELS[user.role]}) —{' '}
              <span style={{ wordBreak: 'break-all' }}>{user.email}</span>.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type='button'
                className='ef-btn ef-btn-primary ef-btn-full'
                onClick={continueAsCurrent}
              >
                <span>Tiếp tục với tài khoản này</span>
                <ArrowRight size={16} />
              </button>
              <button
                type='button'
                className='ef-btn ef-btn-secondary ef-btn-full'
                onClick={() => {
                  logout();
                  setEmail('');
                  setPassword('');
                }}
              >
                <LogOut size={16} />
                <span>Đăng xuất để dùng tài khoản khác</span>
              </button>
            </div>
          </div>
        ) : (
          <>
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

            <form
              onSubmit={handleSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
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
                  placeholder='ban@example.com'
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className='ef-input'
                />
              </div>

              <div>
                <label htmlFor='login-password-input' className='ef-label'>
                  Mật khẩu
                </label>
                <PasswordInput
                  id='login-password-input'
                  name='password'
                  required
                  autoComplete='current-password'
                  placeholder='••••••••'
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
          </>
        )}
      </div>
    </div>
  );
};

export default LoginPage;
