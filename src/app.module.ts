import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '@nestjs-modules/ioredis';
import { BullModule } from '@nestjs/bullmq';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { EventsModule } from './events/events.module';
import { QueueModule } from './queue/queue.module';
import { TicketModule } from './ticket/ticket.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // Pino Logger
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get('NODE_ENV') === 'production' ? 'info' : 'debug',
          transport:
            config.get('NODE_ENV') !== 'production'
              ? {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    translateTime: 'SYS:standard',
                    ignore: 'pid,hostname',
                    singleLine: false,
                  },
                }
              : undefined,
          customProps: () => ({
            context: 'HTTP',
          }),
          serializers: {
            req: (req: any) => ({
              id: req.id,
              method: req.method,
              url: req.url,
            }),
            res: (res: any) => ({
              statusCode: res.statusCode,
            }),
          },
          autoLogging: {
            ignore: (req) => req.url === '/health' || req.url === '/metrics',
          },
        },
      }),
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
    QueueModule,
    TicketModule,

    // Feature modules (tambahkan seiring perkembangan)
    // AuthModule,
    // EventsModule,
    // QueueModule,
  ],
})
export class AppModule {}
