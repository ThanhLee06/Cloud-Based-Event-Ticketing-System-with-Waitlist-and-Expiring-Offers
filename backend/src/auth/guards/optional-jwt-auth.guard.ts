import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthTokenService } from '../auth-token.service';
import { extractBearerToken } from './bearer-token';

/**
 * ST-010 — Optional JWT Authentication (ST-036: hỗ trợ cả token Cognito).
 * - Không có Authorization header → cho phép truy cập (req.authUser = undefined).
 * - Có Authorization header nhưng sai định dạng / token không hợp lệ / hết hạn → 401.
 * - Token hợp lệ → nạp user từ DB vào req.authUser (tài khoản bị LOCKED → 403).
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly tokens: AuthTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return true;
    }
    const token = extractBearerToken(authHeader);
    if (!token) {
      throw new UnauthorizedException('Access token không đúng định dạng.');
    }
    req.authUser = await this.tokens.authenticate(token);
    return true;
  }
}
