jest.mock('@nestjs/jwt', () => ({
  JwtService: class JwtService {},
}));

import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  HttpStatus,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { GUARDS_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthTokenService } from '../auth/auth-token.service';
import { Test } from '@nestjs/testing';
import { UserRole, UserStatus } from '@prisma/client';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.types';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateEventDto } from '../events/dto/create-event.dto';
import { UpdateEventDto } from '../events/dto/update-event.dto';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizerController } from './organizer.controller';
import { OrganizerService } from './organizer.service';

describe('ST-013 (Bước 1) - OrganizerController route protection & RBAC', () => {
  let controller: OrganizerController;
  let jwtAuthGuard: JwtAuthGuard;
  let rolesGuard: RolesGuard;
  let reflector: Reflector;

  const jwtMock = {
    verifyAsync: jest.fn(),
  };

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
    },
  };

  const organizerServiceMock = {
    createEvent: jest.fn(),
    updateEvent: jest.fn(),
    getEvents: jest.fn(),
    getStats: jest.fn(),
    getEventWaitlist: jest.fn(),
    promoteNextWaitlist: jest.fn(),
    getAttendees: jest.fn(),
    exportAttendeesCsv: jest.fn(),
  };

  const createContext = (
    req: Partial<Request>,
    handler: (...args: any[]) => unknown
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => req,
      }),
      getHandler: () => handler,
      getClass: () => OrganizerController,
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [OrganizerController],
      providers: [
        Reflector,
        JwtAuthGuard,
        RolesGuard,
        // ST-036: guard xác minh token qua AuthTokenService (AUTH_MODE mặc định = local).
        AuthTokenService,
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: JwtService, useValue: jwtMock },
        { provide: PrismaService, useValue: prismaMock },
        { provide: OrganizerService, useValue: organizerServiceMock },
      ],
    }).compile();

    controller = moduleRef.get(OrganizerController);
    jwtAuthGuard = moduleRef.get(JwtAuthGuard);
    rolesGuard = moduleRef.get(RolesGuard);
    reflector = moduleRef.get(Reflector);
  });

  it('gắn đúng JwtAuthGuard, RolesGuard và @Roles(ORGANIZER, ADMIN) trên OrganizerController', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, OrganizerController);
    expect(guards).toEqual([JwtAuthGuard, RolesGuard]);

    const createRoles = reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      OrganizerController.prototype.createEvent,
      OrganizerController,
    ]);
    const updateRoles = reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      OrganizerController.prototype.updateEvent,
      OrganizerController,
    ]);

    expect(createRoles).toEqual([UserRole.ORGANIZER, UserRole.ADMIN]);
    expect(updateRoles).toEqual([UserRole.ORGANIZER, UserRole.ADMIN]);
  });

  it.each([
    ['POST /api/organizer/events', OrganizerController.prototype.createEvent],
    ['PATCH /api/organizer/events/:id', OrganizerController.prototype.updateEvent],
  ])('%s trả HTTP 401 khi không có JWT', async (_route, handler) => {
    const req: Partial<Request> = { headers: {} };
    const ctx = createContext(req, handler);

    await expect(jwtAuthGuard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it.each([
    ['POST /api/organizer/events', OrganizerController.prototype.createEvent],
    ['PATCH /api/organizer/events/:id', OrganizerController.prototype.updateEvent],
  ])('%s trả HTTP 401 khi JWT không hợp lệ hoặc hết hạn', async (_route, handler) => {
    jwtMock.verifyAsync.mockRejectedValue(new Error('invalid token'));
    const req: Partial<Request> = {
      headers: { authorization: 'Bearer invalid.jwt.token' },
    };
    const ctx = createContext(req, handler);

    await expect(jwtAuthGuard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it.each([
    ['POST /api/organizer/events', OrganizerController.prototype.createEvent],
    ['PATCH /api/organizer/events/:id', OrganizerController.prototype.updateEvent],
  ])('%s trả HTTP 403 khi vai trò là CUSTOMER', async (_route, handler) => {
    const customer: AuthUser = {
      id: 'customer-1',
      email: 'student001@eventflow.vn',
      name: 'Sinh viên 001',
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
    };
    jwtMock.verifyAsync.mockResolvedValue({
      sub: customer.id,
      email: customer.email,
      role: customer.role,
    });
    prismaMock.user.findUnique.mockResolvedValue(customer);

    const req: Partial<Request> = {
      headers: { authorization: 'Bearer customer.jwt.token' },
    };
    const ctx = createContext(req, handler);

    await expect(jwtAuthGuard.canActivate(ctx)).resolves.toBe(true);
    expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it.each([
    [UserRole.ORGANIZER, 'POST /api/organizer/events', OrganizerController.prototype.createEvent],
    [UserRole.ADMIN, 'POST /api/organizer/events', OrganizerController.prototype.createEvent],
    [UserRole.ORGANIZER, 'PATCH /api/organizer/events/:id', OrganizerController.prototype.updateEvent],
    [UserRole.ADMIN, 'PATCH /api/organizer/events/:id', OrganizerController.prototype.updateEvent],
  ])('cho phép vai trò %s truy cập %s', async (role, _route, handler) => {
    const authUser: AuthUser = {
      id: `${role.toLowerCase()}-1`,
      email: `${role.toLowerCase()}@eventflow.vn`,
      name: role,
      role,
      status: UserStatus.ACTIVE,
    };
    jwtMock.verifyAsync.mockResolvedValue({
      sub: authUser.id,
      email: authUser.email,
      role: authUser.role,
    });
    prismaMock.user.findUnique.mockResolvedValue(authUser);

    const req: Partial<Request> = {
      headers: { authorization: 'Bearer valid.jwt.token' },
    };
    const ctx = createContext(req, handler);

    await expect(jwtAuthGuard.canActivate(ctx)).resolves.toBe(true);
    expect(rolesGuard.canActivate(ctx)).toBe(true);
    expect(req.authUser).toEqual(authUser);
  });

  it('POST /api/organizer/events trả HTTP 201 và gọi organizerService.createEvent với user đã xác thực', async () => {
    const httpCode = Reflect.getMetadata(
      HTTP_CODE_METADATA,
      OrganizerController.prototype.createEvent
    );
    expect(httpCode).toBe(HttpStatus.CREATED);

    const organizer: AuthUser = {
      id: 'organizer-1',
      email: 'organizer01@eventflow.vn',
      name: 'Ban tổ chức 01',
      role: UserRole.ORGANIZER,
      status: UserStatus.ACTIVE,
    };
    const dto = new CreateEventDto();
    const createdEvent = { id: 'event-1', slug: 'hoi-thao-cloud-7x9k', organizerId: organizer.id };
    organizerServiceMock.createEvent.mockResolvedValue(createdEvent);

    const result = await controller.createEvent(organizer, dto);

    expect(organizerServiceMock.createEvent).toHaveBeenCalledWith(organizer, dto);
    expect(result).toEqual(createdEvent);
  });

  it('từ chối dữ liệu sai bằng HTTP 400 (ValidationPipe), kể cả khi client tự gửi organizerId', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    await expect(
      pipe.transform(
        {
          title: 'Hội thảo Cloud',
          description: 'Mô tả',
          category: 'Công nghệ',
          venue: 'Hội trường A',
          address: '123 Đường ABC',
          city: 'TP. Hồ Chí Minh',
          poster: 'https://example.com/poster.jpg',
          priceVnd: -100,
          capacity: 0,
          startsAt: '2026-12-31T19:00:00+07:00',
          salesCloseAt: '2026-12-31T12:00:00+07:00',
          organizerId: 'spoofed-organizer-id',
        },
        { type: 'body', metatype: CreateEventDto }
      )
    ).rejects.toThrow(BadRequestException);
  });

  it('PATCH /api/organizer/events/:id trả HTTP 200 và gọi organizerService.updateEvent', async () => {
    const httpCode = Reflect.getMetadata(
      HTTP_CODE_METADATA,
      OrganizerController.prototype.updateEvent
    );
    expect(httpCode).toBe(HttpStatus.OK);

    const organizer: AuthUser = {
      id: 'organizer-1',
      email: 'organizer01@eventflow.vn',
      name: 'Ban tổ chức 01',
      role: UserRole.ORGANIZER,
      status: UserStatus.ACTIVE,
    };
    const eventId = '11111111-1111-4111-8111-111111111111';
    const dto: UpdateEventDto = { title: 'Tên mới' };
    const updatedEvent = { id: eventId, title: 'Tên mới', slug: 'slug-cu-7x9k' };
    organizerServiceMock.updateEvent.mockResolvedValue(updatedEvent);

    const result = await controller.updateEvent(organizer, eventId, dto);

    expect(organizerServiceMock.updateEvent).toHaveBeenCalledWith(organizer, eventId, dto);
    expect(result).toEqual(updatedEvent);
  });

  it('PATCH từ chối các trường hệ thống (organizerId, soldCount, reservedCount, nextWaitlistSeq, slug) bằng HTTP 400', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    await expect(
      pipe.transform(
        {
          title: 'Tên mới',
          organizerId: 'spoofed-id',
          soldCount: 0,
          reservedCount: 0,
          nextWaitlistSeq: 99,
          slug: 'hacked-slug',
        },
        { type: 'body', metatype: UpdateEventDto }
      )
    ).rejects.toThrow(BadRequestException);
  });
});

