import type { User, UserRole, UserStatus } from '@prisma/client';

/** Nội dung JWT Access Token (ST-002). */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

/** User hiện tại do JwtAuthGuard nạp từ DB (luôn là dữ liệu mới nhất, không tin role trong token). */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
}

/** Dữ liệu user an toàn để trả cho client — tuyệt đối không có passwordHash. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  avatar: string | null;
  phone: string | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    avatar: user.avatar,
    phone: user.phone,
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/** Prisma select tương ứng PublicUser — dùng cho truy vấn danh sách. */
export const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  avatar: true,
  phone: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const ACCESS_TOKEN_TTL_SECONDS = 24 * 60 * 60;
export const BCRYPT_SALT_ROUNDS = 10;
