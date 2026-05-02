import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // Override handleRequest agar pesan error lebih jelas
  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw new UnauthorizedException(
        'Token tidak valid atau sudah expired. Silakan login ulang.',
      );
    }
    return user;
  }
}
