import { Module } from '@nestjs/common';
import { WaitlistModule } from '../waitlist/waitlist.module';
import { ExpirySweepService } from './expiry-sweep.service';
import { InternalJobsController } from './internal-jobs.controller';

@Module({
  imports: [WaitlistModule],
  controllers: [InternalJobsController],
  providers: [ExpirySweepService],
  exports: [ExpirySweepService],
})
export class JobsModule {}
