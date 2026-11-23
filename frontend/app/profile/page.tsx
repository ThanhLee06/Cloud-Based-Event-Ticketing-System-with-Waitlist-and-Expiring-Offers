'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserCog, KeyRound, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth, ROLE_LABELS, loginRedirectPath } from '@lib/auth/AuthProvider';
import { changePassword, updateMe } from '@lib/api/auth';
import { getApiErrorMessage } from '@lib/api/client';
import { formatDateVN } from '@lib/utils/format';
import PasswordInput from '@components/Form/PasswordInput';

type Notice = { type: 'success' | 'error'; text: string } | null;

const NoticeBox: React.FC<{ notice: Notice }> = ({ notice }) => {
  if (!notice) return null;
  const isOk = notice.type === 'success';
  return (
    <div
      role={isOk ? 'status' : 'alert'}
      className={isOk ? 'ef-badge-success' : 'ef-badge-danger'}
      style={{
        display: 'flex',
        gap: 8,
        padding: '10px 14px',
        borderRadius: 6,
        fontSize: '0.84rem',
        marginBottom: 14,
      }}
    >
      {isOk ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
      <span>{notice.text}</span>
    </div>
  );
};

/** ST-007: Hồ sơ cá nhân — xem thông tin, sửa tên/SĐT, đổi mật khẩu (API ST-003). */
const ProfilePage: React.FC = () => {
  const router = useRouter();
  const { user, status, setUser, loggedOutByUser, mode } = useAuth();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState<Notice>(null);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null);

  useEffect(() => {
    if (status === 'anonymous') router.replace(loginRedirectPath('/profile', loggedOutByUser));
  }, [status, loggedOutByUser, router]);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setPhone(user.phone ?? '');
    }
  }, [user]);

  if (status !== 'authenticated' || !user) {
    return <div className='ef-loading'>Đang tải hồ sơ...</div>;
  }

  const profileChanged = name.trim() !== user.name || phone.trim() !== (user.phone ?? '');

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileNotice(null);
    setSavingProfile(true);
    try {
      const updated = await updateMe({ name: name.trim(), phone: phone.trim() });
      setUser(updated);
      setProfileNotice({ type: 'success', text: 'Đã cập nhật hồ sơ.' });
    } catch (err) {
      setProfileNotice({ type: 'error', text: getApiErrorMessage(err) });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordNotice(null);
    if (newPassword !== confirmPassword) {
      setPasswordNotice({ type: 'error', text: 'Mật khẩu nhập lại không khớp.' });
      return;
    }
    setSavingPassword(true);
    try {
      const message = await changePassword(oldPassword, newPassword);
      setPasswordNotice({ type: 'success', text: message });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordNotice({ type: 'error', text: getApiErrorMessage(err) });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className='ef-container-md' style={{ paddingTop: 32, paddingBottom: 64 }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: 6 }}>Hồ sơ cá nhân</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 24 }}>
        Quản lý thông tin tài khoản và mật khẩu đăng nhập.
      </p>

      {/* Thông tin tài khoản */}
      <div
        className='ef-card-lg'
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 999,
            backgroundColor: '#18181b',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.4rem',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {user.name.trim().charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{user.name}</div>
          <div style={{ fontSize: '0.86rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
            {user.email}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Tham gia: {formatDateVN(user.createdAt)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className='ef-badge ef-badge-neutral'>{ROLE_LABELS[user.role]}</span>
          <span className='ef-badge ef-badge-success'>Đang hoạt động</span>
        </div>
      </div>

      <div className='profile-grid'>
        {/* Cập nhật hồ sơ */}
        <form className='ef-card-lg' onSubmit={handleSaveProfile}>
          <h2 style={sectionTitle}>
            <UserCog size={18} /> Thông tin cá nhân
          </h2>
          <NoticeBox notice={profileNotice} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label htmlFor='profile-name' className='ef-label'>
                Họ và tên
              </label>
              <input
                id='profile-name'
                className='ef-input'
                value={name}
                required
                minLength={2}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor='profile-phone' className='ef-label'>
                Số điện thoại
              </label>
              <input
                id='profile-phone'
                className='ef-input'
                type='tel'
                placeholder='0901 234 567'
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor='profile-email' className='ef-label'>
                Email (không thể thay đổi)
              </label>
              <input id='profile-email' className='ef-input' value={user.email} disabled readOnly />
            </div>
            <button
              type='submit'
              className='ef-btn ef-btn-primary'
              disabled={savingProfile || !profileChanged}
            >
              <Save size={16} />
              <span>{savingProfile ? 'Đang lưu...' : 'Lưu thay đổi'}</span>
            </button>
          </div>
        </form>

        {/* Đổi mật khẩu — ST-036: khi chạy với Cognito, mật khẩu do Cognito quản lý */}
        {mode === 'cognito' ? (
          <div className='ef-card-lg'>
            <h2 style={sectionTitle}>
              <KeyRound size={18} /> Mật khẩu
            </h2>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Mật khẩu của bạn được quản lý bởi <strong>Amazon Cognito</strong>. Để đổi mật khẩu,
              hãy đăng xuất rồi chọn <strong>&quot;Forgot your password?&quot;</strong> trên trang
              đăng nhập; Cognito sẽ gửi mã xác nhận tới email của bạn.
            </p>
          </div>
        ) : (
          <form className='ef-card-lg' onSubmit={handleChangePassword}>
            <h2 style={sectionTitle}>
              <KeyRound size={18} /> Đổi mật khẩu
            </h2>
            <NoticeBox notice={passwordNotice} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label htmlFor='pw-old' className='ef-label'>
                  Mật khẩu hiện tại
                </label>
                <PasswordInput
                  id='pw-old'
                  autoComplete='current-password'
                  required
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor='pw-new' className='ef-label'>
                  Mật khẩu mới (tối thiểu 6 ký tự)
                </label>
                <PasswordInput
                  id='pw-new'
                  autoComplete='new-password'
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor='pw-confirm' className='ef-label'>
                  Nhập lại mật khẩu mới
                </label>
                <PasswordInput
                  id='pw-confirm'
                  autoComplete='new-password'
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <button type='submit' className='ef-btn ef-btn-primary' disabled={savingPassword}>
                <KeyRound size={16} />
                <span>{savingPassword ? 'Đang đổi...' : 'Đổi mật khẩu'}</span>
              </button>
            </div>
          </form>
        )}
      </div>

      <style jsx>{`
        .profile-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          align-items: start;
        }
        @media (max-width: 768px) {
          .profile-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

const sectionTitle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: '1.05rem',
  fontWeight: 700,
  marginBottom: 16,
};

export default ProfilePage;
