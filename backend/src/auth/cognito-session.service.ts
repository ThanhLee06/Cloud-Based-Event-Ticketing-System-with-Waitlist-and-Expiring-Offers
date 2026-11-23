import {
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthTokenService } from './auth-token.service';
import { BCRYPT_SALT_ROUNDS, PublicUser, toPublicUser } from './auth.types';

/**
 * ST-036 — Liên kết người dùng Cognito với bảng users của EventFlow.
 *
 * Gọi MỘT LẦN ngay sau khi đăng nhập Cognito (Frontend gửi ID token, vì chỉ ID token có email):
 * 1. Đã có users.cognito_sub = sub → dùng luôn.
 * 2. Chưa có, nhưng email đã được Cognito xác thực và trùng một user sẵn có (vd. 103 tài khoản
 *    seed) → gắn cognito_sub vào user đó. users.id, khóa ngoại và lịch sử đặt vé giữ nguyên.
 * 3. Chưa có user nào → tạo mới với vai trò CUSTOMER (người tự đăng ký chỉ là Sinh viên).
 *
 * Từ đó mọi request chỉ cần access token: guard tra theo cognito_sub, không dò email nữa.
 */
@Injectable()
export class CognitoSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: AuthTokenService
  ) {}

  async link(idToken: string): Promise<PublicUser> {
    const claims = await this.tokens.verifyCognitoIdToken(idToken);
    const sub = claims.sub;
    const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
    const emailVerified = claims.email_verified === true || String(claims.email_verified) === 'true';

    let user = await this.prisma.user.findUnique({ where: { cognitoSub: sub } });
    if (!user) {
      if (!email || !emailVerified) {
        throw new ForbiddenException({
          statusCode: HttpStatus.FORBIDDEN,
          error: 'Forbidden',
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Email của tài khoản Cognito chưa được xác thực.',
        });
      }
      user = await this.linkByEmailOrCreate(sub, email, this.displayName(claims, email));
    }

    if (user.status === 'LOCKED') {
      throw new ForbiddenException('Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.');
    }
    return toPublicUser(user);
  }

  private async linkByEmailOrCreate(sub: string, email: string, name: string): Promise<User> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({ where: { email } });
        if (existing) {
          if (existing.cognitoSub && existing.cognitoSub !== sub) {
            throw new ConflictException({
              statusCode: HttpStatus.CONFLICT,
              error: 'Conflict',
              code: 'ACCOUNT_LINK_CONFLICT',
              message: 'Email này đã liên kết với một tài khoản Cognito khác. Vui lòng liên hệ quản trị viên.',
            });
          }
          const linked = await tx.user.update({
            where: { id: existing.id },
            data: { cognitoSub: sub, emailVerifiedAt: existing.emailVerifiedAt ?? new Date() },
          });
          await this.audit(tx, linked.id, 'USER_COGNITO_LINKED', { email, newUser: false });
          return linked;
        }

        // Mật khẩu do Cognito quản lý; password_hash ngẫu nhiên để đăng nhập local không dùng được.
        const unusableHash = await bcrypt.hash(randomBytes(32).toString('hex'), BCRYPT_SALT_ROUNDS);
        const created = await tx.user.create({
          data: {
            name,
            email,
            passwordHash: unusableHash,
            role: 'CUSTOMER',
            status: 'ACTIVE',
            emailVerifiedAt: new Date(),
            cognitoSub: sub,
          },
        });
        await this.audit(tx, created.id, 'USER_COGNITO_LINKED', { email, newUser: true });
        return created;
      });
    } catch (err) {
      // Hai tab đăng nhập cùng lúc → request thứ hai vấp unique(cognito_sub/email): đọc lại kết quả.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const again = await this.prisma.user.findUnique({ where: { cognitoSub: sub } });
        if (again) return again;
      }
      throw err;
    }
  }

  private displayName(claims: Record<string, unknown>, email: string): string {
    const raw = typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim() : email.split('@')[0];
    return raw.slice(0, 120);
  }

  private audit(
    tx: Prisma.TransactionClient,
    userId: string,
    action: string,
    details: Prisma.InputJsonValue
  ) {
    return tx.auditLog.create({
      data: { actorId: userId, action, targetType: 'USER', targetId: userId, details },
    });
  }
}
