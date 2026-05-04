import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FastifyReply } from 'fastify';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();

    let status: number;
    let message: string;

    switch (exception.code) {
      case 'P2002':
        status = HttpStatus.CONFLICT;
        message = 'Data sudah ada';
        break;
      case 'P2025':
        status = HttpStatus.NOT_FOUND;
        message = 'Data tidak ditemukan';
        break;
      case 'P2003':
        status = HttpStatus.BAD_REQUEST;
        message = 'Referensi data tidak valid';
        break;
      default:
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        message = 'Terjadi kesalahan pada database';
    }

    reply.status(status).send({ statusCode: status, message });
  }
}
