import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthTokenService } from '../auth-token.service';
import { extractBearerToken } from './bearer-token';

/**
 * ST-004 / ST-036 — Bảo vệ API bằng access token.
 * - Thiếu / sai / hết hạn token → 401.
 * - User không còn tồn tại hoặc (Cognito) chưa liên kết → 401; user đang bị LOCKED → 403.
 * - Role được đọc lại từ DB nên Admin nâng/hạ quyền có hiệu lực ngay ở request kế tiếp.
 * Kiểu token (JWT tự ký hay Cognito) do AUTH_MODE quyết định, xem AuthTokenService.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokens: AuthTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Thiếu access token. Vui lòng đăng nhập.');
    }
    req.authUser = await this.tokens.authenticate(token);
    return true;
  }
}
