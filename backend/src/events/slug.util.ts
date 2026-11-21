import { randomInt } from 'crypto';
import { Prisma } from '@prisma/client';

/**
 * ST-012 — Tiện ích sinh slug cho sự kiện.
 *
 * "Hội thảo Cloud" → "hoi-thao-cloud-7x9k"
 *  - Bỏ dấu tiếng Việt (kể cả đ/Đ), chữ thường, chỉ giữ a-z 0-9, nối bằng dấu gạch ngang.
 *  - Hậu tố ngẫu nhiên 4–6 ký tự, sinh bằng crypto.randomInt (CSPRNG, không đoán trước được).
 *  - Độ dài luôn nằm trong giới hạn cột `events.slug VARCHAR(180)`.
 */

/** Giới hạn cột slug trong schema Prisma: @db.VarChar(180). */
export const SLUG_DB_MAX_LENGTH = 180;
/** Giới hạn phần chữ (trước hậu tố) để URL gọn; luôn < SLUG_DB_MAX_LENGTH - 7. */
export const SLUG_BASE_MAX_LENGTH = 100;
/** Dùng khi tiêu đề rỗng hoặc chỉ có ký tự đặc biệt. */
export const SLUG_FALLBACK_BASE = 'su-kien';

export const SLUG_SUFFIX_MIN_LENGTH = 4;
export const SLUG_SUFFIX_MAX_LENGTH = 6;
export const SLUG_SUFFIX_DEFAULT_LENGTH = 4;
export const SLUG_SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Slug hợp lệ: các cụm a-z0-9 nối bằng một dấu gạch ngang, không có gạch ở đầu/cuối. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Chuyển tiêu đề (có dấu, ký tự đặc biệt) thành phần chữ của slug.
 * Trả về SLUG_FALLBACK_BASE nếu không còn ký tự hợp lệ nào.
 */
export function slugifyTitle(title: string | null | undefined): string {
  const base = (title ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // bỏ dấu thanh, dấu mũ, dấu móc...
    .replace(/[đĐ]/g, 'd') // đ/Đ không tách được bằng NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const truncated = base.slice(0, SLUG_BASE_MAX_LENGTH).replace(/-+$/g, '');
  return truncated || SLUG_FALLBACK_BASE;
}

/** Hậu tố ngẫu nhiên an toàn (crypto.randomInt), độ dài 4–6 ký tự a-z0-9. */
export function randomSlugSuffix(length: number = SLUG_SUFFIX_DEFAULT_LENGTH): string {
  if (
    !Number.isInteger(length) ||
    length < SLUG_SUFFIX_MIN_LENGTH ||
    length > SLUG_SUFFIX_MAX_LENGTH
  ) {
    throw new RangeError(
      `Độ dài hậu tố slug phải từ ${SLUG_SUFFIX_MIN_LENGTH} đến ${SLUG_SUFFIX_MAX_LENGTH} ký tự.`
    );
  }
  let suffix = '';
  for (let i = 0; i < length; i++) {
    suffix += SLUG_SUFFIX_ALPHABET[randomInt(SLUG_SUFFIX_ALPHABET.length)];
  }
  return suffix;
}

/** Ghép slug hoàn chỉnh: "<phần-chữ>-<hậu-tố>". Chưa kiểm tra trùng trong DB. */
export function buildEventSlug(
  title: string | null | undefined,
  suffixLength: number = SLUG_SUFFIX_DEFAULT_LENGTH
): string {
  return `${slugifyTitle(title)}-${randomSlugSuffix(suffixLength)}`;
}

/**
 * true nếu lỗi là vi phạm UNIQUE trên cột events.slug (Prisma P2002).
 * Dùng để thử lại khi hai request tạo sự kiện cùng lúc sinh trùng slug.
 */
export function isEventSlugUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
    return false;
  }
  const target = err.meta?.target;
  if (Array.isArray(target)) return target.map(String).includes('slug');
  if (typeof target === 'string') return target === 'events_slug_key' || target === 'slug';
  return false;
}
