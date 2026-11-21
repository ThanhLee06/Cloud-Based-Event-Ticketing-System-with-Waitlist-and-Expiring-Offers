/**
 * TV1 — Kiểu dữ liệu và hàm gọi API Auth/Profile/Admin (ST-002, ST-003, ST-005).
 * Màn hình login/register/profile/admin (ST-007) gọi các hàm dưới đây thay vì gọi axios trực tiếp.
 */
import { api, tokenStorage } from './client';

export type UserRole = 'CUSTOMER' | 'ORGANIZER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'LOCKED';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  avatar: string | null;
  phone: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: PublicUser;
}

export interface PaginatedUsers {
  items: PublicUser[];
  total: number;
  page: number;
  pageSize: number;
}

// ----- ST-002 -----

export async function login(email: string, password: string): Promise<PublicUser> {
  const { data } = await api.post<AuthResponse>('/auth/login', { email, password });
  tokenStorage.set(data.accessToken);
  return data.user;
}

export interface RegisterResponse {
  requiresVerification: true;
  email: string;
  emailSent: boolean;
  resendAvailableInSec: number;
  message: string;
}

export interface ResendResponse {
  message: string;
  emailSent: boolean;
  resendAvailableInSec: number;
}

/** Đăng ký → backend gửi mã OTP qua email. Chưa có token cho tới khi xác thực. */
export async function register(
  name: string,
  email: string,
  password: string
): Promise<RegisterResponse> {
  const { data } = await api.post<RegisterResponse>('/auth/register', { name, email, password });
  return data;
}

/** Nhập đúng mã OTP → xác thực email và đăng nhập luôn. */
export async function verifyEmail(email: string, code: string): Promise<PublicUser> {
  const { data } = await api.post<AuthResponse>('/auth/verify-email', { email, code });
  tokenStorage.set(data.accessToken);
  return data.user;
}

export async function resendVerification(email: string): Promise<ResendResponse> {
  const { data } = await api.post<ResendResponse>('/auth/resend-verification', { email });
  return data;
}

export function logout(): void {
  tokenStorage.clear();
}

export const isLoggedIn = (): boolean => !!tokenStorage.get();

// ----- ST-003 -----

export async function getMe(): Promise<PublicUser> {
  const { data } = await api.get<PublicUser>('/users/me');
  return data;
}

export async function updateMe(input: { name?: string; phone?: string }): Promise<PublicUser> {
  const { data } = await api.patch<PublicUser>('/users/me', input);
  return data;
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<string> {
  const { data } = await api.post<{ message: string }>('/users/me/change-password', {
    oldPassword,
    newPassword,
  });
  return data.message;
}

// ----- ST-005 -----

export async function adminListUsers(params: {
  role?: UserRole;
  status?: UserStatus;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedUsers> {
  const { data } = await api.get<PaginatedUsers>('/admin/users', { params });
  return data;
}

export async function adminUpdateRole(userId: string, role: UserRole): Promise<PublicUser> {
  const { data } = await api.patch<PublicUser>(`/admin/users/${userId}/role`, { role });
  return data;
}

export async function adminUpdateStatus(userId: string, status: UserStatus): Promise<PublicUser> {
  const { data } = await api.patch<PublicUser>(`/admin/users/${userId}/status`, { status });
  return data;
}

// ----- ST-006 (phần 1) -----

export interface AdminAuditLogItem {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown> | null;
  requestId: string | null;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
}

export interface AdminOverview {
  users: { total: number; customers: number; organizers: number; admins: number; locked: number };
  /** null = chưa có dữ liệu (chờ bảng Event/Reservation/Waitlist của TV2–TV4). */
  totalEvents: number | null;
  confirmedTickets: number | null;
  activeHolds: number | null;
  waitingEntries: number | null;
  offeredEntries: number | null;
  recentAuditLogs: AdminAuditLogItem[];
  generatedAt: string;
}

export async function adminGetOverview(): Promise<AdminOverview> {
  const { data } = await api.get<AdminOverview>('/admin/overview');
  return data;
}
