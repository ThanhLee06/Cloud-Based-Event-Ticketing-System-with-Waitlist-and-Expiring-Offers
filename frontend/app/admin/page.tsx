'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ShieldAlert,
  ShieldCheck,
  Users,
  Lock,
  Unlock,
  ArrowUpCircle,
  ArrowDownCircle,
  Search,
  RefreshCw,
  CalendarX2,
  ScrollText,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import ConfirmDialog from '@components/Modal/ConfirmDialog';
import { useAuth, ROLE_LABELS, loginRedirectPath } from '@lib/auth/AuthProvider';
import {
  adminGetOverview,
  adminListUsers,
  adminUpdateRole,
  adminUpdateStatus,
  AdminAuditLogItem,
  AdminOverview,
  PaginatedUsers,
  PublicUser,
  UserRole,
  UserStatus,
} from '@lib/api/auth';
import { getApiErrorMessage } from '@lib/api/client';
import { formatDateVN } from '@lib/utils/format';

const PAGE_SIZE = 10;

type PendingAction =
  | { kind: 'role'; user: PublicUser; role: UserRole }
  | { kind: 'status'; user: PublicUser; status: UserStatus };

const ACTION_LABELS: Record<string, string> = {
  USER_ROLE_CHANGED: 'Đổi vai trò',
  USER_LOCKED: 'Khóa tài khoản',
  USER_UNLOCKED: 'Mở khóa tài khoản',
  EVENT_FORCE_CLOSED: 'Đóng khẩn cấp sự kiện',
};

const describeChange = (log: AdminAuditLogItem): string => {
  const d = log.details ?? {};
  const from = typeof d.from === 'string' ? d.from : null;
  const to = typeof d.to === 'string' ? d.to : null;
  const label = (v: string) => ROLE_LABELS[v as UserRole] ?? v;
  if (from && to) return `${label(from)} → ${label(to)}`;
  if (typeof d.reason === 'string') return `Lý do: ${d.reason}`;
  return '';
};

