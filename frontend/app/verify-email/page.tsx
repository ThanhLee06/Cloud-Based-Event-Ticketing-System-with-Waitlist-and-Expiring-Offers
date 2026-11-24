'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MailCheck, AlertCircle, CheckCircle2, RotateCw, ArrowRight } from 'lucide-react';
import { useAuth, homePathForRole } from '@lib/auth/AuthProvider';
import { resendVerification } from '@lib/api/auth';
import { getApiErrorCode, getApiErrorData, getApiErrorMessage } from '@lib/api/client';

const CODE_LENGTH = 6;
const DEFAULT_COOLDOWN = 60;

type Notice = { type: 'success' | 'error' | 'info'; text: string } | null;

const readParams = () => {
  if (typeof window === 'undefined') return { email: '', sent: null as string | null, from: null };
  const p = new URLSearchParams(window.location.search);
  return { email: p.get('email') ?? '', sent: p.get('sent'), from: p.get('from') };
};

/** Nhập mã OTP 6 số gửi qua email sau khi đăng ký (hoặc khi đăng nhập mà chưa xác thực). */
const VerifyEmailPage: React.FC = () => {
  const router = useRouter();
  const { verifyEmail, user, status, mode } = useAuth();

  const [email, setEmail] = useState('');
  const [emailLocked, setEmailLocked] = useState(false);
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [notice, setNotice] = useState<Notice>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  // Đọc email + trạng thái gửi từ URL (do trang đăng ký / đăng nhập truyền sang).
  useEffect(() => {
    const { email: qEmail, sent, from } = readParams();
    if (qEmail) {
      setEmail(qEmail);
      setEmailLocked(true);
    }
    if (sent === '1') {
      setCooldown(DEFAULT_COOLDOWN);
      setNotice({ type: 'success', text: `Đã gửi mã xác thực 6 số tới ${qEmail}.` });
    } else if (sent === '0') {
      setNotice({
        type: 'error',
        text: 'Tài khoản đã được tạo nhưng chưa gửi được email. Vui lòng bấm "Gửi lại mã".',
      });
    } else if (from === 'login') {
      setNotice({
        type: 'info',
        text: 'Email của bạn chưa được xác thực. Nhập mã đã gửi trước đó, hoặc bấm "Gửi lại mã" để nhận mã mới.',
      });
    }
    codeRef.current?.focus();
  }, []);

  // Đếm ngược thời gian được gửi lại mã.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // ST-036: với Cognito, mã xác thực email được nhập ngay trên trang của Cognito.
  useEffect(() => {
    if (mode === 'cognito') router.replace('/login');
  }, [mode, router]);

  // Đã đăng nhập (vd. xác thực xong ở tab khác) → không cần ở trang này.
  useEffect(() => {
    if (status === 'authenticated' && user && !isSubmitting) {
      router.replace(homePathForRole(user.role));
    }
  }, [status, user, isSubmitting, router]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    if (!email.trim()) {
      setNotice({ type: 'error', text: 'Vui lòng nhập email đã đăng ký.' });
      return;
    }
    if (code.length !== CODE_LENGTH) {
      setNotice({ type: 'error', text: 'Mã xác thực gồm đúng 6 chữ số.' });
      return;
    }
    setIsSubmitting(true);
    try {
      const u = await verifyEmail(email.trim().toLowerCase(), code);
      setNotice({ type: 'success', text: 'Xác thực thành công! Đang chuyển trang...' });
      router.push(homePathForRole(u.role));
    } catch (err) {
      const errCode = getApiErrorCode(err);
      if (errCode === 'EMAIL_ALREADY_VERIFIED') {
        router.push('/login');
        return;
      }
      setNotice({ type: 'error', text: getApiErrorMessage(err, 'Xác thực thất bại.') });
      if (errCode === 'OTP_TOO_MANY_ATTEMPTS' || errCode === 'OTP_EXPIRED') setCode('');
      setIsSubmitting(false);
      codeRef.current?.focus();
    }
  };

  const handleResend = async () => {
    if (!email.trim() || cooldown > 0) return;
    setIsResending(true);
    setNotice(null);
    try {
      const res = await resendVerification(email.trim().toLowerCase());
      setNotice({ type: res.emailSent ? 'success' : 'error', text: res.message });
      setCooldown(res.resendAvailableInSec);
      setCode('');
      codeRef.current?.focus();
    } catch (err) {
      const retry = getApiErrorData(err)?.retryAfterSec;
      if (typeof retry === 'number') setCooldown(retry);
      setNotice({ type: 'error', text: getApiErrorMessage(err, 'Không gửi lại được mã.') });
    } finally {
      setIsResending(false);
    }
  };

  const noticeClass =
    notice?.type === 'success'
      ? 'ef-badge-success'
      : notice?.type === 'error'
        ? 'ef-badge-danger'
        : 'ef-badge-neutral';

  return (
    <div style={{ maxWidth: 460, margin: '40px auto 80px auto', padding: '0 20px' }}>
      <div className='ef-card-lg' style={{ padding: '32px 28px' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div
            className='ef-icon-circle ef-icon-circle-neutral'
            style={{ width: 48, height: 48, borderRadius: 10 }}
          >
            <MailCheck size={22} />
          </div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 700, marginBottom: 6 }}>Xác thực email</h1>
          <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Nhập mã 6 số chúng tôi đã gửi tới email của bạn. Mã có hiệu lực trong 10 phút.
          </p>
        </div>

        {notice && (
          <div
            role={notice.type === 'error' ? 'alert' : 'status'}
            className={noticeClass}
            style={{
              padding: '10px 14px',
              borderRadius: 6,
              marginBottom: 16,
              display: 'flex',
              gap: 8,
              fontSize: '0.84rem',
              lineHeight: 1.5,
            }}
          >
            {notice.type === 'success' ? (
              <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            ) : (
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            )}
            <span>{notice.text}</span>
          </div>
        )}

        <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label htmlFor='verify-email-input' className='ef-label'>
              Email
            </label>
            <input
              id='verify-email-input'
              type='email'
              required
              autoComplete='email'
              className='ef-input'
              value={email}
              readOnly={emailLocked}
              onChange={(e) => setEmail(e.target.value)}
              style={emailLocked ? { backgroundColor: 'var(--canvas)' } : undefined}
            />
          </div>

          <div>
            <label htmlFor='verify-code-input' className='ef-label'>
              Mã xác thực
            </label>
            <input
              id='verify-code-input'
              ref={codeRef}
              className='ef-input'
              inputMode='numeric'
              autoComplete='one-time-code'
              pattern='[0-9]{6}'
              maxLength={CODE_LENGTH}
              placeholder='••••••'
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
              style={{
                fontSize: '1.5rem',
                letterSpacing: '0.5em',
                textAlign: 'center',
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 700,
              }}
            />
          </div>

          <button
            type='submit'
            className='ef-btn ef-btn-primary ef-btn-full'
            disabled={isSubmitting || code.length !== CODE_LENGTH}
          >
            <span>{isSubmitting ? 'Đang xác thực...' : 'Xác thực & đăng nhập'}</span>
            <ArrowRight size={16} />
          </button>

          <button
            type='button'
            className='ef-btn ef-btn-secondary ef-btn-full'
            onClick={() => void handleResend()}
            disabled={isResending || cooldown > 0 || !email.trim()}
          >
            <RotateCw size={15} />
            <span>
              {isResending
                ? 'Đang gửi...'
                : cooldown > 0
                  ? `Gửi lại mã sau ${cooldown}s`
                  : 'Gửi lại mã'}
            </span>
          </button>
        </form>

        <p
          style={{
            marginTop: 16,
            fontSize: '0.78rem',
            color: 'var(--text-muted)',
            lineHeight: 1.6,
            textAlign: 'center',
          }}
        >
          Không thấy email? Hãy kiểm tra thư mục <strong>Spam / Quảng cáo</strong>.
          <br />
          <Link href='/login' style={{ color: 'var(--text)', textDecoration: 'underline' }}>
            Quay lại đăng nhập
          </Link>
        </p>
      </div>
    </div>
  );
};

export default VerifyEmailPage;
