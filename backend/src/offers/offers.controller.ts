import {
  Controller,
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
  AcceptOfferResponse,
  DeclineOfferResponse,
  OfferDetailResponse,
} from './dto/offer.dto';
import { OffersService } from './offers.service';

@Controller('offers')
@UseGuards(JwtAuthGuard)
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Get(':id')
  getOffer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<OfferDetailResponse> {
    return this.offersService.getOffer(user.id, id);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  acceptOffer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<AcceptOfferResponse> {
    return this.offersService.acceptOffer(user.id, id);
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  declineOffer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<DeclineOfferResponse> {
    return this.offersService.declineOffer(user.id, id);
  }
}
