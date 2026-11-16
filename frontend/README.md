# EventFlow Frontend

Frontend giao diện cho đề tài **Cloud-Based Event Ticketing System with Waitlist and Expiring Offers**.

## Cài đặt & Khởi chạy

```bash
# Cài đặt thư viện
pnpm install

# Kiểm tra cú pháp & TypeScript
pnpm run lint
pnpm run typecheck

# Khởi chạy môi trường phát triển
pnpm run dev
# Mở: http://localhost:3000

# Chạy bản tối ưu sản phẩm
pnpm run build
pnpm run start -p 3000
```

## Các trang chính

- `/`: Khám phá sự kiện, tìm kiếm & bộ lọc danh mục
- `/events/[slug]`: Chi tiết sự kiện & Booking Panel động
- `/checkout/[reservationId]`: Giữ vé & xác nhận đặt vé
- `/my-tickets`: Vé của tôi (Đã xác nhận / Đang giữ / Lịch sử)
- `/my-waitlist`: Danh sách chờ FIFO & Offer đang mở
- `/offers/[offerId]`: Quyền mua vé có countdown thời hạn
- `/organizer`: Bảng điều khiển Ban tổ chức & Quản lý hàng chờ
- `/login`, `/register`: Đăng nhập & Đăng ký tài khoản
