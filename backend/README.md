# EventFlow Backend (NestJS + PostgreSQL)

Khung khởi tạo `ST-000` cho hệ thống **EventFlow** (Modular Monolith).

## Khởi chạy môi trường phát triển (Local)

```bash
# 1. Tại thư mục gốc của repo, bật PostgreSQL qua Docker Compose
docker compose up -d

# 2. Vào thư mục backend và tạo file .env từ mẫu
cd backend
cp .env.example .env

# 3. Cài đặt thư viện & sinh Prisma Client
pnpm install
pnpm run prisma:generate

# 4. Chạy migration & seed dữ liệu mẫu
pnpm run prisma:migrate
pnpm run prisma:seed

# 5. Khởi chạy server NestJS (port 4000)
pnpm run start:dev
# Kiểm tra healthcheck: http://localhost:4000/api/health
```

## TV1 — Auth, Profile & Admin (ST-001 → ST-005)

Tài khoản seed (mật khẩu chung `SEED_PASSWORD`, mặc định `Eventflow@123`):

| Vai trò   | Email                                               |
| --------- | --------------------------------------------------- |
| CUSTOMER  | `student001@eventflow.vn` … `student100@eventflow.vn` |
| ORGANIZER | `organizer01@eventflow.vn`, `organizer02@eventflow.vn` |
| ADMIN     | `admin@eventflow.vn`                                |

| Method | Endpoint                          | Quyền       | Ghi chú                                     |
| ------ | --------------------------------- | ----------- | ------------------------------------------- |
| POST   | `/api/auth/register`              | Public      | 201 · 400 · 409 — role luôn là CUSTOMER     |
| POST   | `/api/auth/login`                 | Public      | 200 · 401 · 403 (LOCKED) · 429 (rate limit) |
| GET    | `/api/users/me`                   | Đăng nhập   |                                             |
| PATCH  | `/api/users/me`                   | Đăng nhập   | Chỉ sửa `name`, `phone`                     |
| POST   | `/api/users/me/change-password`   | Đăng nhập   | 400 nếu sai mật khẩu cũ / trùng / < 6 ký tự |
| GET    | `/api/admin/overview`             | ADMIN       | Số liệu toàn sàn + 50 audit log gần nhất    |
| GET    | `/api/admin/users`                | ADMIN       | `?role=&status=&q=&page=&pageSize=`         |
| PATCH  | `/api/admin/users/:id/role`       | ADMIN       | Ghi `audit_logs` trong cùng transaction     |
| PATCH  | `/api/admin/users/:id/status`     | ADMIN       | `ACTIVE` / `LOCKED`, có audit log           |

**Bảo vệ API của module khác** (AuthModule là `@Global`, không cần import):

```ts
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, RequestId } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ORGANIZER', 'ADMIN') // bỏ @Roles nếu chỉ cần đăng nhập
@Post()
create(@CurrentUser() user: AuthUser, @RequestId() requestId: string | null) { ... }
```

**Frontend (ST-007):** phiên đăng nhập thật nằm ở `frontend/lib/auth/AuthProvider.tsx` — dùng `const { user, status } = useAuth()` để biết ai đang đăng nhập. Trang mới: `/profile`, `/admin`.

Frontend gọi API qua `frontend/lib/api/client.ts` (tự gắn Bearer token, `x-request-id`, đẩy về `/login` khi 401, `postIdempotent()` giữ nguyên `Idempotency-Key` khi retry).

> Load test 100 người đăng nhập từ cùng 1 máy: tăng tạm `AUTH_LOGIN_RATE_LIMIT` (vd. 1000), vì mặc định chỉ 10 lần/phút/IP.
