import { WaitlistStatus } from '@prisma/client';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class JoinWaitlistDto {
  @IsNotEmpty({ message: 'Vui lòng cung cấp eventId.' })
  @IsUUID('all', { message: 'eventId phải là UUID hợp lệ.' })
  eventId!: string;
}

export interface JoinWaitlistResponse {
  id: string;
  eventId: string;
  userId: string;
  sequenceNo: number;
  status: WaitlistStatus;
  joinedAt: Date;
  currentRank: number;
}
