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

export async function register(name: string, email: string, password: string): Promise<PublicUser> {
  const { data } = await api.post<AuthResponse>('/auth/register', { name, email, password });
  tokenStorage.set(data.accessToken);
  return data.user;
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
