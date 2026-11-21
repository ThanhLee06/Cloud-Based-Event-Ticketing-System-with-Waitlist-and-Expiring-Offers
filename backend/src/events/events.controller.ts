import { Controller, Get, Param, Query, UseGuards, ValidationPipe } from "@nestjs/common";

import type { AuthUser } from "../auth/auth.types";
import { OptionalCurrentUser } from "../auth/decorators/current-user.decorator";
import { OptionalJwtAuthGuard } from "../auth/guards/optional-jwt-auth.guard";
import { EventsService } from "./events.service";
import { QueryEventsDto } from "./dto/query-events.dto";

@Controller("events")
export class EventsController {
  constructor(private readonly eventsService: EventsService) { }

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

  @UseGuards(OptionalJwtAuthGuard)
  @Get(":slug")
  findOne(
    @Param("slug") slug: string,
    @OptionalCurrentUser() user: AuthUser | null,
  ) {
    return this.eventsService.findOneBySlug(slug, user?.id ?? null);
  }
}
