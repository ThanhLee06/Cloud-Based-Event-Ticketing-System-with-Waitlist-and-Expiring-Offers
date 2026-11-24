'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useAuth, homePathForRole } from '@lib/auth/AuthProvider';
import { sanitizeNextPath, takeRememberedNextPath } from '@lib/auth/cognito';
import { getApiErrorMessage } from '@lib/api/client';

/**
 * ST-036 — Cognito chuyển người dùng về đây sau khi đăng nhập/đăng ký:
 * /auth/callback?code=...&state=...  → đổi code lấy token → liên kết user → vào đúng khu vực.
 */
const CognitoCallbackPage: React.FC = () => {
  const router = useRouter();
  const { finishCognito } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // React (dev) gọi effect 2 lần; code chỉ đổi được 1 lần nên chặn lần thứ hai.
    if (started.current) return;
    started.current = true;

    const search = new URLSearchParams(window.location.search);
    // Xóa code/state khỏi thanh địa chỉ ngay để không lưu vào lịch sử trình duyệt.
    window.history.replaceState(null, '', '/auth/callback');

    finishCognito(search)
      .then(({ user, next }) => {
        const target =
          sanitizeNextPath(next) ?? takeRememberedNextPath() ?? homePathForRole(user.role);
        router.replace(target);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error && !('isAxiosError' in err)
            ? err.message
            : getApiErrorMessage(err, 'Không đăng nhập được. Vui lòng thử lại.')
        );
      });
  }, [finishCognito, router]);

  return (
    <div style={{ maxWidth: 460, margin: '60px auto 80px auto', padding: '0 20px' }}>
      <div className='ef-card-lg' style={{ padding: '32px 28px', textAlign: 'center' }}>
        {error ? (
          <>
            <div className='ef-icon-circle ef-icon-circle-danger'>
              <AlertCircle size={24} />
            </div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 10 }}>
              Đăng nhập chưa thành công
            </h1>
            <p
              role='alert'
              style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 20 }}
            >
              {error}
            </p>
            <Link href='/login' className='ef-btn ef-btn-primary'>
              Thử đăng nhập lại
            </Link>
          </>
        ) : (
          <>
            <Loader2
              size={28}
              aria-hidden='true'
              style={{ marginBottom: 12, animation: 'spin 1s linear infinite' }}
            />
            <p role='status' style={{ fontSize: '0.95rem' }}>
              Đang hoàn tất đăng nhập...
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default CognitoCallbackPage;
