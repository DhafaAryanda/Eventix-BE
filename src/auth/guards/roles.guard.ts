import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Ambil roles yang dibutuhkan dari decorator @Roles(...)
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Jika tidak ada @Roles decorator, route bebas diakses
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();

    const hasRole = requiredRoles.includes(user?.role);
    if (!hasRole) {
      throw new ForbiddenException(
        `Akses ditolak. Dibutuhkan role: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
