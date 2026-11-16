export interface ValidatedEnv {
  PORT: number;
  DATABASE_URL: string;
  JWT_SECRET: string;
  CORS_ORIGIN: string;
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

  const rawPort = config.PORT ? Number(config.PORT) : 4000;
  const port = Number.isInteger(rawPort) && rawPort > 0 ? rawPort : 4000;
  const corsOrigin =
    typeof config.CORS_ORIGIN === 'string' && config.CORS_ORIGIN.trim()
      ? config.CORS_ORIGIN.trim()
      : 'http://localhost:3000';

  return {
    PORT: port,
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    CORS_ORIGIN: corsOrigin,
  };
}
