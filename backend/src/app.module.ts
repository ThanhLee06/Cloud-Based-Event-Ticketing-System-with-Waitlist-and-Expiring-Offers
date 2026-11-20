import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateEnv } from "./config/env.validation";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./health/health.module";
import { RequestIdMiddleware } from "./common/request-id.middleware";
import { MailModule } from "./mail/mail.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { AdminModule } from "./admin/admin.module";
import { OrganizerModule } from "./organizer/organizer.module";
import { WaitlistModule } from "./waitlist/waitlist.module";
import { OffersModule } from "./offers/offers.module";
import { JobsModule } from "./jobs/jobs.module";
import { EventsModule } from "./events/events.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    MailModule,
    AuthModule,
    UsersModule,
    AdminModule,
    OrganizerModule,
    EventsModule,
    WaitlistModule,
    OffersModule,
    JobsModule,
    // Các thành viên đăng ký Module nghiệp vụ của mình tại đây:
    // - TV1: AuthModule, UsersModule, AdminModule
    // - TV2: EventsModule
    // - TV3: ReservationsModule
    // - TV4: WaitlistModule, OffersModule
    // - TV5: OrganizerModule, MetricsModule
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes({ path: "{*path}", method: RequestMethod.ALL });
  }
}
