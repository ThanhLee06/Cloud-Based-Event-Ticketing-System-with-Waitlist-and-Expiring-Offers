export interface ValidatedEnv {
  PORT: number;
  DATABASE_URL: string;
  JWT_SECRET: string;
  CORS_ORIGIN: string;
  /** ST-002: số lần gọi /auth/login tối đa mỗi phút trên một IP (mặc định 10). */
  AUTH_LOGIN_RATE_LIMIT: number;
  /** Bật khi chạy sau load balancer/proxy (AWS) để lấy đúng IP client từ X-Forwarded-For. */
  TRUST_PROXY: boolean;
  /** console = in email ra terminal (dev); smtp = gửi thật qua SMTP. */
  MAIL_DRIVER: 'console' | 'smtp';
  SMTP_HOST?: string;
  SMTP_PORT: number;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  MAIL_FROM: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

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

  const mailDriver = str(config.MAIL_DRIVER).toLowerCase() === 'smtp' ? 'smtp' : 'console';
  const smtpHost = str(config.SMTP_HOST);
  const smtpUser = str(config.SMTP_USER);
  const smtpPass = str(config.SMTP_PASS);
  const rawSmtpPort = config.SMTP_PORT ? Number(config.SMTP_PORT) : 587;
  const smtpPort = Number.isInteger(rawSmtpPort) && rawSmtpPort > 0 ? rawSmtpPort : 587;
  if (mailDriver === 'smtp') {
    const missingSmtp = [
      !smtpHost && 'SMTP_HOST',
      !smtpUser && 'SMTP_USER',
      !smtpPass && 'SMTP_PASS',
    ].filter(Boolean);
    if (missingSmtp.length > 0) {
      throw new Error(
        `[Startup Error] MAIL_DRIVER=smtp nhưng thiếu: ${missingSmtp.join(', ')}. Đặt MAIL_DRIVER=console nếu chưa cấu hình email.`
      );
    }
  }
  const mailFrom = str(config.MAIL_FROM) || `EventFlow <${smtpUser || 'no-reply@eventflow.local'}>`;

  return {
    PORT: port,
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    CORS_ORIGIN: corsOrigin,
    AUTH_LOGIN_RATE_LIMIT: loginRateLimit,
    TRUST_PROXY: trustProxy,
    MAIL_DRIVER: mailDriver,
    SMTP_HOST: smtpHost || undefined,
    SMTP_PORT: smtpPort,
    SMTP_USER: smtpUser || undefined,
    SMTP_PASS: smtpPass || undefined,
    MAIL_FROM: mailFrom,
  };
}
