import { ValidateIf } from 'class-validator';
import { EventFieldRules } from './create-event.dto';

/**
 * Trường không bắt buộc trong PATCH: bỏ qua khi KHÔNG gửi (undefined),
 * nhưng vẫn kiểm tra khi gửi `null` → trả 400 thay vì để DB báo lỗi NOT NULL.
 * (Khác với @IsOptional(), vốn bỏ qua cả null.)
 */
const OptionalField = () => ValidateIf((_object: object, value: unknown) => value !== undefined);

/**
 * ST-012 — DTO cập nhật một phần sự kiện (PATCH, dùng ở ST-013).
 *
 * Mỗi trường dùng đúng quy tắc của CreateEventDto. Các ràng buộc phụ thuộc dữ liệu cũ
 * do Service (ST-013) kiểm tra, ví dụ:
 *  - Chỉ gửi một trong hai startsAt / salesCloseAt → so với giá trị đang lưu.
 *  - capacity mới không được nhỏ hơn soldCount + reservedCount hiện tại.
 */
export class UpdateEventDto {
  @OptionalField()
  @EventFieldRules.title()
  title?: string;

  @OptionalField()
  @EventFieldRules.description()
  description?: string;

  @OptionalField()
  @EventFieldRules.category()
  category?: string;

  @OptionalField()
  @EventFieldRules.venue()
  venue?: string;

  @OptionalField()
  @EventFieldRules.address()
  address?: string;

  @OptionalField()
  @EventFieldRules.city()
  city?: string;

  @OptionalField()
  @EventFieldRules.poster()
  poster?: string;

  @OptionalField()
  @EventFieldRules.priceVnd()
  priceVnd?: number;

  @OptionalField()
  @EventFieldRules.capacity()
  capacity?: number;

  @OptionalField()
  @EventFieldRules.startsAt()
  startsAt?: string;

  /** Khi gửi kèm startsAt trong cùng request, DTO kiểm tra salesCloseAt <= startsAt. */
  @OptionalField()
  @EventFieldRules.salesCloseAt()
  salesCloseAt?: string;
}
