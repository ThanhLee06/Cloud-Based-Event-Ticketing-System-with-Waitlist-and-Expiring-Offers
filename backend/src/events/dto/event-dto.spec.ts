import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateEventDto } from './create-event.dto';
import { UpdateEventDto } from './update-event.dto';

/** Giống ValidationPipe toàn cục trong main.ts. */
const VALIDATOR_OPTIONS = { whitelist: true, forbidNonWhitelisted: true };

const validPayload = () => ({
  title: '  Đêm nhạc Indie  ',
  description: 'Mô tả sự kiện',
  category: 'Âm nhạc',
  venue: 'Nhà Văn Hóa Sinh Viên',
  address: 'Khu đô thị ĐHQG, Dĩ An',
  city: 'TP. Hồ Chí Minh',
  poster: 'https://images.example.com/poster.jpg',
  priceVnd: 150000,
  capacity: 20,
  startsAt: '2026-12-31T19:00:00+07:00',
  salesCloseAt: '2026-12-31T12:00:00+07:00',
});

async function errorsOf<T extends object>(cls: new () => T, plain: object) {
  const instance = plainToInstance(cls, plain);
  const errors = await validate(instance, VALIDATOR_OPTIONS);
  return {
    instance,
    messages: Object.fromEntries(
      errors.map((e) => [e.property, Object.values(e.constraints ?? {})])
    ) as Record<string, string[]>,
  };
}

describe('ST-012 - CreateEventDto', () => {
  it('chấp nhận payload hợp lệ và tự cắt khoảng trắng', async () => {
    const { instance, messages } = await errorsOf(CreateEventDto, validPayload());
    expect(messages).toEqual({});
    expect(instance.title).toBe('Đêm nhạc Indie');
  });

  it('cho phép priceVnd = 0 (miễn phí)', async () => {
    const { messages } = await errorsOf(CreateEventDto, { ...validPayload(), priceVnd: 0 });
    expect(messages).toEqual({});
  });

  it('báo thiếu các trường bắt buộc', async () => {
    const { messages } = await errorsOf(CreateEventDto, {});
    expect(Object.keys(messages).sort()).toEqual(
      [
        'address',
        'capacity',
        'category',
        'city',
        'description',
        'poster',
        'priceVnd',
        'salesCloseAt',
        'startsAt',
        'title',
        'venue',
      ].sort()
    );
  });

  it('từ chối chuỗi chỉ có khoảng trắng', async () => {
    const { messages } = await errorsOf(CreateEventDto, { ...validPayload(), title: '   ' });
    expect(messages.title).toContain('Tên sự kiện không được để trống.');
  });

  it('từ chối giá vé âm', async () => {
    const { messages } = await errorsOf(CreateEventDto, { ...validPayload(), priceVnd: -1 });
    expect(messages.priceVnd).toContain('Giá vé không được âm.');
  });

  it.each([0, -5, 1.5, '20'])('từ chối capacity = %p', async (capacity) => {
    const { messages } = await errorsOf(CreateEventDto, { ...validPayload(), capacity });
    expect(messages.capacity).toContain('Sức chứa phải là số nguyên từ 1 trở lên.');
  });

  it.each(['2026-12-31', '2026-12-31T19:00:00', '2026-02-30T19:00:00Z', 'ngày mai'])(
    'từ chối startsAt không hợp lệ: %p',
    async (startsAt) => {
      const { messages } = await errorsOf(CreateEventDto, {
        ...validPayload(),
        startsAt,
        salesCloseAt: '2026-01-01T00:00:00Z',
      });
      expect(messages.startsAt?.[0]).toMatch(/Thời gian bắt đầu phải là ngày giờ ISO 8601/);
    }
  );

  it('từ chối salesCloseAt sau startsAt', async () => {
    const { messages } = await errorsOf(CreateEventDto, {
      ...validPayload(),
      salesCloseAt: '2026-12-31T20:00:00+07:00',
    });
    expect(messages.salesCloseAt).toContain(
      'Thời gian đóng bán vé phải trước hoặc bằng thời gian bắt đầu sự kiện.'
    );
  });

  it('cho phép salesCloseAt bằng startsAt (so sánh theo thời điểm, khác múi giờ)', async () => {
    const { messages } = await errorsOf(CreateEventDto, {
      ...validPayload(),
      startsAt: '2026-12-31T19:00:00+07:00',
      salesCloseAt: '2026-12-31T12:00:00Z',
    });
    expect(messages).toEqual({});
  });

  it('từ chối poster không phải URL http(s)', async () => {
    const { messages } = await errorsOf(CreateEventDto, {
      ...validPayload(),
      poster: 'javascript:alert(1)',
    });
    expect(messages.poster).toContain('Ảnh poster phải là đường dẫn http(s) hợp lệ.');
  });

  it('từ chối các trường do hệ thống quản lý', async () => {
    const { messages } = await errorsOf(CreateEventDto, {
      ...validPayload(),
      slug: 'tu-dat-slug',
      soldCount: 5,
      organizerId: 'x',
    });
    expect(Object.keys(messages).sort()).toEqual(['organizerId', 'slug', 'soldCount']);
  });
});

describe('ST-012 - UpdateEventDto', () => {
  it('chấp nhận body rỗng và cập nhật một phần', async () => {
    expect((await errorsOf(UpdateEventDto, {})).messages).toEqual({});
    expect((await errorsOf(UpdateEventDto, { priceVnd: 0 })).messages).toEqual({});
  });

  it('vẫn kiểm tra kiểu dữ liệu và ràng buộc của trường được gửi', async () => {
    const { messages } = await errorsOf(UpdateEventDto, { priceVnd: -10, capacity: 0, city: '' });
    expect(messages.priceVnd).toContain('Giá vé không được âm.');
    expect(messages.capacity).toContain('Sức chứa phải là số nguyên từ 1 trở lên.');
    expect(messages.city).toContain('Thành phố không được để trống.');
  });

  it('từ chối null cho trường NOT NULL', async () => {
    const { messages } = await errorsOf(UpdateEventDto, { title: null });
    expect(messages.title).toBeDefined();
  });

  it('kiểm tra salesCloseAt <= startsAt khi gửi cả hai', async () => {
    const { messages } = await errorsOf(UpdateEventDto, {
      startsAt: '2026-12-31T19:00:00+07:00',
      salesCloseAt: '2027-01-01T00:00:00+07:00',
    });
    expect(messages.salesCloseAt).toContain(
      'Thời gian đóng bán vé phải trước hoặc bằng thời gian bắt đầu sự kiện.'
    );
  });

  it('chỉ gửi salesCloseAt thì bỏ qua so sánh (để Service ST-013 kiểm tra)', async () => {
    const { messages } = await errorsOf(UpdateEventDto, {
      salesCloseAt: '2030-01-01T00:00:00Z',
    });
    expect(messages).toEqual({});
  });
});
