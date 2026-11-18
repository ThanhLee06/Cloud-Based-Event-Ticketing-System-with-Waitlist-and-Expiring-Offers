import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  JoinWaitlistDto,
  type JoinWaitlistResponse,
  type LeaveWaitlistResponse,
  type MyWaitlistItemResponse,
} from './dto/join-waitlist.dto';
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

  @Get('me')
  getMyWaitlist(@CurrentUser() user: AuthUser): Promise<MyWaitlistItemResponse[]> {
    return this.waitlist.getMyWaitlist(user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  leave(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<LeaveWaitlistResponse> {
    return this.waitlist.leaveWaitlist(user.id, id);
  }
}
