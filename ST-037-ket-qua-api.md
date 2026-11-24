# ST-037 · Kết quả kiểm thử quyền truy cập trực tiếp vào API

- Thời điểm chạy: 05:12:03 24/11/2026 (giờ Việt Nam)
- API: `http://127.0.0.1:4000/api` · chế độ đăng nhập: `local`
- Sự kiện A (của BTC A): Đêm Nhạc Indie Sinh Viên — Phiên Bản Test Tải · Sự kiện B (của BTC B): Đêm Nhạc Acoustic Bên Bờ Sông Hàn
- Kết quả: **28/28 trường hợp đạt**
- Bảng chỉ ghi mã phản hồi HTTP; không lưu access token, ID token hay mật khẩu.

| # | Tài khoản thử | Thao tác | Yêu cầu | Mong đợi | Thực tế | Đạt |
|---|---|---|---|---|---|---|
| 1 | Chưa đăng nhập | Xem hồ sơ cá nhân | `GET /api/users/me` | 401 Unauthorized | 401 Unauthorized | ✅ |
| 2 | Chưa đăng nhập | Xem vé của tôi | `GET /api/reservations/me` | 401 Unauthorized | 401 Unauthorized | ✅ |
| 3 | Chưa đăng nhập | Vào kênh Ban tổ chức | `GET /api/organizer/events` | 401 Unauthorized | 401 Unauthorized | ✅ |
| 4 | Chưa đăng nhập | Tải danh sách người tham dự (CSV) | `GET /api/organizer/events/{sự kiện A}/attendees/csv` | 401 Unauthorized | 401 Unauthorized | ✅ |
| 5 | Chưa đăng nhập | Xem trang quản trị | `GET /api/admin/overview` | 401 Unauthorized | 401 Unauthorized | ✅ |
| 6 | Chưa đăng nhập | Dùng token giả mạo | `GET /api/admin/users` | 401 Unauthorized | 401 Unauthorized | ✅ |
| 7 | Chưa đăng nhập | Gọi tác vụ nội bộ không có khoá bí mật | `POST /api/internal/jobs/expire-sweep` | 401 Unauthorized | 401 Unauthorized | ✅ |
| 8 | Sinh viên (student001@eventflow.vn) | Xem hồ sơ cá nhân | `GET /api/users/me` | 200 OK | 200 OK | ✅ |
| 9 | Sinh viên (student001@eventflow.vn) | Xem tổng quan quản trị | `GET /api/admin/overview` | 403 Forbidden | 403 Forbidden | ✅ |
| 10 | Sinh viên (student001@eventflow.vn) | Xem danh sách người dùng | `GET /api/admin/users` | 403 Forbidden | 403 Forbidden | ✅ |
| 11 | Sinh viên (student001@eventflow.vn) | Gọi API đổi vai trò người dùng | `PATCH /api/admin/users/{chính mình}/role` | 403 Forbidden | 403 Forbidden | ✅ |
| 12 | Sinh viên (student001@eventflow.vn) | Vào kênh Ban tổ chức | `GET /api/organizer/events` | 403 Forbidden | 403 Forbidden | ✅ |
| 13 | Sinh viên (student001@eventflow.vn) | Tải danh sách người tham dự (CSV) | `GET /api/organizer/events/{sự kiện A}/attendees/csv` | 403 Forbidden | 403 Forbidden | ✅ |
| 14 | Quản trị viên (admin@eventflow.vn) | Xem tổng quan quản trị | `GET /api/admin/overview` | 200 OK | 200 OK | ✅ |
| 15 | Quản trị viên (admin@eventflow.vn) | Xem danh sách người dùng | `GET /api/admin/users` | 200 OK | 200 OK | ✅ |
| 16 | Quản trị viên (admin@eventflow.vn) | Tải CSV sự kiện của BTC A | `GET /api/organizer/events/{sự kiện A}/attendees/csv` | 200 OK | 200 OK | ✅ |
| 17 | Quản trị viên (admin@eventflow.vn) | Tải CSV sự kiện của BTC B | `GET /api/organizer/events/{sự kiện B}/attendees/csv` | 200 OK | 200 OK | ✅ |
| 18 | BTC A (organizer01@eventflow.vn) | Xem danh sách sự kiện (chỉ thấy của mình) | `GET /api/organizer/events` | 200 OK | 200 OK | ✅ |
| 19 | BTC A (organizer01@eventflow.vn) | Xem người tham dự sự kiện A | `GET /api/organizer/events/{sự kiện A}/attendees` | 200 OK | 200 OK | ✅ |
| 20 | BTC A (organizer01@eventflow.vn) | Tải CSV người tham dự sự kiện A | `GET /api/organizer/events/{sự kiện A}/attendees/csv` | 200 OK | 200 OK | ✅ |
| 21 | BTC A (organizer01@eventflow.vn) | Tải CSV người tham dự sự kiện B | `GET /api/organizer/events/{sự kiện B}/attendees/csv` | 403 Forbidden | 403 Forbidden | ✅ |
| 22 | BTC A (organizer01@eventflow.vn) | Xem người tham dự sự kiện B | `GET /api/organizer/events/{sự kiện B}/attendees` | 403 Forbidden | 403 Forbidden | ✅ |
| 23 | BTC A (organizer01@eventflow.vn) | Xem danh sách chờ sự kiện B | `GET /api/organizer/events/{sự kiện B}/waitlist` | 403 Forbidden | 403 Forbidden | ✅ |
| 24 | BTC A (organizer01@eventflow.vn) | Sửa sự kiện B | `PATCH /api/organizer/events/{sự kiện B}` | 403 Forbidden | 403 Forbidden | ✅ |
| 25 | BTC A (organizer01@eventflow.vn) | Tải CSV của sự kiện không tồn tại | `GET /api/organizer/events/{UUID ngẫu nhiên}/attendees/csv` | 404 Not Found | 404 Not Found | ✅ |
| 26 | BTC A (organizer01@eventflow.vn) | Xem tổng quan quản trị | `GET /api/admin/overview` | 403 Forbidden | 403 Forbidden | ✅ |
| 27 | BTC B (organizer02@eventflow.vn) | Tải CSV người tham dự sự kiện B | `GET /api/organizer/events/{sự kiện B}/attendees/csv` | 200 OK | 200 OK | ✅ |
| 28 | BTC B (organizer02@eventflow.vn) | Tải CSV người tham dự sự kiện A | `GET /api/organizer/events/{sự kiện A}/attendees/csv` | 403 Forbidden | 403 Forbidden | ✅ |
