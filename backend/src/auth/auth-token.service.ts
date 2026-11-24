import {
  ForbiddenException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { CognitoIdTokenPayload } from 'aws-jwt-verify/jwt-model';
import type { Jwks } from 'aws-jwt-verify/jwk';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser, JwtPayload } from './auth.types';

export type AuthMode = 'local' | 'cognito';

const AUTH_USER_SELECT = { id: true, email: true, name: true, role: true, status: true } as const;

type CognitoVerifier = ReturnType<typeof createCognitoVerifier>;

function createCognitoVerifier(userPoolId: string, clientId: string) {
  // tokenUse để null ở đây rồi chỉ định khi gọi verify(): 1 verifier dùng chung bộ nhớ đệm JWKS
  // cho cả access token (mọi request) và ID token (lúc liên kết tài khoản).
  return CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: null });
}

/**
 * ST-036 — Xác minh token và nạp người dùng hiện tại, dùng chung cho JwtAuthGuard và
 * OptionalJwtAuthGuard.
 *
 * - AUTH_MODE=local (dev): JWT do chính backend ký bằng JWT_SECRET, `sub` = users.id.
 * - AUTH_MODE=cognito (AWS): access token của Amazon Cognito. aws-jwt-verify kiểm tra
 *   chữ ký qua JWKS (tự tải và lưu đệm), hạn dùng (exp), nơi cấp (iss = User Pool),
 *   token_use = "access" và client_id = App Client của EventFlow.
 *   Người dùng được tra theo users.cognito_sub (access token không chứa email).
 *
 * Vai trò và trạng thái khóa luôn đọc lại từ PostgreSQL ở mỗi request, nên Admin nâng quyền
 * hoặc khóa tài khoản có hiệu lực ngay, không phụ thuộc token cũ.
 */
@Injectable()
export class AuthTokenService {
  private readonly logger = new Logger(AuthTokenService.name);
  readonly mode: AuthMode;
  private readonly cognito: CognitoVerifier | null = null;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    config: ConfigService
  ) {
    this.mode = config.get<AuthMode>('AUTH_MODE') ?? 'local';
    if (this.mode === 'cognito') {
      this.cognito = createCognitoVerifier(
        config.getOrThrow<string>('COGNITO_USER_POOL_ID'),
        config.getOrThrow<string>('COGNITO_CLIENT_ID')
      );
    }
  }

  /** Xác minh access token và trả về người dùng hiện tại. 401 nếu token sai/hết hạn, 403 nếu bị khóa. */
  async authenticate(token: string): Promise<AuthUser> {
    const user = this.mode === 'cognito' ? await this.findCognitoUser(token) : await this.findLocalUser(token);
    if (user.status === 'LOCKED') {
      throw new ForbiddenException('Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.');
    }
    return user;
  }

  /** Xác minh ID token Cognito (chỉ dùng khi liên kết tài khoản, vì chỉ ID token mới có email). */
  async verifyCognitoIdToken(idToken: string): Promise<CognitoIdTokenPayload> {
    const verifier = this.requireCognito();
    try {
      // tokenUse: 'id' đã được thư viện kiểm tra nên payload chắc chắn là ID token.
      return (await verifier.verify(idToken, { tokenUse: 'id' })) as CognitoIdTokenPayload;
    } catch (err) {
      this.logger.warn(`ID token Cognito không hợp lệ: ${err instanceof Error ? err.constructor.name : 'UnknownError'}`);
      throw new UnauthorizedException('Phiên đăng nhập Cognito không hợp lệ hoặc đã hết hạn.');
    }
  }

  /**
   * Nạp sẵn JWKS (khóa công khai) thay vì tải từ Cognito. Chỉ dùng cho kiểm thử tự động
   * với khóa giả lập; khi chạy thật thư viện tự tải JWKS từ User Pool.
   */
  cacheJwks(jwks: Jwks): void {
    this.requireCognito().cacheJwks(jwks);
  }

  private async findLocalUser(token: string): Promise<AuthUser> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: AUTH_USER_SELECT });
    if (!user) {
      throw new UnauthorizedException('Tài khoản không còn tồn tại.');
    }
    return user;
  }

  private async findCognitoUser(token: string): Promise<AuthUser> {
    let sub: string;
    try {
      const payload = await this.requireCognito().verify(token, { tokenUse: 'access' });
      sub = payload.sub;
    } catch (err) {
      this.logger.warn(`Access token Cognito không hợp lệ: ${err instanceof Error ? err.constructor.name : 'UnknownError'}`);
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    }
    const user = await this.prisma.user.findUnique({ where: { cognitoSub: sub }, select: AUTH_USER_SELECT });
    if (!user) {
      // Đăng nhập Cognito thành công nhưng chưa gọi POST /auth/cognito/session để liên kết.
      throw new UnauthorizedException({
        statusCode: HttpStatus.UNAUTHORIZED,
        error: 'Unauthorized',
        code: 'ACCOUNT_NOT_LINKED',
        message: 'Tài khoản Cognito chưa được liên kết với EventFlow. Vui lòng đăng nhập lại.',
      });
    }
    return user;
  }

  private requireCognito(): CognitoVerifier {
    if (!this.cognito) {
      throw new Error('AUTH_MODE không phải cognito.');
    }
    return this.cognito;
  }
}
