import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const port = configService.get<number>('PORT') || 4000;
  const corsOrigin = configService.get<string>('CORS_ORIGIN') || 'http://localhost:3000';

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: corsOrigin.split(',').map((item) => item.trim()),
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
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
  process.stdout.write(`EventFlow Backend API listening on http://localhost:${port}/api\n`);
}

bootstrap().catch((err) => {
  process.stderr.write(`Backend failed to start: ${String(err)}\n`);
  process.exit(1);
});
