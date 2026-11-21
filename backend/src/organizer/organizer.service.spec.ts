import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { CreateEventDto } from '../events/dto/create-event.dto';
import { UpdateEventDto } from '../events/dto/update-event.dto';
import { EventSlugService } from '../events/event-slug.service';
import { OrganizerService } from './organizer.service';

const p2002Slug = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['slug'] },
  });

describe('ST-013 (Bước 2) - OrganizerService.createEvent', () => {
  const prismaMock = {
    event: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  const waitlistServiceMock = {
    promoteNextWaitlist: jest.fn(),
  };

  let slugService: EventSlugService;
  let service: OrganizerService;

  const organizerUser: AuthUser = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'organizer01@eventflow.vn',
    name: 'Ban tổ chức 01',
    role: UserRole.ORGANIZER,
    status: UserStatus.ACTIVE,
  };

  const validDto = (overrides: Partial<CreateEventDto> = {}): CreateEventDto => ({
    title: 'Hội thảo Cloud',
    description: 'Sự kiện chuyên sâu về điện toán đám mây.',
    category: 'Công nghệ',
    venue: 'Saigon Innovation Hub',
    address: '273 Điện Biên Phủ, Quận 3',
    city: 'TP. Hồ Chí Minh',
    poster: 'https://images.example.com/cloud.jpg',
    priceVnd: 250000,
    capacity: 50,
    startsAt: '2026-12-31T19:00:00+07:00',
    salesCloseAt: '2026-12-31T12:00:00+07:00',
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    slugService = new EventSlugService(prismaMock as never);
    jest
      .spyOn((slugService as unknown as { logger: { warn: () => void } }).logger, 'warn')
      .mockImplementation(() => undefined);
    service = new OrganizerService(
      prismaMock as never,
      waitlistServiceMock as never,
      slugService
    );
  });

  it('tạo sự kiện thành công, lấy organizerId từ JWT và khởi tạo soldCount=0, reservedCount=0, nextWaitlistSeq=1', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);
    prismaMock.event.create.mockImplementation(async ({ data }) => ({
      id: 'event-uuid-new',
      featured: false,
      createdAt: new Date('2026-11-21T06:00:00Z'),
      ...data,
    }));

    const dto = validDto();
    const created = await service.createEvent(organizerUser, dto);

    expect(prismaMock.event.create).toHaveBeenCalledTimes(1);
    const createArg = prismaMock.event.create.mock.calls[0][0].data;
    expect(createArg.slug).toMatch(/^hoi-thao-cloud-[a-z0-9]{4}$/);
    expect(createArg.organizerId).toBe(organizerUser.id);
    expect(createArg.soldCount).toBe(0);
    expect(createArg.reservedCount).toBe(0);
    expect(createArg.nextWaitlistSeq).toBe(1);
    expect(createArg.startsAt).toEqual(new Date(dto.startsAt));
    expect(createArg.salesCloseAt).toEqual(new Date(dto.salesCloseAt));

    expect(created.id).toBe('event-uuid-new');
    expect(created.organizerId).toBe(organizerUser.id);
    expect(created.soldCount).toBe(0);
    expect(created.reservedCount).toBe(0);
    expect(created.nextWaitlistSeq).toBe(1);
  });

  it('cho phép tạo sự kiện miễn phí với priceVnd = 0', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);
    prismaMock.event.create.mockImplementation(async ({ data }) => ({
      id: 'event-free',
      ...data,
    }));

    const created = await service.createEvent(organizerUser, validDto({ priceVnd: 0 }));

    expect(prismaMock.event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        priceVnd: 0,
        soldCount: 0,
        reservedCount: 0,
        nextWaitlistSeq: 1,
        organizerId: organizerUser.id,
      }),
    });
    expect(created.priceVnd).toBe(0);
  });

  it('tự động thử lại với slug mới khi gặp trùng slug (Prisma P2002)', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);
    prismaMock.event.create
      .mockRejectedValueOnce(p2002Slug())
      .mockImplementationOnce(async ({ data }) => ({
        id: 'event-after-retry',
        ...data,
      }));

    const created = await service.createEvent(organizerUser, validDto());

    expect(prismaMock.event.create).toHaveBeenCalledTimes(2);
    const firstSlug = prismaMock.event.create.mock.calls[0][0].data.slug;
    const secondSlug = prismaMock.event.create.mock.calls[1][0].data.slug;
    expect(secondSlug).toMatch(/^hoi-thao-cloud-[a-z0-9]{4}$/);
    expect(created.id).toBe('event-after-retry');
    expect(created.slug).toBe(secondSlug);
    expect(firstSlug).toBeDefined();
  });

  it('trả HTTP 400 (BadRequestException) khi salesCloseAt sau startsAt', async () => {
    await expect(
      service.createEvent(
        organizerUser,
        validDto({
          startsAt: '2026-12-31T12:00:00+07:00',
          salesCloseAt: '2026-12-31T19:00:00+07:00',
        })
      )
    ).rejects.toThrow(BadRequestException);

    expect(prismaMock.event.create).not.toHaveBeenCalled();
  });

  it('trả HTTP 400 (BadRequestException) khi thời gian không hợp lệ', async () => {
    await expect(
      service.createEvent(organizerUser, validDto({ startsAt: 'invalid-date' }))
    ).rejects.toThrow(BadRequestException);

    expect(prismaMock.event.create).not.toHaveBeenCalled();
  });
});

