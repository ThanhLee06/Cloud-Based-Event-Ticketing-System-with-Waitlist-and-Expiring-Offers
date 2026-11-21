import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { WaitlistModule } from '../waitlist/waitlist.module';
import { OrganizerController } from './organizer.controller';
import { OrganizerService } from './organizer.service';

@Module({
  imports: [WaitlistModule, EventsModule],
  controllers: [OrganizerController],
  providers: [OrganizerService],
})
export class OrganizerModule {}
