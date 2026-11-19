import { Controller, Get, Param, ParseUUIDPipe, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OrganizerService } from './organizer.service';

@Controller('organizer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ORGANIZER', 'ADMIN')
export class OrganizerController {
  constructor(private readonly organizer: OrganizerService) {}

  @Get('events')
  getEvents(@CurrentUser() user: AuthUser) {
    return this.organizer.getEvents(user);
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
