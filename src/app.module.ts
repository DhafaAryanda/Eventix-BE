import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '@nestjs-modules/ioredis';
import { BullModule } from '@nestjs/bullmq';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { EventsModule } from './events/events.module';

@Module({
  imports: [
    // Config — harus paling pertama
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // Redis
    RedisModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'single',
        url: config.get<string>('REDIS_URL'),
      }),
    }),

    // BullMQ (job queue, pakai Redis)
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('REDIS_URL'),
        },
      }),
    }),

    // Event emitter untuk komunikasi antar service
    EventEmitterModule.forRoot(),

    // Scheduler untuk cron job
    ScheduleModule.forRoot(),

    // Prisma (database)
    PrismaModule,

    AuthModule,
    MailModule,
    EventsModule,

    // Feature modules (tambahkan seiring perkembangan)
    // AuthModule,
    // EventsModule,
    // QueueModule,
  ],
})
export class AppModule {}
