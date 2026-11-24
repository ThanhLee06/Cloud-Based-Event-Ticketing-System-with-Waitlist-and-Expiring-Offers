import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class BookingMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    if (request.method !== 'POST' || request.path.replace(/\/$/, '') !== '/api/reservations') return next.handle();

    const startedAt = process.hrtime.bigint();
    let terminalError: unknown;
    response.once('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      this.metrics.recordBookingLatency(durationMs);
      if (response.statusCode === 409 && this.isCapacityConflict(terminalError)) this.metrics.recordCapacityConflict();
    });
    return next.handle().pipe(tap({ error: (error: unknown) => { terminalError = error; } }));
  }

  private isCapacityConflict(error: unknown): boolean {
    if (!(error instanceof HttpException)) return false;
    const body = error.getResponse();
    const message = typeof body === 'string' ? body : JSON.stringify(body);
    return /capacity|sold.?out|no.?ticket|h\u1ebft v\u00e9|h\u1ebft ch\u1ed7/i.test(message);
  }
}
