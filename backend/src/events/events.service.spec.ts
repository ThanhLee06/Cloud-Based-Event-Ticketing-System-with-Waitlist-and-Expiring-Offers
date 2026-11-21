
import { NotFoundException } from '@nestjs/common';
import {
  OfferStatus,
  Prisma,
  ReservationSource,
  ReservationStatus,
  WaitlistStatus,
} from '@prisma/client';
import { EventsService } from './events.service';
import {
  EventAvailability,
  QueryEventsDto,
} from './dto/query-events.dto';

describe('ST-009 - EventsService', () => {
  let service: EventsService;

  const prismaMock = {
    $queryRaw: jest.fn(),
    event: {
      findMany: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EventsService(prismaMock as any);
  });

  it('trả danh sách và tính số vé còn lại', async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ total: BigInt(1) }])
      .mockResolvedValueOnce([{ id: 'event-1' }]);

    prismaMock.event.findMany.mockResolvedValue([
      {
        id: 'event-1',
        title: 'Đêm nhạc',
        capacity: 20,
        soldCount: 12,
        reservedCount: 3,
      },
    ]);

    const query = new QueryEventsDto();
    const result = await service.findAll(query);

    expect(result.meta.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].availableTickets).toBe(5);
  });

  it('trả danh sách rỗng khi không có kết quả', async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ total: BigInt(0) }])
      .mockResolvedValueOnce([]);

    const result = await service.findAll(
      new QueryEventsDto(),
    );

    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(0);
  });

  it('xây dựng điều kiện lọc SOLD_OUT', async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ total: BigInt(1) }])
      .mockResolvedValueOnce([]);

    const query = new QueryEventsDto();
    query.availability = EventAvailability.SOLD_OUT;

    await service.findAll(query);

    const sql = prismaMock.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    const statement = sql.strings.join(' ');

    expect(statement).toContain('sold_count');
    expect(statement).toContain('reserved_count');
    expect(statement).toContain('= 0');
  });
});

describe('ST-010 - EventsService.findOneBySlug', () => {
  let service: EventsService;

  const prismaMock = {
    event: {
      findUnique: jest.fn(),
    },
    reservation: {
      findFirst: jest.fn(),
    },
    offer: {
      findFirst: jest.fn(),
    },
    waitlistEntry: {
      findFirst: jest.fn(),
      count: jest.fn(),
    },
  };

  const sampleEvent = {
    id: 'event-uuid-1',
    slug: 'demo-event',
    title: 'Demo Event',
    capacity: 20,
    soldCount: 15,
    reservedCount: 2,
    organizer: {
      name: 'Ban tổ chức 01',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EventsService(prismaMock as any);
  });

  it('ném NotFoundException (404) khi không tìm thấy sự kiện', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);

    await expect(service.findOneBySlug('khong-ton-tai', null)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('trả userContext = null khi chưa đăng nhập', async () => {
    prismaMock.event.findUnique.mockResolvedValue(sampleEvent);

    const result = await service.findOneBySlug('demo-event', null);

    expect(result.organizerName).toBe('Ban tổ chức 01');
    expect(result.availableTickets).toBe(3);
    expect(result.userContext).toBeNull();
    expect(prismaMock.reservation.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.offer.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.waitlistEntry.findFirst).not.toHaveBeenCalled();
  });

  it('trả userContext đầy đủ gồm activeReservation, activeOffer và activeWaitlist với currentRank FIFO', async () => {
    prismaMock.event.findUnique.mockResolvedValue(sampleEvent);

    const mockReservation = {
      id: 'res-1',
      source: ReservationSource.DIRECT,
      status: ReservationStatus.HOLD,
      priceVnd: 150000,
      expiresAt: new Date('2026-11-20T14:00:00Z'),
      ticketCode: null,
      confirmedAt: null,
      createdAt: new Date('2026-11-20T13:55:00Z'),
    };
    const mockOffer = {
      id: 'offer-1',
      reservationId: 'res-2',
      waitlistEntryId: 'wl-2',
      status: OfferStatus.PENDING,
      expiresAt: new Date('2026-11-20T14:10:00Z'),
      createdAt: new Date('2026-11-20T13:55:00Z'),
    };
    const mockWaitlistEntry = {
      id: 'wl-1',
      sequenceNo: 5,
      status: WaitlistStatus.WAITING,
      joinedAt: new Date('2026-11-20T13:50:00Z'),
    };

    prismaMock.reservation.findFirst.mockResolvedValue(mockReservation);
    prismaMock.offer.findFirst.mockResolvedValue(mockOffer);
    prismaMock.waitlistEntry.findFirst.mockResolvedValue(mockWaitlistEntry);
    prismaMock.waitlistEntry.count.mockResolvedValue(2);

    const result = await service.findOneBySlug('demo-event', 'user-uuid-1');

    expect(prismaMock.reservation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          eventId: 'event-uuid-1',
          userId: 'user-uuid-1',
          status: { in: [ReservationStatus.HOLD, ReservationStatus.CONFIRMED] },
        },
      }),
    );
    expect(prismaMock.offer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          eventId: 'event-uuid-1',
          userId: 'user-uuid-1',
          status: OfferStatus.PENDING,
        },
      }),
    );
    expect(prismaMock.waitlistEntry.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          eventId: 'event-uuid-1',
          userId: 'user-uuid-1',
          status: WaitlistStatus.WAITING,
        },
      }),
    );
    expect(prismaMock.waitlistEntry.count).toHaveBeenCalledWith({
      where: {
        eventId: 'event-uuid-1',
        status: WaitlistStatus.WAITING,
        sequenceNo: { lt: 5 },
      },
    });

    expect(result.userContext).toEqual({
      activeReservation: mockReservation,
      activeOffer: mockOffer,
      activeWaitlist: {
        ...mockWaitlistEntry,
        currentRank: 3,
      },
    });
  });

  it('trả các trường trong userContext là null khi user đã đăng nhập nhưng chưa có giao dịch nào', async () => {
    prismaMock.event.findUnique.mockResolvedValue(sampleEvent);
    prismaMock.reservation.findFirst.mockResolvedValue(null);
    prismaMock.offer.findFirst.mockResolvedValue(null);
    prismaMock.waitlistEntry.findFirst.mockResolvedValue(null);

    const result = await service.findOneBySlug('demo-event', 'user-uuid-2');

    expect(prismaMock.waitlistEntry.count).not.toHaveBeenCalled();
    expect(result.userContext).toEqual({
      activeReservation: null,
      activeOffer: null,
      activeWaitlist: null,
    });
  });
});
