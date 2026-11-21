
import { Module } from '@nestjs/common';
import { EventSlugService } from './event-slug.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  controllers: [EventsController],
  providers: [EventsService, EventSlugService],
  exports: [EventSlugService],
})
export class EventsModule {}
