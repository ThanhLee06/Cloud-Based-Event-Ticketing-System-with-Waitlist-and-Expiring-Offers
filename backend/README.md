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
