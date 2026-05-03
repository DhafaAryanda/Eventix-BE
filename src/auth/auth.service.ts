import {
  Injectable,
  Logger,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtPayload } from './types/jwt-payload.type';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private mail: MailService,
  ) {}

  // ===========================
  // REGISTER
  // ===========================
  async register(dto: RegisterDto) {
    // Cek duplikat email
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email sudah terdaftar');
    }

    // Hash password dengan cost factor 12
    const password = await bcrypt.hash(dto.password, 12);

    // Generate token verifikasi email
    const emailVerifyToken = crypto.randomBytes(32).toString('hex');
    const emailVerifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 jam

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        password,
        emailVerifyToken,
        emailVerifyExpires,
      },
    });

    const baseUrl = this.config.get<string>('APP_URL');

    if (!baseUrl) {
      throw new Error('APP_URL is not defined');
    }

    // Kirim email verifikasi (non-blocking — tidak await)
    this.mail
      .sendVerificationEmail({
        to: user.email,
        name: user.name,
        token: emailVerifyToken,
        baseUrl: baseUrl,
      })
      .catch((err) => {
        this.logger.error('Gagal kirim email verifikasi', err.stack);
      });

    return {
      message: 'Registrasi berhasil. Cek email kamu untuk verifikasi.',
    };
  }

  // ===========================
  // VERIFY EMAIL
  // ===========================
  async verifyEmail(token: string) {
    const user = await this.prisma.user.findUnique({
      where: { emailVerifyToken: token },
    });

    if (!user) {
      throw new BadRequestException('Token verifikasi tidak valid');
    }

    if (!user.emailVerifyExpires || user.emailVerifyExpires < new Date()) {
      throw new BadRequestException(
        'Token verifikasi sudah expired. Minta kirim ulang.',
      );
    }

    if (user.isEmailVerified) {
      return { message: 'Email sudah terverifikasi sebelumnya' };
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerifyToken: null, // hapus token setelah dipakai
        emailVerifyExpires: null,
      },
    });

    return { message: 'Email berhasil diverifikasi. Silakan login.' };
  }

  // ===========================
  // RESEND VERIFICATION EMAIL
  // ===========================
  async resendVerificationEmail(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Jangan reveal apakah email terdaftar atau tidak (security)
    if (!user || user.isEmailVerified) {
      return {
        message:
          'Jika email terdaftar dan belum diverifikasi, email akan dikirim.',
      };
    }

    const emailVerifyToken = crypto.randomBytes(32).toString('hex');
    const emailVerifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifyToken, emailVerifyExpires },
    });

    const baseUrl = this.config.get<string>('APP_URL');

    if (!baseUrl) {
      throw new Error('APP_URL is not defined');
    }

    this.mail
      .sendVerificationEmail({
        to: user.email,
        name: user.name,
        token: emailVerifyToken,
        baseUrl: baseUrl,
      })
      .catch((err) => {
        this.logger.error('Gagal kirim ulang email verifikasi', err.stack);
      });

    return {
      message:
        'Jika email terdaftar dan belum diverifikasi, email akan dikirim.',
    };
  }

  // ===========================
  // LOGIN
  // ===========================
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Jangan bilang "email tidak ditemukan" — hindari user enumeration attack
    if (!user) {
      throw new UnauthorizedException('Email atau password salah');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Email atau password salah');
    }

    if (!user.isEmailVerified) {
      throw new ForbiddenException('Email belum diverifikasi. Cek inbox kamu.');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);

    // Simpan hash refresh token ke DB
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  // ===========================
  // REFRESH TOKEN
  // ===========================
  async refreshTokens(userId: string, rawRefreshToken: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Akses ditolak');
    }

    const tokenValid = await bcrypt.compare(
      rawRefreshToken,
      user.refreshTokenHash,
    );

    if (!tokenValid) {
      throw new UnauthorizedException('Refresh token tidak valid');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  // ===========================
  // LOGOUT
  // ===========================
  async logout(userId: string) {
    // Hapus refresh token dari DB → token lama tidak bisa dipakai lagi
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });

    return { message: 'Logout berhasil' };
  }

  // ===========================
  // FORGOT PASSWORD
  // ===========================
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Selalu return pesan sama, tidak reveal apakah email ada atau tidak
    const genericMessage = {
      message: 'Jika email terdaftar, link reset password akan dikirim.',
    };

    if (!user || !user.isEmailVerified) return genericMessage;

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 jam

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: resetToken,
        resetPasswordExpires: resetExpires,
      },
    });

    const baseUrl = this.config.get<string>('APP_URL');

    if (!baseUrl) {
      throw new Error('APP_URL is not defined');
    }

    this.mail
      .sendResetPasswordEmail({
        to: user.email,
        name: user.name,
        token: resetToken,
        baseUrl: baseUrl,
      })
      .catch((err) => {
        this.logger.error('Gagal kirim email reset password', err.stack);
      });

    return genericMessage;
  }

  // ===========================
  // RESET PASSWORD
  // ===========================
  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { resetPasswordToken: dto.token },
    });

    if (!user) {
      throw new BadRequestException('Token reset tidak valid');
    }

    if (!user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      throw new BadRequestException(
        'Token reset sudah expired. Minta reset ulang.',
      );
    }

    const password = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password,
        resetPasswordToken: null, // hapus token setelah dipakai
        resetPasswordExpires: null,
        refreshTokenHash: null, // logout semua sesi aktif
      },
    });

    return { message: 'Password berhasil direset. Silakan login.' };
  }

  // ===========================
  // PRIVATE HELPERS
  // ===========================
  private async generateTokens(userId: string, email: string, role: string) {
    const payload: JwtPayload = { sub: userId, email, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow('JWT_SECRET'),
        expiresIn: this.config.getOrThrow('JWT_EXPIRES_IN'), // '15m'
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: this.config.getOrThrow('JWT_REFRESH_EXPIRES_IN'), // '7d'
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async saveRefreshToken(userId: string, rawToken: string) {
    // Simpan hash bukan plain token — jika DB bocor, token tidak bisa dipakai
    const hash = await bcrypt.hash(rawToken, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: hash },
    });
  }
}
