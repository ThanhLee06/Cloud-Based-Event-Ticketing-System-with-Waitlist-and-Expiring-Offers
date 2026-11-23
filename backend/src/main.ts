import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { SafeLogger } from './common/safe-logger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: new SafeLogger() });
  const configService = app.get(ConfigService);

  const port = configService.get<number>('PORT') || 4000;
  const corsOrigin = configService.get<string>('CORS_ORIGIN') || 'http://localhost:3000';

  // ST-036: tin đúng số lớp proxy đứng trước (Load Balancer = 1, CloudFront + Load Balancer = 2)
  // để req.ip là IP thật của khách → rate-limit đăng nhập tính đúng người.
  const trustProxyHops = configService.get<number>('TRUST_PROXY') ?? 0;
  if (trustProxyHops > 0) {
    app.set('trust proxy', trustProxyHops);
  }

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: corsOrigin.split(',').map((item) => item.trim()),
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'x-request-id'],
    // Date: Frontend dùng giờ server để đồng bộ đồng hồ đếm ngược (ST-007).
    exposedHeaders: ['x-request-id', 'Date'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  await app.listen(port);
  process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level: 'log', message: 'Backend API listening', port, path: '/api' })}\n`);
}

bootstrap().catch((err) => {
  const safeLogger = new SafeLogger();
  safeLogger.error('Backend failed to start', err);
  process.exit(1);
});
