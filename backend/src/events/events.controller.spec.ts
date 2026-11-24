jest.mock('@nestjs/jwt', () => ({
  JwtService: class JwtService {},
}));

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole, UserStatus } from '@prisma/client';
import type { Request } from 'express';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthTokenService } from '../auth/auth-token.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

describe('ST-010 (Bước 2) - Optional JWT Authentication cho GET /api/events/:slug', () => {
  let controller: EventsController;
  let guard: OptionalJwtAuthGuard;

  const jwtMock = {
    verifyAsync: jest.fn(),
  };

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
    },
  };

  const eventsServiceMock = {
    findAll: jest.fn(),
    findOneBySlug: jest.fn(),
  };

  const createExecutionContext = (req: Partial<Request>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        OptionalJwtAuthGuard,
        // ST-036: guard xác minh token qua AuthTokenService (AUTH_MODE mặc định = local).
        AuthTokenService,
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: JwtService, useValue: jwtMock },
        { provide: PrismaService, useValue: prismaMock },
        { provide: EventsService, useValue: eventsServiceMock },
      ],
    }).compile();

    controller = moduleRef.get(EventsController);
    guard = moduleRef.get(OptionalJwtAuthGuard);
  });

  it('cho phép truy cập khi không có token và truyền userId = null', async () => {
    const req: Partial<Request> = { headers: {} };
    const canActivate = await guard.canActivate(createExecutionContext(req));

    expect(canActivate).toBe(true);
    expect(req.authUser).toBeUndefined();
    expect(jwtMock.verifyAsync).not.toHaveBeenCalled();

    eventsServiceMock.findOneBySlug.mockResolvedValue({
      slug: 'demo-event',
      userContext: null,
    });

    const result = await controller.findOne('demo-event', req.authUser ?? null);
    expect(eventsServiceMock.findOneBySlug).toHaveBeenCalledWith('demo-event', null);
    expect(result.userContext).toBeNull();
  });

  it('xác thực JWT hợp lệ, lấy userId từ token và truyền vào EventsService', async () => {
    const authUser = {
      id: 'user-uuid-123',
      email: 'student001@eventflow.vn',
      name: 'Sinh viên 001',
      role: UserRole.CUSTOMER,
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
    const canActivate = await guard.canActivate(createExecutionContext(req));

    expect(canActivate).toBe(true);
    expect(jwtMock.verifyAsync).toHaveBeenCalledWith('valid.jwt.token');
    expect(req.authUser).toEqual(authUser);

    eventsServiceMock.findOneBySlug.mockResolvedValue({
      slug: 'demo-event',
      userContext: null,
    });

    await controller.findOne('demo-event', req.authUser ?? null);
    expect(eventsServiceMock.findOneBySlug).toHaveBeenCalledWith('demo-event', 'user-uuid-123');
  });

  it('trả HTTP 401 khi JWT không hợp lệ hoặc hết hạn', async () => {
    jwtMock.verifyAsync.mockRejectedValue(new Error('jwt expired'));

    const req: Partial<Request> = {
      headers: { authorization: 'Bearer invalid.or.expired.token' },
    };

    await expect(guard.canActivate(createExecutionContext(req))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(req.authUser).toBeUndefined();
  });
});
