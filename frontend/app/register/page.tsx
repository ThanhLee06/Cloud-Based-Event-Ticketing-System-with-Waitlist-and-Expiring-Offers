'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserPlus, ArrowRight } from 'lucide-react';
import { useAuth, homePathForRole } from '@lib/auth/AuthProvider';
import { getApiErrorCode, getApiErrorMessage } from '@lib/api/client';
import PasswordInput from '@components/Form/PasswordInput';

const RegisterPage: React.FC = () => {
  const router = useRouter();
  const { register, user, status } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Đã đăng nhập mà vào /register → chuyển về trang phù hợp.
  useEffect(() => {
    if (status === 'authenticated' && user && !isSubmitting) {
      router.replace(homePathForRole(user.role));
    }
  }, [status, user, isSubmitting, router]);

  const passwordsMismatch = confirmPassword.length > 0 && confirmPassword !== password;

  const goToVerify = (targetEmail: string, sent: boolean) => {
    const params = new URLSearchParams({ email: targetEmail, sent: sent ? '1' : '0' });
    router.push(`/verify-email?${params.toString()}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setUnverifiedEmail(null);

    if (!name.trim() || !email.trim()) {
      setErrorMessage('Vui lòng nhập đầy đủ họ tên và email');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Mật khẩu phải có ít nhất 6 ký tự.');
      return;
    }
    if (password !== confirmPassword) {
      setConfirmTouched(true);
      setErrorMessage('Mật khẩu nhập lại không khớp.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Tạo tài khoản CUSTOMER (chưa xác thực) → backend gửi mã OTP 6 số qua email.
      const res = await register(name.trim(), email.trim(), password);
      goToVerify(res.email, res.emailSent);
    } catch (err) {
      if (getApiErrorCode(err) === 'EMAIL_NOT_VERIFIED') {
        setUnverifiedEmail(email.trim().toLowerCase());
      }
      setErrorMessage(getApiErrorMessage(err, 'Đăng ký thất bại. Vui lòng thử lại.'));
      setIsSubmitting(false);
    }
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
          Sau khi đăng ký, chúng tôi gửi <strong>mã xác thực 6 số</strong> tới email của bạn. Tài
          khoản mới có vai trò <strong>Người mua</strong>; Ban tổ chức do Quản trị viên cấp quyền.
        </div>

        {errorMessage && (
          <div
            role='alert'
            className='ef-badge-danger'
            style={{ padding: '10px 14px', borderRadius: 6, fontSize: '0.84rem', marginBottom: 16 }}
          >
            {errorMessage}
            {unverifiedEmail && (
              <div style={{ marginTop: 8 }}>
                <button
                  type='button'
                  onClick={() => goToVerify(unverifiedEmail, false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'inherit',
                    fontWeight: 700,
                    textDecoration: 'underline',
                    cursor: 'pointer',
                  }}
                >
                  Nhập mã xác thực cho {unverifiedEmail}
                </button>
              </div>
            )}
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
            <PasswordInput
              id='register-password-input'
              name='password'
              required
              minLength={6}
              autoComplete='new-password'
              placeholder='Tối thiểu 6 ký tự'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor='register-confirm-input' className='ef-label'>
              Nhập lại mật khẩu *
            </label>
            <PasswordInput
              id='register-confirm-input'
              name='confirmPassword'
              required
              minLength={6}
              autoComplete='new-password'
              placeholder='Nhập lại mật khẩu ở trên'
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onBlur={() => setConfirmTouched(true)}
              aria-invalid={confirmTouched && passwordsMismatch}
              aria-describedby={
                confirmTouched && passwordsMismatch ? 'register-confirm-hint' : undefined
              }
              style={
                confirmTouched && passwordsMismatch
                  ? { borderColor: 'var(--danger-text)' }
                  : undefined
              }
            />
            {confirmTouched && passwordsMismatch && (
              <div
                id='register-confirm-hint'
                role='alert'
                style={{ fontSize: '0.78rem', color: 'var(--danger-text)', marginTop: 6 }}
              >
                Mật khẩu nhập lại không khớp.
              </div>
            )}
          </div>

          <button
            type='submit'
            disabled={isSubmitting || passwordsMismatch}
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
