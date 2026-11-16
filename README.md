# Cloud-Based Event Ticketing System with Waitlist and Expiring Offers

Nền tảng bán vé sự kiện trên nền tảng điện toán đám mây (Cloud-Based), tập trung giải quyết bài toán đặt vé đồng thời, giữ chỗ chống tranh chấp (Hold Reservation), quản lý danh sách chờ tự động theo thứ tự đăng ký (FIFO Waitlist) và quyền mua vé độc quyền có thời hạn (Expiring Offers).

---

## 1. Tổng quan giao diện EventFlow (Frontend)

Mã nguồn giao diện đặt tại thư mục [`frontend/`](./frontend), phát triển trên nền tảng **Next.js App Router**, **React 19** và **TypeScript**.

### Ba trụ cột trải nghiệm cốt lõi:
1. **Còn vé**: Khám phá sự kiện, xem thông tin chi tiết và đặt giữ một vé trong **10 phút** để hoàn tất xác nhận thanh toán.
2. **Hết vé**: Khi sự kiện bán hết vé, nút mua vé tự động chuyển thành **"Tham gia danh sách chờ (FIFO)"**. Người dùng nhận số thứ tự minh bạch (Ví dụ: vị trí #1, #2, #3...).
3. **Quyền mua vé có thời hạn (Expiring Offers)**: Khi có người hủy vé hoặc lượt giữ vé quá hạn, hệ thống tự động cấp quyền mua vé cho người đang chờ đầu tiên với đồng hồ đếm ngược. Nếu người dùng chấp nhận, vé chuyển thành vé hợp lệ; nếu từ chối hoặc để hết hạn, quyền mua sẽ tự động chuyển tiếp cho người xếp sau.

---

## 2. Hướng dẫn cài đặt và chạy Local

### Yêu cầu môi trường:
- **Node.js**: v20+ hoặc v24+
- **pnpm**: v9+ hoặc v12+ (hoặc `npm`)

### Các bước khởi chạy:

```bash
# 1. Di chuyển vào thư mục frontend
cd frontend

# 2. Cài đặt các gói phụ thuộc
pnpm install

# 3. Chạy kiểm tra tĩnh (Lint & Typecheck)
pnpm run lint
pnpm run typecheck

# 4. Khởi chạy môi trường phát triển (Development)
pnpm run dev
# Mở trình duyệt tại: http://localhost:3000

# HOẶC: Build và chạy bản tối ưu sản phẩm (Production Build)
pnpm run build
pnpm run start -p 3000
```

---

## 3. Bản đồ các màn hình (Site Map)

| Màn hình | Đường dẫn Route | Mô tả chức năng |
| --- | --- | --- |
| **Khám phá sự kiện** | `/` | Tìm kiếm theo từ khóa/địa điểm, bộ lọc danh mục và lọc trạng thái còn vé. |
| **Chi tiết sự kiện** | `/events/[slug]` | Poster 16:9, thời gian, địa điểm, mô tả chi tiết, Booking Panel động phản ánh đúng trạng thái người dùng (Đặt vé / Chờ / Đã có vé / Nhận offer). |
| **Thanh toán giữ chỗ** | `/checkout/[reservationId]` | Tóm tắt đơn vé, đồng hồ đếm ngược thời gian giữ chỗ, nút xác nhận và hủy giữ vé. |
| **Vé của tôi** | `/my-tickets` | 3 tab: Vé đã xác nhận (có mã vé & nút hủy vé), Vé đang giữ chỗ (có countdown & nút thanh toán tiếp), Lịch sử vé. |
| **Danh sách chờ** | `/my-waitlist` | Danh sách các sự kiện đang xếp hàng chờ (hiển thị vị trí thực tế #X), panel nhận offer nổi bật và lịch sử chờ. |
| **Chi tiết quyền mua vé** | `/offers/[offerId]` | Màn hình dành riêng cho người nhận offer với countdown thời hạn độc quyền, nút chấp nhận nhận vé hoặc bỏ lượt nhường người sau. |
| **Ban tổ chức (Overview)** | `/organizer` | Thống kê số liệu (Tổng vé bán, vé giữ, người chờ, offer mở), bảng hàng chờ sự kiện, nút cấp vé FIFO và form tạo sự kiện mới. |
| **Đăng nhập / Đăng ký** | `/login`, `/register` | Giao diện đăng nhập kèm bộ chọn nhanh chuyển đổi giữa tài khoản Khách mua và Ban tổ chức. |
