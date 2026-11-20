
import {
  Controller,
  Get,
  Query,
  ValidationPipe,
} from '@nestjs/common';

import { EventsService } from './events.service';
import { QueryEventsDto } from './dto/query-events.dto';

@Controller('events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
  ) {}

  @Get()
  findAll(
    @Query(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    query: QueryEventsDto,
  ) {
    return this.eventsService.findAll(query);
  }
}
