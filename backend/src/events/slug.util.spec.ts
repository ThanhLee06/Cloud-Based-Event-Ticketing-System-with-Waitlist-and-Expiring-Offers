jest.mock('crypto', () => {
  const actual = jest.requireActual<typeof import('crypto')>('crypto');
  return { ...actual, randomInt: jest.fn(actual.randomInt) };
});

import { randomInt } from 'crypto';
import { InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventSlugService } from './event-slug.service';
import {
  buildEventSlug,
  isEventSlugUniqueViolation,
  randomSlugSuffix,
  SLUG_BASE_MAX_LENGTH,
  SLUG_DB_MAX_LENGTH,
  SLUG_FALLBACK_BASE,
  SLUG_PATTERN,
  slugifyTitle,
} from './slug.util';

const randomIntMock = randomInt as unknown as jest.Mock;

const p2002 = (target: unknown) =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });

describe('ST-012 - slugifyTitle', () => {
  it.each([
    ['Hội thảo Cloud', 'hoi-thao-cloud'],
    ['Đêm Nhạc Acoustic Bên Bờ Sông Hàn', 'dem-nhac-acoustic-ben-bo-song-han'],
    ['ĐÀ NẴNG đẹp lắm', 'da-nang-dep-lam'],
    ['Lễ hội Ẩm thực Miền Tây', 'le-hoi-am-thuc-mien-tay'],
    ['Ưu đãi Ơn giời Ỹ Ỵ', 'uu-dai-on-gioi-y-y'],
    ['Tiếng Việt viết bằng dấu tổ hợp: Hội thảo'.normalize('NFD'), 'tieng-viet-viet-bang-dau-to-hop-hoi-thao'],
  ])('bỏ dấu tiếng Việt: %p → %p', (title, expected) => {
    expect(slugifyTitle(title)).toBe(expected);
  });

  it.each([
    ['  Workshop   AI & Cloud!!!  ', 'workshop-ai-cloud'],
    ['Next.js / NestJS @ 2026 — #1', 'next-js-nestjs-2026-1'],
    ['C++ & C# <script>alert(1)</script>', 'c-c-script-alert-1-script'],
    ['Tab\tvà\nxuống dòng', 'tab-va-xuong-dong'],
    ['--Gạch--đầu--cuối--', 'gach-dau-cuoi'],
    ['Emoji 🎉🎶 party', 'emoji-party'],
  ])('xử lý khoảng trắng và ký tự đặc biệt: %p → %p', (title, expected) => {
    expect(slugifyTitle(title)).toBe(expected);
  });

  it.each(['', '   ', '!!! @@@ ###', '🎉🎶', null, undefined])(
    'tiêu đề trống/không có ký tự hợp lệ %p → fallback',
    (title) => {
      expect(slugifyTitle(title)).toBe(SLUG_FALLBACK_BASE);
    }
  );

  it('cắt tiêu đề quá dài và không để gạch ngang ở cuối', () => {
    const slug = slugifyTitle(`${'a'.repeat(SLUG_BASE_MAX_LENGTH - 1)} bcd`);
    expect(slug.length).toBeLessThanOrEqual(SLUG_BASE_MAX_LENGTH);
    expect(slug).toMatch(SLUG_PATTERN);
  });
});

describe('ST-012 - randomSlugSuffix / buildEventSlug', () => {
  it.each([4, 5, 6])('sinh hậu tố %i ký tự a-z0-9 bằng crypto.randomInt', (length) => {
    randomIntMock.mockClear();
    const suffix = randomSlugSuffix(length);
    expect(suffix).toMatch(new RegExp(`^[a-z0-9]{${length}}$`));
    expect(randomIntMock).toHaveBeenCalledTimes(length);
  });

  it('mặc định 4 ký tự', () => {
    expect(randomSlugSuffix()).toHaveLength(4);
  });

  it.each([0, 3, 7, 4.5, NaN])('từ chối độ dài hậu tố %p', (length) => {
    expect(() => randomSlugSuffix(length)).toThrow(RangeError);
  });

  it('hậu tố thay đổi giữa các lần sinh', () => {
    const suffixes = new Set(Array.from({ length: 50 }, () => randomSlugSuffix(6)));
    expect(suffixes.size).toBeGreaterThan(45);
  });

  it('ghép đúng định dạng "hoi-thao-cloud-xxxx"', () => {
    expect(buildEventSlug('Hội thảo Cloud')).toMatch(/^hoi-thao-cloud-[a-z0-9]{4}$/);
    expect(buildEventSlug('', 6)).toMatch(/^su-kien-[a-z0-9]{6}$/);
  });

  it('luôn khớp SLUG_PATTERN và nằm trong VARCHAR(180)', () => {
    const slug = buildEventSlug(`${'Tiêu đề rất dài '.repeat(30)}!!!`, 6);
    expect(slug).toMatch(SLUG_PATTERN);
    expect(slug.length).toBeLessThanOrEqual(SLUG_DB_MAX_LENGTH);
  });
});

