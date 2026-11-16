import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth.types';

/** Lấy user hiện tại (đã được JwtAuthGuard nạp) trong controller: `@CurrentUser() user: AuthUser`. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.authUser) {
    throw new UnauthorizedException('Bạn cần đăng nhập để thực hiện thao tác này.');
  }
  return req.authUser satisfies AuthUser;
});

/** Lấy requestId (do RequestIdMiddleware gắn) để ghi audit log. */
export const RequestId = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return req.requestId ?? null;
});
