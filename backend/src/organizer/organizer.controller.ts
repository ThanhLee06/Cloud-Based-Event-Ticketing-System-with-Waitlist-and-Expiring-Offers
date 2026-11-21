import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateEventDto } from '../events/dto/create-event.dto';
import { UpdateEventDto } from '../events/dto/update-event.dto';
import { OrganizerService } from './organizer.service';

const EVENT_DTO_VALIDATION_PIPE = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('organizer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ORGANIZER', 'ADMIN')
export class OrganizerController {
  constructor(private readonly organizer: OrganizerService) {}

  @Get('events')
  getEvents(@CurrentUser() user: AuthUser) {
    return this.organizer.getEvents(user);
  }

  /** ST-013 (Bước 2): Tạo sự kiện thật trong PostgreSQL (HTTP 201 Created). */
  @Post('events')
  @HttpCode(HttpStatus.CREATED)
  createEvent(
    @CurrentUser() user: AuthUser,
    @Body(EVENT_DTO_VALIDATION_PIPE) dto: CreateEventDto
  ) {
    return this.organizer.createEvent(user, dto);
  }

  /** ST-013 (Bước 3): Cập nhật một phần sự kiện trong PostgreSQL (HTTP 200 OK). */
  @Patch('events/:id')
  @HttpCode(HttpStatus.OK)
  updateEvent(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) eventId: string,
    @Body(EVENT_DTO_VALIDATION_PIPE) dto: UpdateEventDto
  ) {
    return this.organizer.updateEvent(user, eventId, dto);
  }

  @Get('stats')
  getStats(@CurrentUser() user: AuthUser) {
    return this.organizer.getStats(user);
  }

  @Get('events/:id/waitlist')
  getEventWaitlist(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) eventId: string
  ) {
    return this.organizer.getEventWaitlist(user, eventId);
  }

  @Post('events/:id/promote')
  promoteNextWaitlist(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) eventId: string
  ) {
    return this.organizer.promoteNextWaitlist(user, eventId);
  }

  @Get('events/:id/attendees')
  getAttendees(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) eventId: string
  ) {
    return this.organizer.getAttendees(user, eventId);
  }

  @Get('events/:id/attendees/csv')
  async exportAttendeesCsv(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) eventId: string,
    @Res() response: Response
  ): Promise<void> {
    const { csv, filename } = await this.organizer.exportAttendeesCsv(user, eventId);
    response
      .status(200)
      .setHeader('Content-Type', 'text/csv; charset=utf-8')
      .setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`)
      .send(csv);
  }
}
