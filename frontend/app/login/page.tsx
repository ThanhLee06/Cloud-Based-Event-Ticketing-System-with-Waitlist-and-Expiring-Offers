'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMockStore } from '@lib/mock/store';
import { Lock, AlertCircle, Check, ArrowRight } from 'lucide-react';

const LoginPage: React.FC = () => {
  const router = useRouter();
  const { state, currentUser, switchUser } = useMockStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const navigateByRole = (role?: string) => {
    router.push(role === 'ORGANIZER' ? '/organizer' : '/');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const found = state.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!found) {
      setErrorMessage(
        'Email không khớp với tài khoản demo nào. Bạn có thể chọn nhanh tài khoản trải nghiệm bên dưới.'
      );
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      switchUser(found.id);
      setIsSubmitting(false);
      navigateByRole(found.role);
    }, 400);
  };

  const handleQuickLogin = (userId: string) => {
    switchUser(userId);
    const user = state.users.find((u) => u.id === userId);
    navigateByRole(user?.role);
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

        {/* 1-Click Demo Profiles */}
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
            Chọn nhanh tài khoản trải nghiệm (Demo):
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {state.users.map((u) => {
              const isCurrent = u.id === currentUser.id;
              return (
                <button
                  key={u.id}
                  type='button'
                  onClick={() => handleQuickLogin(u.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: isCurrent ? '1.5px solid var(--action)' : '1px solid var(--border)',
                    backgroundColor: isCurrent ? '#f4f4f5' : 'var(--surface)',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <img
                      src={u.avatar}
                      alt={u.name}
                      style={{ width: 28, height: 28, borderRadius: 999, objectFit: 'cover' }}
                    />
                    <div>
                      <div style={{ fontSize: '0.84rem', fontWeight: isCurrent ? 700 : 500 }}>
                        {u.name}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {u.role === 'ORGANIZER' ? 'Ban tổ chức' : 'Người mua'} • {u.email}
                      </div>
                    </div>
                  </div>
                  {isCurrent && <Check size={16} color='#18181b' strokeWidth={2.5} />}
                </button>
              );
            })}
          </div>
        </div>

        {errorMessage && (
          <div
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
              placeholder='quan.le@eventflow.vn'
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
            Đăng ký trải nghiệm
          </Link>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
