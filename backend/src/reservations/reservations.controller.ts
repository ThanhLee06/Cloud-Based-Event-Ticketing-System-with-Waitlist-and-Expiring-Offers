import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateReservationDto, ReservationResponse } from './dto/reservations.dto';
import { ReservationsService } from './reservations.service';

@Controller('reservations')
@UseGuards(JwtAuthGuard)
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReservationDto, @Headers('idempotency-key') key: string): Promise<ReservationResponse> {
    return this.reservations.create(user.id, dto, key);
  }

  @Get('me')
  getMine(@CurrentUser() user: AuthUser): Promise<ReservationResponse[]> {
    return this.reservations.getMine(user.id);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<ReservationResponse> {
    return this.reservations.getOne(user.id, id);
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Headers('idempotency-key') key: string): Promise<ReservationResponse> {
    return this.reservations.confirm(user.id, id, key);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Headers('idempotency-key') key: string): Promise<ReservationResponse> {
    return this.reservations.cancel(user.id, id, key);
  }
}
