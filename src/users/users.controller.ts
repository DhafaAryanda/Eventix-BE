import {
  Controller,
  Get,
  Post,
  Delete,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  // GET /api/users/me
  @Get('me')
  getProfile(@CurrentUser('id') userId: string) {
    return this.usersService.getProfile(userId);
  }

  // POST /api/users/me/avatar
  @Post('me/avatar')
  @HttpCode(HttpStatus.OK)
  async uploadAvatar(
    @CurrentUser('id') userId: string,
    @Req() req: FastifyRequest,
  ) {
    const file = await req.file();
    if (!file) throw new BadRequestException('File tidak ditemukan');
    const buffer = await file.toBuffer();
    return this.usersService.uploadAvatar(userId, buffer, file.mimetype);
  }

  // DELETE /api/users/me/avatar
  @Delete('me/avatar')
  @HttpCode(HttpStatus.OK)
  deleteAvatar(@CurrentUser('id') userId: string) {
    return this.usersService.deleteAvatar(userId);
  }
}
