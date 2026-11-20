
import { Prisma } from '@prisma/client';
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
