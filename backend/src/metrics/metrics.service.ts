import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { hostname } from 'node:os';
import { getRequestId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

const namespace = (): string => process.env.CLOUDWATCH_METRICS_NAMESPACE || 'EventFlow/Operations';
const serviceName = (): string => process.env.SERVICE_NAME || 'eventflow-api';
const taskId = (): string => process.env.TASK_ID || process.env.ECS_TASK_ID || process.env.HOSTNAME || hostname();

@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetricsService.name);
  private dbConnectionCount = 0;
  private dbTimer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    void this.sampleDbConnections();
    this.dbTimer = setInterval(() => void this.sampleDbConnections(), 30_000);
    this.dbTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.dbTimer) clearInterval(this.dbTimer);
  }

  recordBookingLatency(durationMs: number): void {
    const value = Math.max(0, durationMs);
    this.emit('BookingLatencyMs', value, 'Milliseconds');
  }

  recordCapacityConflict(): void {
    this.emit('CapacityConflict', 1, 'Count');
  }

  /** One EMF sample per replay: CloudWatch Sum over a period is the replay count. */
  recordDuplicateReplay(): void {
    this.emit('DuplicateReplay', 1, 'Count');
  }

  private async sampleDbConnections(): Promise<void> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE datname = current_database()
      `;
      this.dbConnectionCount = rows[0]?.count ?? 0;
      this.emit('DbConnectionCount', this.dbConnectionCount, 'Count');
    } catch (error) {
      this.logger.warn({ event: 'db_connection_metric_failed', error });
    }
  }

  private emit(metric: string, value: number, unit: 'Count' | 'Milliseconds'): void {
    // This record contains only fixed metric names, a deployment service label,
    // and numeric values; preserve EMF's case-sensitive `Name` descriptor.
    const event = {
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [{
          Namespace: namespace(),
          Dimensions: [['Service']],
          Metrics: [{ Name: metric, Unit: unit }],
        }],
      },
      Service: serviceName(),
      taskId: taskId(),
      ...(getRequestId() ? { requestId: getRequestId() } : {}),
      ...(metric === 'BookingLatencyMs' ? { endpoint: 'POST /api/reservations' } : {}),
      event: metric,
      [metric]: value,
    };
    process.stdout.write(`${JSON.stringify(event)}\n`);
  }
}
