export interface ValidatedEnv {
  PORT: number;
  DATABASE_URL: string;
  JWT_SECRET: string;
  CORS_ORIGIN: string;
  /** ST-002: số lần gọi /auth/login tối đa mỗi phút trên một IP (mặc định 10). */
  AUTH_LOGIN_RATE_LIMIT: number;
  /** Bật khi chạy sau load balancer/proxy (AWS) để lấy đúng IP client từ X-Forwarded-For. */
  TRUST_PROXY: boolean;
}

export function validateEnv(config: Record<string, unknown>): ValidatedEnv {
  const missing: string[] = [];

  const databaseUrl = typeof config.DATABASE_URL === 'string' ? config.DATABASE_URL.trim() : '';
  if (!databaseUrl) {
    missing.push('DATABASE_URL');
  }

  const jwtSecret = typeof config.JWT_SECRET === 'string' ? config.JWT_SECRET.trim() : '';
  if (!jwtSecret) {
    missing.push('JWT_SECRET');
  }

  if (missing.length > 0) {
    throw new Error(
      `[Startup Error] Thiếu biến môi trường bắt buộc: ${missing.join(', ')}. Vui lòng tạo file backend/.env từ backend/.env.example.`
    );
  }

  if (jwtSecret.length < 16) {
    throw new Error('[Startup Error] JWT_SECRET phải dài tối thiểu 16 ký tự.');
  }

  const rawPort = config.PORT ? Number(config.PORT) : 4000;
  const port = Number.isInteger(rawPort) && rawPort > 0 ? rawPort : 4000;
  const corsOrigin =
    typeof config.CORS_ORIGIN === 'string' && config.CORS_ORIGIN.trim()
      ? config.CORS_ORIGIN.trim()
      : 'http://localhost:3000';

  const rawLimit = config.AUTH_LOGIN_RATE_LIMIT ? Number(config.AUTH_LOGIN_RATE_LIMIT) : 10;
  const loginRateLimit = Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : 10;

  const trustProxy = String(config.TRUST_PROXY ?? '').toLowerCase() === 'true';

  return {
    PORT: port,
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    CORS_ORIGIN: corsOrigin,
    AUTH_LOGIN_RATE_LIMIT: loginRateLimit,
    TRUST_PROXY: trustProxy,
  };
}
