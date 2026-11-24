export interface ValidatedEnv {
  PORT: number;
  DATABASE_URL: string;
  JWT_SECRET: string;
  CORS_ORIGIN: string;
  /** ST-002: số lần gọi /auth/login tối đa mỗi phút trên một IP (mặc định 10). */
  AUTH_LOGIN_RATE_LIMIT: number;
  /**
   * ST-036: Số lớp proxy đứng trước NestJS (để lấy đúng IP khách từ X-Forwarded-For).
   * 0 = chạy trực tiếp (local). "true" = 1 lớp (Load Balancer). 2 = CloudFront + Load Balancer.
   */
  TRUST_PROXY: number;
  /** ST-036: local = JWT tự ký (dev, mặc định); cognito = xác minh access token của Amazon Cognito. */
  AUTH_MODE: 'local' | 'cognito';
  COGNITO_REGION?: string;
  COGNITO_USER_POOL_ID?: string;
  COGNITO_CLIENT_ID?: string;
  /** Địa chỉ trang đăng nhập của Cognito, vd. https://<prefix>.auth.ap-southeast-2.amazoncognito.com */
  COGNITO_DOMAIN?: string;
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

  // TRUST_PROXY: "true" (giữ tương thích cấu hình cũ) = 1 lớp, hoặc số lớp 0..5.
  const rawTrustProxy = str(config.TRUST_PROXY).toLowerCase();
  let trustProxy = 0;
  if (rawTrustProxy === 'true') {
    trustProxy = 1;
  } else if (rawTrustProxy && rawTrustProxy !== 'false') {
    const hops = Number(rawTrustProxy);
    if (!Number.isInteger(hops) || hops < 0 || hops > 5) {
      throw new Error('[Startup Error] TRUST_PROXY phải là true/false hoặc số lớp proxy từ 0 đến 5.');
    }
    trustProxy = hops;
  }

  const authMode = str(config.AUTH_MODE).toLowerCase() === 'cognito' ? 'cognito' : 'local';
  const cognitoUserPoolId = str(config.COGNITO_USER_POOL_ID);
  const cognitoClientId = str(config.COGNITO_CLIENT_ID);
  const cognitoDomain = str(config.COGNITO_DOMAIN).replace(/\/+$/, '');
  // Region nằm sẵn trong User Pool ID (vd. ap-southeast-2_AbCdEf123) nếu không khai báo riêng.
  const cognitoRegion = str(config.COGNITO_REGION) || cognitoUserPoolId.split('_')[0] || '';
  if (authMode === 'cognito') {
    const missingCognito = [
      !cognitoUserPoolId && 'COGNITO_USER_POOL_ID',
      !cognitoClientId && 'COGNITO_CLIENT_ID',
      !cognitoDomain && 'COGNITO_DOMAIN',
    ].filter(Boolean);
    if (missingCognito.length > 0) {
      throw new Error(
        `[Startup Error] AUTH_MODE=cognito nhưng thiếu: ${missingCognito.join(', ')}.`
      );
    }
    if (!/^[a-z]{2}-[a-z]+-\d_[A-Za-z0-9]+$/.test(cognitoUserPoolId)) {
      throw new Error('[Startup Error] COGNITO_USER_POOL_ID không đúng định dạng <region>_<id>.');
    }
    if (!/^https:\/\//.test(cognitoDomain)) {
      throw new Error('[Startup Error] COGNITO_DOMAIN phải bắt đầu bằng https://');
    }
  }

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
    AUTH_MODE: authMode,
    COGNITO_REGION: cognitoRegion || undefined,
    COGNITO_USER_POOL_ID: cognitoUserPoolId || undefined,
    COGNITO_CLIENT_ID: cognitoClientId || undefined,
    COGNITO_DOMAIN: cognitoDomain || undefined,
    MAIL_DRIVER: mailDriver,
    SMTP_HOST: smtpHost || undefined,
    SMTP_PORT: smtpPort,
    SMTP_USER: smtpUser || undefined,
    SMTP_PASS: smtpPass || undefined,
    MAIL_FROM: mailFrom,
  };
}
