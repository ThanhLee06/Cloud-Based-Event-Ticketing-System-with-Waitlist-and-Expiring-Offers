import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/**
 * ST-012 — DTO tạo sự kiện (POST, dùng ở ST-013).
 *
 * Chỉ nhận các trường Ban tổ chức được phép nhập. Các trường do hệ thống quản lý
 * (id, slug, organizerId, soldCount, reservedCount, nextWaitlistSeq, featured, createdAt)
 * KHÔNG khai báo ở đây → ValidationPipe toàn cục (forbidNonWhitelisted) trả 400 nếu client gửi lên.
 *
 * startsAt / salesCloseAt giữ dạng chuỗi ISO 8601 có múi giờ; Service (ST-013) chuyển sang Date.
 */

/** Giới hạn của kiểu Int trong PostgreSQL. */
export const PG_INT_MAX = 2_147_483_647;

/** ISO 8601 có ngày, giờ và múi giờ (Z hoặc ±hh:mm), ví dụ 2026-12-31T19:00:00+07:00. */
const ISO_DATETIME_WITH_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Chuỗi bắt buộc: tự cắt khoảng trắng, không rỗng, không vượt độ dài cột trong schema Prisma. */
const RequiredText = (label: string, maxLength?: number) => {
  const decorators = [
    Transform(trim),
    IsString({ message: `${label} phải là chuỗi ký tự.` }),
    IsNotEmpty({ message: `${label} không được để trống.` }),
  ];
  if (maxLength) {
    decorators.push(MaxLength(maxLength, { message: `${label} tối đa ${maxLength} ký tự.` }));
  }
  return applyDecorators(...decorators);
};

const IsoDateTime = (label: string) => {
  const message = `${label} phải là ngày giờ ISO 8601 hợp lệ, có múi giờ (ví dụ 2026-12-31T19:00:00+07:00).`;
  return applyDecorators(
    IsString({ message }),
    Matches(ISO_DATETIME_WITH_TZ, { message }),
    IsISO8601({ strict: true }, { message })
  );
};

/**
 * Ràng buộc chéo: giá trị của trường này (ngày giờ) không được sau `relatedProperty`.
 * Chỉ kiểm tra khi CẢ HAI trường đều có trong request và đều là ngày hợp lệ; trường hợp
 * cập nhật một phần (thiếu một trong hai) sẽ được Service (ST-013) so với dữ liệu cũ.
 */
export function IsNotAfterField(
  relatedProperty: string,
  validationOptions?: ValidationOptions
): PropertyDecorator {
  return (object: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isNotAfterField',
      target: object.constructor,
      propertyName: String(propertyName),
      constraints: [relatedProperty],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [related] = args.constraints as [string];
          const other = (args.object as Record<string, unknown>)[related];
          if (typeof value !== 'string' || typeof other !== 'string') return true;
          const current = Date.parse(value);
          const limit = Date.parse(other);
          if (Number.isNaN(current) || Number.isNaN(limit)) return true;
          return current <= limit;
        },
      },
    });
  };
}

// ----------------------------- Quy tắc dùng chung cho Create / Update -----------------------------

export const EventFieldRules = {
  title: () => RequiredText('Tên sự kiện', 255),
  description: () => RequiredText('Mô tả sự kiện'),
  category: () => RequiredText('Thể loại', 100),
  venue: () => RequiredText('Địa điểm tổ chức', 255),
  address: () => RequiredText('Địa chỉ', 500),
  city: () => RequiredText('Thành phố', 100),
  poster: () =>
    applyDecorators(
      RequiredText('Ảnh poster', 500),
      IsUrl(
        { protocols: ['http', 'https'], require_protocol: true },
        { message: 'Ảnh poster phải là đường dẫn http(s) hợp lệ.' }
      )
    ),
  priceVnd: () =>
    applyDecorators(
      IsInt({ message: 'Giá vé phải là số nguyên (VND).' }),
      Min(0, { message: 'Giá vé không được âm.' }),
      Max(PG_INT_MAX, { message: `Giá vé tối đa ${PG_INT_MAX} VND.` })
    ),
  capacity: () =>
    applyDecorators(
      IsInt({ message: 'Sức chứa phải là số nguyên từ 1 trở lên.' }),
      Min(1, { message: 'Sức chứa phải là số nguyên từ 1 trở lên.' }),
      Max(PG_INT_MAX, { message: `Sức chứa tối đa ${PG_INT_MAX}.` })
    ),
  startsAt: () => IsoDateTime('Thời gian bắt đầu'),
  salesCloseAt: () =>
    applyDecorators(
      IsoDateTime('Thời gian đóng bán vé'),
      IsNotAfterField('startsAt', {
        message: 'Thời gian đóng bán vé phải trước hoặc bằng thời gian bắt đầu sự kiện.',
      })
    ),
};

export class CreateEventDto {
  @EventFieldRules.title()
  title!: string;

  @EventFieldRules.description()
  description!: string;

  @EventFieldRules.category()
  category!: string;

  @EventFieldRules.venue()
  venue!: string;

  @EventFieldRules.address()
  address!: string;

  @EventFieldRules.city()
  city!: string;

  @EventFieldRules.poster()
  poster!: string;

  /** 0 = sự kiện miễn phí. */
  @EventFieldRules.priceVnd()
  priceVnd!: number;

  @EventFieldRules.capacity()
  capacity!: number;

  @EventFieldRules.startsAt()
  startsAt!: string;

  @EventFieldRules.salesCloseAt()
  salesCloseAt!: string;
}
