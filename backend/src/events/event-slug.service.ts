import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildEventSlug,
  isEventSlugUniqueViolation,
  SLUG_SUFFIX_DEFAULT_LENGTH,
} from './slug.util';

export interface UniqueSlugOptions {
  /** Số lần thử tối đa (mặc định 5). */
  maxAttempts?: number;
  /** Độ dài hậu tố 4–6 (mặc định 4). */
  suffixLength?: number;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const EXHAUSTED_MESSAGE = 'Không thể tạo đường dẫn (slug) duy nhất cho sự kiện. Vui lòng thử lại.';

/**
 * ST-012 — Sinh slug không trùng với các sự kiện đã có.
 *
 * Kiểm tra trước trong DB chỉ giảm khả năng trùng; nó KHÔNG đủ khi hai request chạy đồng thời
 * (cả hai cùng thấy slug còn trống rồi cùng ghi). Vì vậy ST-013 nên tạo sự kiện qua
 * `createWithUniqueSlug()`: nếu INSERT bị UNIQUE(slug) từ chối (P2002) thì sinh slug mới và ghi lại.
 *
 * Lưu ý: chưa đăng ký vào EventsModule — ST-013 thêm vào `providers` khi dùng.
 */
@Injectable()
export class EventSlugService {
  private readonly logger = new Logger(EventSlugService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** true nếu đã có sự kiện dùng slug này. */
  async slugExists(slug: string): Promise<boolean> {
    const found = await this.prisma.event.findUnique({ where: { slug }, select: { id: true } });
    return found !== null;
  }

  /** Sinh slug chưa có trong DB (kiểm tra trước, chưa giữ chỗ). */
  async generateUniqueSlug(title: string, options: UniqueSlugOptions = {}): Promise<string> {
    const { maxAttempts, suffixLength } = this.resolveOptions(options);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const candidate = buildEventSlug(title, suffixLength);
      if (!(await this.slugExists(candidate))) return candidate;
      this.logger.warn(`Slug "${candidate}" đã tồn tại, thử lại (${attempt}/${maxAttempts}).`);
    }
    throw new InternalServerErrorException(EXHAUSTED_MESSAGE);
  }

  /**
   * Dành cho ST-013: sinh slug rồi gọi `create(slug)`; nếu INSERT bị trùng slug do ghi đồng thời
   * thì sinh slug khác và gọi lại. Lỗi khác (kể cả P2002 trên cột khác) được ném nguyên trạng.
   *
   *   const event = await this.slugs.createWithUniqueSlug(dto.title, (slug) =>
   *     this.prisma.event.create({ data: { ...data, slug } })
   *   );
   */
  async createWithUniqueSlug<T>(
    title: string,
    create: (slug: string) => Promise<T>,
    options: UniqueSlugOptions = {}
  ): Promise<T> {
    const { maxAttempts, suffixLength } = this.resolveOptions(options);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const candidate = buildEventSlug(title, suffixLength);
      if (await this.slugExists(candidate)) {
        this.logger.warn(`Slug "${candidate}" đã tồn tại, thử lại (${attempt}/${maxAttempts}).`);
        continue;
      }
      try {
        return await create(candidate);
      } catch (err) {
        if (!isEventSlugUniqueViolation(err)) throw err;
        this.logger.warn(
          `Trùng slug "${candidate}" khi ghi đồng thời, thử lại (${attempt}/${maxAttempts}).`
        );
      }
    }
    throw new InternalServerErrorException(EXHAUSTED_MESSAGE);
  }

  private resolveOptions(options: UniqueSlugOptions) {
    const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new RangeError('maxAttempts phải là số nguyên từ 1 trở lên.');
    }
    return { maxAttempts, suffixLength: options.suffixLength ?? SLUG_SUFFIX_DEFAULT_LENGTH };
  }
}
