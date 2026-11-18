import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JoinWaitlistDto, type JoinWaitlistResponse } from './dto/join-waitlist.dto';
import { WaitlistService } from './waitlist.service';

@Controller('waitlist')
@UseGuards(JwtAuthGuard)
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  join(@CurrentUser() user: AuthUser, @Body() dto: JoinWaitlistDto): Promise<JoinWaitlistResponse> {
    return this.waitlist.joinWaitlist(user.id, dto.eventId);
  }
}
