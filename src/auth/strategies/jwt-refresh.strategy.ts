import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { FastifyRequest } from 'fastify';
import { JwtPayload, JwtPayloadWithRefresh } from '../types/jwt-payload.type';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      ignoreExpiration: false,
      passReqToCallback: true,
    });
  }

  validate(req: FastifyRequest, payload: JwtPayload): JwtPayloadWithRefresh {
    const authHeader = req.headers.authorization;
    console.log('🔑 Auth Header:', authHeader);

    if (!authHeader) {
      throw new UnauthorizedException();
    }

    const refreshToken = authHeader.replace('Bearer ', '').trim();
    if (!refreshToken) {
      throw new UnauthorizedException();
    }

    console.log('✅ Refresh token extracted, length:', refreshToken.length);

    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      refreshToken,
    };
  }
}
