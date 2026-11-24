# BÁO CÁO NGHIỆM THU KIỂM THỬ TRÊN AWS CLOUDWATCH (ST-048 & ST-049)

> **Môi trường:** AWS Cloud (Region: `ap-southeast-2`, Account: `937836105619`)  
> **Thời điểm cập nhật:** `2026-11-24T05:18:29Z`  
> **Trạng thái Cảnh báo (Alarm State):** 🔴 **ALARM (Đã kích hoạt cảnh báo thực tế)**  
> **Trạng thái Dashboard:** 🟢 **Đã hiển thị đầy đủ 4 số đo trên biểu đồ**

---

## 1. ĐƯỜNG DẪN TRỰC TIẾP TRÊN AWS CONSOLE

1. **Bảng điều khiển 4 chỉ số (Operations Dashboard):**  
   🔗 [https://ap-southeast-2.console.aws.amazon.com/cloudwatch/home?region=ap-southeast-2#dashboards:name=eventflow-preview-operations](https://ap-southeast-2.console.aws.amazon.com/cloudwatch/home?region=ap-southeast-2#dashboards:name=eventflow-preview-operations)
2. **Cảnh báo vượt ngưỡng gửi lặp (CloudWatch Alarm):**  
   🔗 [https://ap-southeast-2.console.aws.amazon.com/cloudwatch/home?region=ap-southeast-2#alarmsV2:alarm/eventflow-preview-duplicate-replays-exercise](https://ap-southeast-2.console.aws.amazon.com/cloudwatch/home?region=ap-southeast-2#alarmsV2:alarm/eventflow-preview-duplicate-replays-exercise)
3. **Nhật ký ứng dụng đã che PII (CloudWatch Logs):**  
   🔗 [Log Group: `/eventflow/eventflow-preview/application`](https://ap-southeast-2.console.aws.amazon.com/cloudwatch/home?region=ap-southeast-2#logsV2:log-groups/log-group/$252Feventflow$252Feventflow-preview$252Fapplication)  
   *(Luồng nhật ký diễn tập: `exercise/st049-rehearsal`)*

---

## 2. BỐN CHỈ SỐ THỰC TẾ TRÊN BIỂU ĐỒ DASHBOARD

| Widget | Tên Metric | Thống kê (Stat) | Giá trị thực tế trên biểu đồ | Nhận xét trạng thái |
|:---|:---|:---:|:---:|:---|
| **1. Booking p95 Latency** | `BookingLatencyMs` | `p95` (60s) | **18.5 ms** | Thời gian phản hồi xuất sắc, lượt replay cache dưới 20ms |
| **2. Requests Rejected: Sold Out** | `CapacityConflict` | `Sum` (60s) | **1 yêu cầu** | Ghi nhận đúng sự kiện hết chỗ |
| **3. Idempotency Replays (Alarm Source)** | `DuplicateReplay` | `Sum` (60s) | **10 yêu cầu** | Tăng đúng +10 tương ứng 10 lần gửi lại liên tiếp |
| **4. PostgreSQL Connections** | `DbConnectionCount` | `Maximum` (60s) | **4 kết nối** | Kết nối pool ổn định, advisory lock giải phóng ngay |

---

## 3. TRẠNG THÁI CẢNH BÁO THỰC TẾ (ST-049 REHEARSAL)

- **Tên cảnh báo:** `eventflow-preview-duplicate-replays-exercise`
- **Ngưỡng cấu hình:** $\ge 3$ lượt gửi lại trong 60 giây.
- **Trạng thái hiện tại:** 🔴 **ALARM**
- **Lý do kích hoạt (State Reason):**
  > `Threshold Crossed: 1 out of the last 1 datapoints [10.0 (24/11/26 05:17:00)] was greater than or equal to the threshold (3.0) (minimum 1 datapoint for OK -> ALARM transition).`
- **Thời điểm chuyển trạng thái:** `2026-11-24T12:18:29.148+07:00` (độ trễ phát hiện $< 60$ giây).

---

## 4. BẰNG CHỨNG TRUY VẤN NHẬT KÝ ĐÃ CHE THÔNG TIN (CLOUDWATCH LOGS)

Trong luồng `exercise/st049-rehearsal`, truy vấn CloudWatch Logs Insights:
```sql
fields @timestamp, requestId, key, endpoint, @message
| filter event = "duplicate_replay"
| sort @timestamp desc
```
Kết quả hiển thị 10 dòng sự kiện `duplicate_replay` liên tiếp:
- **Mã theo dõi (Key):** `ST049-LOOP10-1795496936701`
- **Mã đặt chỗ (Booking ID):** `aa409b3d-a546-4d57-bad8-c5da9f8f0905`
- **Endpoint:** `POST:/reservations`
- **Bảo mật:** Toàn bộ token xác thực hiển thị dạng `***REDACTED***`.

---

## 5. BƯỚC XỬ LÝ ĐẦU TIÊN KHI NỔ CẢNH BÁO (FIRST RESPONSE SOP)

1. **Tra cứu nhật ký CloudWatch:** Vào Log Group `/eventflow/eventflow-preview/application`, lấy `key` từ sự kiện `duplicate_replay`.
2. **Đối chiếu cơ sở dữ liệu:** Kiểm tra bảng `reservations` theo `bookingId`. Xác nhận chỉ có **duy nhất 1 vé** được tạo.
3. **Kiểm tra kho vé:** Kiểm tra bảng `events`. Xác nhận `reservedCount` không bị tăng thêm hay trừ trùng.
4. **Kết luận:** Hệ thống Idempotency đã bảo vệ toàn vẹn dữ liệu thành công, chặn đứng rủi ro sinh trùng vé khi client retry nhiều lần.
