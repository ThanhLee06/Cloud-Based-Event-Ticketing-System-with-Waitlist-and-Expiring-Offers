import { Injectable, Logger } from '@nestjs/common';

export interface OperationalMetrics {
  booking_latency_ms: { count: number; p95: number };
  capacity_conflicts: number;
  duplicate_replays: number;
  db_connection_count: number;
}

const LATENCY_WINDOW_SIZE = 2_000;

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private readonly bookingLatencies: number[] = [];
  private capacityConflicts = 0;
  private duplicateReplays = 0;
  private dbConnectionCount = 0;

  recordBookingLatency(durationMs: number): void {
    this.bookingLatencies.push(Math.max(0, durationMs));
    if (this.bookingLatencies.length > LATENCY_WINDOW_SIZE) this.bookingLatencies.shift();
    this.emit();
  }

  recordCapacityConflict(): void {
    this.capacityConflicts++;
    this.emit();
  }

  recordDuplicateReplay(): void {
    this.duplicateReplays++;
    this.emit();
  }

  recordDbConnectionCount(count: number): void {
    this.dbConnectionCount = Math.max(0, count);
    this.emit();
  }

  snapshot(): OperationalMetrics {
    const sorted = [...this.bookingLatencies].sort((a, b) => a - b);
    const p95Index = sorted.length ? Math.ceil(sorted.length * 0.95) - 1 : -1;
    return {
      booking_latency_ms: { count: sorted.length, p95: p95Index >= 0 ? sorted[p95Index] : 0 },
      capacity_conflicts: this.capacityConflicts,
      duplicate_replays: this.duplicateReplays,
      db_connection_count: this.dbConnectionCount,
    };
  }

  private emit(): void {
    this.logger.log(JSON.stringify({ event: 'operational_metrics', ...this.snapshot() }));
  }
}
