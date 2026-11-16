import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    // Các thành viên đăng ký Module nghiệp vụ của mình tại đây:
    // - TV1: AuthModule, UsersModule, AdminModule
    // - TV2: EventsModule
    // - TV3: ReservationsModule
    // - TV4: WaitlistModule, OffersModule
    // - TV5: OrganizerModule, MetricsModule
  ],
})
export class AppModule {}
