'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMockStore } from '@lib/mock/store';
import { UserPlus, ArrowRight } from 'lucide-react';

const RegisterPage: React.FC = () => {
  const router = useRouter();
  const { registerUser } = useMockStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim() || !email.trim()) {
      setErrorMessage('Vui lòng nhập đầy đủ họ tên và email');
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      registerUser(name, email);
      setIsSubmitting(false);
      router.push('/');
    }, 400);
  };

  return (
    <div style={{ maxWidth: 460, margin: '40px auto 80px auto', padding: '0 20px' }}>
      <div className='ef-card-lg' style={{ padding: '32px 28px' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            className='ef-icon-circle ef-icon-circle-neutral'
            style={{ width: 48, height: 48, borderRadius: 10 }}
          >
            <UserPlus size={22} />
          </div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 700, marginBottom: 6 }}>
            Đăng ký tài khoản
          </h1>
          <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)' }}>
            Tạo tài khoản trải nghiệm nền tảng EventFlow
          </p>
        </div>

        <div
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            backgroundColor: 'var(--canvas)',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            fontSize: '0.8rem',
            marginBottom: 20,
            lineHeight: 1.5,
          }}
        >
          <strong>Chế độ thử nghiệm:</strong> Thông tin đăng ký được lưu cục bộ trong phiên trình
          duyệt của bạn mà không gửi dữ liệu ra bên ngoài.
        </div>

        {errorMessage && (
          <div
            className='ef-badge-danger'
            style={{ padding: '10px 14px', borderRadius: 6, fontSize: '0.84rem', marginBottom: 16 }}
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label htmlFor='register-name-input' className='ef-label'>
              Họ và tên *
            </label>
            <input
              id='register-name-input'
              name='name'
              type='text'
              required
              autoComplete='name'
              placeholder='Ví dụ: Nguyễn Văn A'
              value={name}
              onChange={(e) => setName(e.target.value)}
              className='ef-input'
            />
          </div>

          <div>
            <label htmlFor='register-email-input' className='ef-label'>
              Địa chỉ Email *
            </label>
            <input
              id='register-email-input'
              name='email'
              type='email'
              required
              autoComplete='email'
              placeholder='ten.nguoidung@email.com'
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className='ef-input'
            />
          </div>

          <div>
            <label htmlFor='register-password-input' className='ef-label'>
              Mật khẩu *
            </label>
            <input
              id='register-password-input'
              name='password'
              type='password'
              required
              autoComplete='new-password'
              placeholder='Tối thiểu 6 ký tự'
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
            <span>{isSubmitting ? 'Đang tạo tài khoản...' : 'Đăng ký tài khoản'}</span>
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
          Đã có tài khoản?{' '}
          <Link
            href='/login'
            style={{ color: 'var(--text)', fontWeight: 600, textDecoration: 'underline' }}
          >
            Đăng nhập ngay
          </Link>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
