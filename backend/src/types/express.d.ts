import type { AuthUser } from '../auth/auth.types';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Gắn bởi RequestIdMiddleware. */
      requestId?: string;
      /** Gắn bởi JwtAuthGuard sau khi xác thực token thành công. */
      authUser?: AuthUser;
    }
  }
}

export {};
