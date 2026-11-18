import * as crypto from 'node:crypto';
import { Controller, Headers, HttpCode, HttpStatus, Post, UnauthorizedException } from '@nestjs/common';
import type { SweepExpiredRecordsResult } from './dto/jobs.dto';
import { ExpirySweepService } from './expiry-sweep.service';

@Controller('internal/jobs')
export class InternalJobsController {
  constructor(private readonly sweepService: ExpirySweepService) {}

  @Post('expire-sweep')
  @HttpCode(HttpStatus.OK)
  async triggerExpireSweep(
    @Headers('x-internal-job-secret') secretHeader?: string
  ): Promise<SweepExpiredRecordsResult> {
    const configuredSecret = process.env.INTERNAL_JOB_SECRET?.trim();
    const providedSecret = secretHeader?.trim();
    if (!configuredSecret || !providedSecret) {
      throw new UnauthorizedException('Thiếu hoặc chưa cấu hình khóa xác thực nội bộ.');
    }
    const a = Buffer.from(providedSecret);
    const b = Buffer.from(configuredSecret);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Khóa xác thực nội bộ không hợp lệ.');
    }
    return this.sweepService.sweepExpiredRecords(crypto.randomUUID());
  }
}