describe('ST-013 (Bước 3) - OrganizerService.updateEvent', () => {
  const txMock = {
    $queryRaw: jest.fn(),
    event: {
      update: jest.fn(),
    },
  };

  const prismaMock = {
    $transaction: jest.fn(async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
    event: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  const waitlistServiceMock = {
    promoteNextWaitlist: jest.fn(),
  };

  let service: OrganizerService;

  const organizerOwner: AuthUser = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'organizer01@eventflow.vn',
    name: 'Ban tổ chức 01',
    role: UserRole.ORGANIZER,
    status: UserStatus.ACTIVE,
  };

  const otherOrganizer: AuthUser = {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'organizer02@eventflow.vn',
    name: 'Ban tổ chức 02',
    role: UserRole.ORGANIZER,
    status: UserStatus.ACTIVE,
  };

  const adminUser: AuthUser = {
    id: '33333333-3333-4333-8333-333333333333',
    email: 'admin@eventflow.vn',
    name: 'Quản trị viên',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
  };

  const eventId = 'c787840c-6011-4c0e-aacb-e940891aa3bf';

  const lockedEventRow = (overrides: Record<string, unknown> = {}) => ({
    id: eventId,
    organizerId: organizerOwner.id,
    capacity: 50,
    soldCount: 15,
    reservedCount: 5,
    startsAt: new Date('2026-12-31T12:00:00Z'),
    salesCloseAt: new Date('2026-12-31T05:00:00Z'),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    const slugService = new EventSlugService(prismaMock as never);
    service = new OrganizerService(
      prismaMock as never,
      waitlistServiceMock as never,
      slugService
    );
  });

  it('Organizer sửa sự kiện của mình thành công, giữ nguyên slug và không ghi trường hệ thống', async () => {
    txMock.$queryRaw.mockResolvedValue([lockedEventRow()]);
    txMock.event.update.mockImplementation(async ({ data }) => ({
      id: eventId,
      slug: 'su-kien-goc-7x9k',
      organizerId: organizerOwner.id,
      soldCount: 15,
      reservedCount: 5,
      nextWaitlistSeq: 1,
      ...data,
    }));

    const dto: UpdateEventDto = {
      title: 'Tiêu đề đã chỉnh sửa',
      priceVnd: 200000,
      capacity: 20, // đúng bằng soldCount (15) + reservedCount (5) -> hợp lệ
    };

    const updated = await service.updateEvent(organizerOwner, eventId, dto);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.$queryRaw).toHaveBeenCalledTimes(1);
    const updateData = txMock.event.update.mock.calls[0][0].data;
    expect(updateData).toEqual({
      title: 'Tiêu đề đã chỉnh sửa',
      priceVnd: 200000,
      capacity: 20,
    });
    expect(updateData).not.toHaveProperty('slug');
    expect(updateData).not.toHaveProperty('organizerId');
    expect(updateData).not.toHaveProperty('soldCount');
    expect(updateData).not.toHaveProperty('reservedCount');
    expect(updateData).not.toHaveProperty('nextWaitlistSeq');
    expect(updated.slug).toBe('su-kien-goc-7x9k');
    expect(updated.title).toBe('Tiêu đề đã chỉnh sửa');
  });

  it('Organizer sửa sự kiện của người khác → HTTP 403 (ForbiddenException)', async () => {
    txMock.$queryRaw.mockResolvedValue([lockedEventRow()]);

    await expect(
      service.updateEvent(otherOrganizer, eventId, { title: 'Sửa trái phép' })
    ).rejects.toThrow(ForbiddenException);

    expect(txMock.event.update).not.toHaveBeenCalled();
  });

  it('Admin được phép sửa sự kiện của Organizer khác', async () => {
    txMock.$queryRaw.mockResolvedValue([lockedEventRow()]);
    txMock.event.update.mockResolvedValue({
      id: eventId,
      slug: 'su-kien-goc-7x9k',
      title: 'Admin cập nhật',
      organizerId: organizerOwner.id,
    });

    const updated = await service.updateEvent(adminUser, eventId, { title: 'Admin cập nhật' });

    expect(txMock.event.update).toHaveBeenCalledWith({
      where: { id: eventId },
      data: { title: 'Admin cập nhật' },
    });
    expect(updated.title).toBe('Admin cập nhật');
  });

  it('ID sự kiện không tồn tại → HTTP 404 (NotFoundException)', async () => {
    txMock.$queryRaw.mockResolvedValue([]);

    await expect(
      service.updateEvent(organizerOwner, eventId, { title: 'Không tồn tại' })
    ).rejects.toThrow(NotFoundException);

    expect(txMock.event.update).not.toHaveBeenCalled();
  });

  it('capacity nhỏ hơn soldCount + reservedCount → HTTP 400 (BadRequestException)', async () => {
    txMock.$queryRaw.mockResolvedValue([lockedEventRow({ soldCount: 15, reservedCount: 5 })]);

    await expect(
      service.updateEvent(organizerOwner, eventId, { capacity: 19 })
    ).rejects.toThrow(BadRequestException);

    expect(txMock.event.update).not.toHaveBeenCalled();
  });

  it('chỉ sửa salesCloseAt sau startsAt cũ → HTTP 400 (BadRequestException)', async () => {
    txMock.$queryRaw.mockResolvedValue([
      lockedEventRow({
        startsAt: new Date('2026-12-31T12:00:00Z'),
        salesCloseAt: new Date('2026-12-31T05:00:00Z'),
      }),
    ]);

    await expect(
      service.updateEvent(organizerOwner, eventId, {
        salesCloseAt: '2026-12-31T13:00:00Z',
      })
    ).rejects.toThrow(BadRequestException);

    expect(txMock.event.update).not.toHaveBeenCalled();
  });

  it('chỉ sửa startsAt trước salesCloseAt cũ → HTTP 400 (BadRequestException)', async () => {
    txMock.$queryRaw.mockResolvedValue([
      lockedEventRow({
        startsAt: new Date('2026-12-31T12:00:00Z'),
        salesCloseAt: new Date('2026-12-31T05:00:00Z'),
      }),
    ]);

    await expect(
      service.updateEvent(organizerOwner, eventId, {
        startsAt: '2026-12-31T04:00:00Z',
      })
    ).rejects.toThrow(BadRequestException);

    expect(txMock.event.update).not.toHaveBeenCalled();
  });
});

