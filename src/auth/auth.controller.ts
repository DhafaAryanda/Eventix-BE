import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { JwtPayloadWithRefresh } from './types/jwt-payload.type';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // POST /api/auth/register
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // GET /api/auth/verify-email?token=xxx
  @Get('verify-email')
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  // POST /api/auth/resend-verification
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  resendVerification(@Body('email') email: string) {
    return this.authService.resendVerificationEmail(email);
  }

  // POST /api/auth/login
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // POST /api/auth/refresh
  @Post('refresh')
  @UseGuards(JwtRefreshGuard) // ← guard decode token dulu sebelum masuk sini
  @HttpCode(HttpStatus.OK)
  refresh(@CurrentUser() user: JwtPayloadWithRefresh) {
    // req.user sudah ter-inject oleh JwtRefreshStrategy
    // user.sub      = userId
    // user.refreshToken = raw refresh token untuk diverifikasi
    return this.authService.refreshTokens(user.sub, user.refreshToken);
  }

  // POST /api/auth/logout
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  logout(@CurrentUser('id') userId: string) {
    return this.authService.logout(userId);
  }

  // POST /api/auth/forgot-password
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  // POST /api/auth/reset-password
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  // GET /api/auth/me — contoh route protected
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: any) {
    return user;
  }
}