/** ST-007: Bảng điều khiển Quản trị (dùng API ST-005, ST-006). Chỉ ADMIN truy cập được. */
const AdminPage: React.FC = () => {
  const router = useRouter();
  const { user: me, status, loggedOutByUser } = useAuth();
  const isAdmin = status === 'authenticated' && me?.role === 'ADMIN';

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [usersPage, setUsersPage] = useState<PaginatedUsers | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');
  const [statusFilter, setStatusFilter] = useState<UserStatus | ''>('');
  const [page, setPage] = useState(1);

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [actionMessage, setActionMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (status === 'anonymous') router.replace(loginRedirectPath('/admin', loggedOutByUser));
  }, [status, loggedOutByUser, router]);

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await adminGetOverview());
    } catch (err) {
      setLoadError(getApiErrorMessage(err));
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const data = await adminListUsers({
        q: q || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setUsersPage(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(getApiErrorMessage(err));
    } finally {
      setLoadingUsers(false);
    }
  }, [q, roleFilter, statusFilter, page]);

  useEffect(() => {
    if (isAdmin) void loadOverview();
  }, [isAdmin, loadOverview]);

  useEffect(() => {
    if (isAdmin) void loadUsers();
  }, [isAdmin, loadUsers]);

  if (status === 'loading' || status === 'anonymous') {
    return <div className='ef-loading'>Đang kiểm tra quyền truy cập...</div>;
  }

  if (!isAdmin) {
    return (
      <div className='ef-container-sm'>
        <div className='ef-icon-circle ef-icon-circle-danger'>
          <ShieldAlert size={32} />
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 10 }}>
          Khu vực dành cho Quản trị viên
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginBottom: 28 }}>
          Tài khoản <strong>{me?.name}</strong> ({me ? ROLE_LABELS[me.role] : ''}) không có quyền
          truy cập trang quản trị hệ thống.
        </p>
        <Link href='/' className='ef-btn ef-btn-primary'>
          <ArrowLeft size={16} />
          <span>Quay lại Khám phá</span>
        </Link>
      </div>
    );
  }

  const applySearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setQ(searchInput.trim());
  };

  const confirmAction = async () => {
    if (!pending) return;
    const action = pending;
    setPending(null);
    setActionMessage(null);
    try {
      if (action.kind === 'role') {
        await adminUpdateRole(action.user.id, action.role);
        setActionMessage({
          ok: true,
          text: `Đã chuyển ${action.user.email} thành ${ROLE_LABELS[action.role]}.`,
        });
      } else {
        await adminUpdateStatus(action.user.id, action.status);
        setActionMessage({
          ok: true,
          text: `Đã ${action.status === 'LOCKED' ? 'khóa' : 'mở khóa'} tài khoản ${action.user.email}.`,
        });
      }
      await Promise.all([loadUsers(), loadOverview()]);
    } catch (err) {
      setActionMessage({ ok: false, text: getApiErrorMessage(err) });
    }
  };

  const dialog = (() => {
    if (!pending) return null;
    if (pending.kind === 'role') {
      return {
        title: `Đổi vai trò thành ${ROLE_LABELS[pending.role]}?`,
        message: `Tài khoản ${pending.user.email} sẽ chuyển từ "${ROLE_LABELS[pending.user.role]}" sang "${ROLE_LABELS[pending.role]}". Thao tác được ghi vào nhật ký quản trị.`,
        confirmText: 'Xác nhận đổi vai trò',
        destructive: pending.role === 'CUSTOMER',
      };
    }
    const locking = pending.status === 'LOCKED';
    return {
      title: locking ? 'Khóa tài khoản này?' : 'Mở khóa tài khoản này?',
      message: locking
        ? `${pending.user.email} sẽ bị đăng xuất ngay và không thể đăng nhập cho tới khi được mở khóa.`
        : `${pending.user.email} sẽ đăng nhập và sử dụng hệ thống bình thường trở lại.`,
      confirmText: locking ? 'Khóa tài khoản' : 'Mở khóa',
      destructive: locking,
    };
  })();

  const totalPages = usersPage ? Math.max(1, Math.ceil(usersPage.total / usersPage.pageSize)) : 1;
  const dash = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v);

  return (
    <div className='ef-container' style={{ paddingTop: 32, paddingBottom: 64 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '1.6rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <ShieldCheck size={24} /> Trang quản trị hệ thống
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: 4 }}>
            Theo dõi toàn sàn EventFlow, quản lý tài khoản và phân quyền Ban tổ chức.
          </p>
        </div>
        <button
          type='button'
          className='ef-btn ef-btn-secondary'
          onClick={() => void Promise.all([loadOverview(), loadUsers()])}
        >
          <RefreshCw size={15} />
          <span>Làm mới</span>
        </button>
      </div>

      {loadError && (
        <div
          role='alert'
          className='ef-badge-danger'
          style={{ padding: '10px 14px', borderRadius: 6, fontSize: '0.86rem', marginBottom: 16 }}
        >
          {loadError}
        </div>
      )}

      {/* Số liệu toàn sàn */}
      <div className='admin-stats'>
        <StatCard label='Tổng tài khoản' value={dash(overview?.users.total)} />
        <StatCard label='Người mua' value={dash(overview?.users.customers)} />
        <StatCard label='Ban tổ chức' value={dash(overview?.users.organizers)} />
        <StatCard label='Đang bị khóa' value={dash(overview?.users.locked)} warn />
        <StatCard label='Sự kiện' value={dash(overview?.totalEvents)} hint='Chờ ST-008' />
        <StatCard
          label='Vé đã xác nhận'
          value={dash(overview?.confirmedTickets)}
          hint='Chờ ST-015'
        />
        <StatCard label='Giữ chỗ đang mở' value={dash(overview?.activeHolds)} hint='Chờ ST-015' />
        <StatCard
          label='Đang chờ / Có offer'
          value={
            overview?.waitingEntries == null
              ? '—'
              : `${overview.waitingEntries} / ${dash(overview.offeredEntries)}`
          }
          hint='Chờ ST-022'
        />
      </div>

      {/* Quản lý người dùng */}
      <section className='ef-card-lg' style={{ marginTop: 24 }}>
        <h2 style={sectionTitle}>
          <Users size={18} /> Quản lý người dùng
        </h2>

        <form
          onSubmit={applySearch}
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}
        >
          <input
            className='ef-input'
            style={{ flex: '1 1 220px' }}
            placeholder='Tìm theo email hoặc tên...'
            aria-label='Tìm người dùng'
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <select
            className='ef-input'
            style={{ flex: '0 0 170px' }}
            aria-label='Lọc theo vai trò'
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value as UserRole | '');
              setPage(1);
            }}
          >
            <option value=''>Tất cả vai trò</option>
            <option value='CUSTOMER'>Người mua</option>
            <option value='ORGANIZER'>Ban tổ chức</option>
            <option value='ADMIN'>Quản trị viên</option>
          </select>
          <select
            className='ef-input'
            style={{ flex: '0 0 170px' }}
            aria-label='Lọc theo trạng thái'
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as UserStatus | '');
              setPage(1);
            }}
          >
            <option value=''>Tất cả trạng thái</option>
            <option value='ACTIVE'>Đang hoạt động</option>
            <option value='LOCKED'>Đang bị khóa</option>
          </select>
          <button type='submit' className='ef-btn ef-btn-primary'>
            <Search size={15} />
            <span>Tìm</span>
          </button>
        </form>

        {actionMessage && (
          <div
            role={actionMessage.ok ? 'status' : 'alert'}
            className={actionMessage.ok ? 'ef-badge-success' : 'ef-badge-danger'}
            style={{ padding: '10px 14px', borderRadius: 6, fontSize: '0.86rem', marginBottom: 12 }}
          >
            {actionMessage.text}
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table className='admin-table'>
            <thead>
              <tr>
                <th>Người dùng</th>
                <th>Vai trò</th>
                <th>Trạng thái</th>
                <th>Ngày tạo</th>
                <th style={{ textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {usersPage?.items.map((u) => {
                const isSelf = u.id === me?.id;
                return (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {u.name}
                        {isSelf && (
                          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                            {' '}
                            (bạn)
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {u.email}
                      </div>
                    </td>
                    <td>
                      <span className='ef-badge ef-badge-neutral'>{ROLE_LABELS[u.role]}</span>
                    </td>
                    <td>
                      <span
                        className={`ef-badge ${u.status === 'LOCKED' ? 'ef-badge-danger' : 'ef-badge-success'}`}
                      >
                        {u.status === 'LOCKED' ? 'Đã khóa' : 'Hoạt động'}
                      </span>
                      {!u.emailVerifiedAt && (
                        <div
                          style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}
                        >
                          Chưa xác thực email
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {formatDateVN(u.createdAt)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {u.role === 'CUSTOMER' && (
                          <button
                            type='button'
                            className='ef-btn ef-btn-secondary'
                            style={smallBtn}
                            disabled={isSelf}
                            onClick={() => setPending({ kind: 'role', user: u, role: 'ORGANIZER' })}
                          >
                            <ArrowUpCircle size={14} />
                            <span>Nâng Ban tổ chức</span>
                          </button>
                        )}
                        {u.role === 'ORGANIZER' && (
                          <button
                            type='button'
                            className='ef-btn ef-btn-secondary'
                            style={smallBtn}
                            disabled={isSelf}
                            onClick={() => setPending({ kind: 'role', user: u, role: 'CUSTOMER' })}
                          >
                            <ArrowDownCircle size={14} />
                            <span>Hạ về Người mua</span>
                          </button>
                        )}
                        {u.status === 'ACTIVE' ? (
                          <button
                            type='button'
                            className='ef-btn ef-btn-danger'
                            style={smallBtn}
                            disabled={isSelf}
                            title={isSelf ? 'Không thể tự khóa chính mình' : undefined}
                            onClick={() =>
                              setPending({ kind: 'status', user: u, status: 'LOCKED' })
                            }
                          >
                            <Lock size={14} />
                            <span>Khóa</span>
                          </button>
                        ) : (
                          <button
                            type='button'
                            className='ef-btn ef-btn-secondary'
                            style={smallBtn}
                            disabled={isSelf}
                            onClick={() =>
                              setPending({ kind: 'status', user: u, status: 'ACTIVE' })
                            }
                          >
                            <Unlock size={14} />
                            <span>Mở khóa</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {usersPage && usersPage.items.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    Không có người dùng phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 12,
            fontSize: '0.84rem',
            color: 'var(--text-muted)',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <span>
            {loadingUsers
              ? 'Đang tải...'
              : usersPage
                ? `${usersPage.total} người dùng · trang ${usersPage.page}/${totalPages}`
                : ''}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type='button'
              className='ef-btn ef-btn-secondary'
              style={smallBtn}
              disabled={page <= 1 || loadingUsers}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label='Trang trước'
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type='button'
              className='ef-btn ef-btn-secondary'
              style={smallBtn}
              disabled={page >= totalPages || loadingUsers}
              onClick={() => setPage((p) => p + 1)}
              aria-label='Trang sau'
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </section>

      {/* Sự kiện toàn sàn — chờ TV2 */}
      <section className='ef-card-lg' style={{ marginTop: 24 }}>
        <h2 style={sectionTitle}>
          <CalendarX2 size={18} /> Sự kiện toàn sàn & Đóng khẩn cấp
        </h2>
        <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Bảng sự kiện và nút <strong>Đóng khẩn cấp</strong> sẽ hiển thị khi bảng Event (ST-008 –
          TV2) được merge và API <code>POST /api/admin/events/:id/force-close</code> (ST-006 phần 2)
          hoàn thành.
        </p>
      </section>

      {/* Nhật ký quản trị */}
      <section className='ef-card-lg' style={{ marginTop: 24 }}>
        <h2 style={sectionTitle}>
          <ScrollText size={18} /> Nhật ký quản trị (50 thao tác gần nhất)
        </h2>
        <div style={{ overflowX: 'auto' }}>
          <table className='admin-table'>
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Người thực hiện</th>
                <th>Thao tác</th>
                <th>Đối tượng</th>
                <th>Request ID</th>
              </tr>
            </thead>
            <tbody>
              {overview?.recentAuditLogs.map((log) => (
                <tr key={log.id}>
                  <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                    {formatDateVN(log.createdAt)}
                  </td>
                  <td style={{ fontSize: '0.82rem' }}>{log.actor?.email ?? '—'}</td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: '0.84rem' }}>
                      {ACTION_LABELS[log.action] ?? log.action}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                      {describeChange(log)}
                    </div>
                  </td>
                  <td style={{ fontSize: '0.82rem' }}>
                    {typeof log.details?.email === 'string' ? log.details.email : log.targetId}
                  </td>
                  <td>
                    <code style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {log.requestId ? log.requestId.slice(0, 8) : '—'}
                    </code>
                  </td>
                </tr>
              ))}
              {overview && overview.recentAuditLogs.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    Chưa có thao tác quản trị nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmDialog
        isOpen={Boolean(pending)}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        confirmText={dialog?.confirmText}
        cancelText='Hủy bỏ'
        isDestructive={dialog?.destructive}
        onConfirm={() => void confirmAction()}
        onCancel={() => setPending(null)}
      />

      <style jsx>{`
        .admin-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        @media (max-width: 900px) {
          .admin-stats {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        .admin-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 640px;
        }
        .admin-table :global(th) {
          text-align: left;
          font-size: 0.74rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-muted);
          padding: 8px 10px;
          border-bottom: 1px solid var(--border);
        }
        .admin-table :global(td) {
          padding: 10px;
          border-bottom: 1px solid var(--border);
          vertical-align: middle;
          font-size: 0.86rem;
        }
      `}</style>
    </div>
  );
};

const StatCard: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: string;
  warn?: boolean;
}> = ({ label, value, hint, warn }) => (
  <div className='ef-card' style={{ padding: 16 }}>
    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
    <div
      style={{
        fontSize: '1.6rem',
        fontWeight: 700,
        marginTop: 4,
        fontVariantNumeric: 'tabular-nums',
        color: warn && value !== 0 && value !== '—' ? 'var(--danger-text)' : 'var(--text)',
      }}
    >
      {value}
    </div>
    {hint && value === '—' && (
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>
    )}
  </div>
);

const sectionTitle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: '1.05rem',
  fontWeight: 700,
  marginBottom: 16,
};

const smallBtn: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: '0.78rem',
  whiteSpace: 'nowrap',
};

export default AdminPage;
