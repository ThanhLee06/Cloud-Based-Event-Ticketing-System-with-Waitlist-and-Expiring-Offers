import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { BookingMetricsInterceptor } from './booking-metrics.interceptor';
import { MetricsService } from './metrics.service';

@Global()
@Module({
  providers: [MetricsService, { provide: APP_INTERCEPTOR, useClass: BookingMetricsInterceptor }],
  exports: [MetricsService],
})
export class MetricsModule {}