describe('ST-012 - isEventSlugUniqueViolation', () => {
  it('nhận diện P2002 trên cột slug', () => {
    expect(isEventSlugUniqueViolation(p2002(['slug']))).toBe(true);
    expect(isEventSlugUniqueViolation(p2002('events_slug_key'))).toBe(true);
  });

  it('bỏ qua P2002 trên cột khác và lỗi khác', () => {
    expect(isEventSlugUniqueViolation(p2002(['email']))).toBe(false);
    expect(isEventSlugUniqueViolation(new Error('boom'))).toBe(false);
    expect(isEventSlugUniqueViolation(null)).toBe(false);
  });
});

describe('ST-012 - EventSlugService', () => {
  const prismaMock = { event: { findUnique: jest.fn() } };
  let service: EventSlugService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EventSlugService(prismaMock as never);
    jest.spyOn((service as unknown as { logger: { warn: () => void } }).logger, 'warn')
      .mockImplementation(() => undefined);
  });

  it('trả slug khi chưa tồn tại trong DB', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);
    const slug = await service.generateUniqueSlug('Hội thảo Cloud');
    expect(slug).toMatch(/^hoi-thao-cloud-[a-z0-9]{4}$/);
    expect(prismaMock.event.findUnique).toHaveBeenCalledWith({
      where: { slug },
      select: { id: true },
    });
  });

  it('slug đã tồn tại → sinh slug khác', async () => {
    prismaMock.event.findUnique
      .mockResolvedValueOnce({ id: 'existing-1' })
      .mockResolvedValueOnce({ id: 'existing-2' })
      .mockResolvedValueOnce(null);
    const slug = await service.generateUniqueSlug('Hội thảo Cloud');
    expect(prismaMock.event.findUnique).toHaveBeenCalledTimes(3);
    const checked = prismaMock.event.findUnique.mock.calls.map((c) => c[0].where.slug);
    expect(slug).toBe(checked[2]);
  });

  it('hết số lần thử → InternalServerErrorException', async () => {
    prismaMock.event.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(service.generateUniqueSlug('Hội thảo Cloud', { maxAttempts: 3 })).rejects.toThrow(
      InternalServerErrorException
    );
    expect(prismaMock.event.findUnique).toHaveBeenCalledTimes(3);
  });

  it('createWithUniqueSlug: trùng slug khi ghi đồng thời (P2002) → thử lại với slug mới', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);
    const create = jest
      .fn()
      .mockRejectedValueOnce(p2002(['slug']))
      .mockImplementation(async (slug: string) => ({ id: 'new-event', slug }));

    const result = await service.createWithUniqueSlug('Hội thảo Cloud', create);

    expect(create).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ id: 'new-event', slug: create.mock.calls[1][0] });
    expect(create.mock.calls[1][0]).toMatch(/^hoi-thao-cloud-[a-z0-9]{4}$/);
  });

  it('createWithUniqueSlug: slug đã có trong DB thì không gọi create với slug đó', async () => {
    prismaMock.event.findUnique.mockResolvedValueOnce({ id: 'existing' }).mockResolvedValue(null);
    const create = jest.fn(async (slug: string) => slug);

    const slug = await service.createWithUniqueSlug('Hội thảo Cloud', create);

    const takenSlug = prismaMock.event.findUnique.mock.calls[0][0].where.slug;
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalledWith(takenSlug);
    expect(slug).not.toBe(takenSlug);
  });

  it('createWithUniqueSlug: lỗi khác (kể cả P2002 cột khác) được ném nguyên trạng, không thử lại', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);
    const otherUnique = p2002(['organizer_id']);
    const create = jest.fn().mockRejectedValue(otherUnique);

    await expect(service.createWithUniqueSlug('Hội thảo Cloud', create)).rejects.toBe(otherUnique);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('createWithUniqueSlug: trùng liên tục → InternalServerErrorException sau maxAttempts', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);
    const create = jest.fn().mockRejectedValue(p2002(['slug']));

    await expect(
      service.createWithUniqueSlug('Hội thảo Cloud', create, { maxAttempts: 3 })
    ).rejects.toThrow(InternalServerErrorException);
    expect(create).toHaveBeenCalledTimes(3);
  });
});
