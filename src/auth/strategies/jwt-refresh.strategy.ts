import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { FastifyRequest } from 'fastify';
import { JwtPayload, JwtPayloadWithRefresh } from '../types/jwt-payload.type';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      ignoreExpiration: false,
      passReqToCallback: true,
    });
  }

  async validate(
    req: FastifyRequest,
    payload: JwtPayload,
  ): Promise<JwtPayloadWithRefresh> {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new UnauthorizedException();

    const refreshToken = authHeader.replace('Bearer ', '').trim();
    if (!refreshToken) throw new UnauthorizedException();

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, refreshTokenHash: true },
    });

    if (!user || !user.refreshTokenHash) throw new UnauthorizedException();

    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      refreshToken,
    };
  }
}
