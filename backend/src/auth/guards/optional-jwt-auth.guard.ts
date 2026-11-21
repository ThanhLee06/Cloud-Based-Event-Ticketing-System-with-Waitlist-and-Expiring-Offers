import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../auth.types';

/**
 * ST-010 — Optional JWT Authentication.
 * - Không có Authorization header → cho phép truy cập (req.authUser = undefined).
 * - Có Authorization header nhưng sai định dạng / token không hợp lệ / hết hạn → 401.
 * - Token hợp lệ → nạp user từ DB vào req.authUser (tài khoản bị LOCKED → 403).
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return true;
    }

    const token = this.extractBearerToken(authHeader);
    if (!token) {
      throw new UnauthorizedException('Access token không đúng định dạng.');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true, status: true },
    });
    if (!user) {
      throw new UnauthorizedException('Tài khoản không còn tồn tại.');
    }
    if (user.status === 'LOCKED') {
      throw new ForbiddenException('Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.');
    }

    req.authUser = user;
    return true;
  }

  private extractBearerToken(header: string): string | null {
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value.trim() : null;
  }
}

