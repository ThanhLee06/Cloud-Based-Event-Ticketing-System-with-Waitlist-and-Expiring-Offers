import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async checkHealth(): Promise<{ status: string; db: string; timestamp: string }> {
    const timestamp = new Date().toISOString();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        db: 'up',
        timestamp,
      };
    } catch {
      throw new HttpException(
        {
          status: 'degraded',
          db: 'down',
          timestamp,
        },
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }
}
