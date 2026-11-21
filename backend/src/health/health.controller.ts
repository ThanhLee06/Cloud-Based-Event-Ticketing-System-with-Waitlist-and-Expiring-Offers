import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly metrics: MetricsService) {}

  @Get()
  async checkHealth(): Promise<{ status: string; db: string; timestamp: string }> {
    const timestamp = new Date().toISOString();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      try {
        const connections = await this.prisma.$queryRaw<Array<{ count: number }>>`
          SELECT count(*)::int AS "count"
          FROM pg_stat_activity
          WHERE datname = current_database()
        `;
        this.metrics.recordDbConnectionCount(connections[0]?.count ?? 0);
      } catch {
        // Health is decided by SELECT 1; metrics permissions should not mark a healthy DB down.
      }
      return {
        status: 'ok',
        db: 'up',
        timestamp,
      };
    } catch {
      this.metrics.recordDbConnectionCount(0);
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
