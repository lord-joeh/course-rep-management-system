import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, UserRole } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../types/jwt-payload.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<(UserRole | string)[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();

    if (!user) {
      throw new ForbiddenException('User context not found');
    }

    // Role check
    const hasRole = requiredRoles.some((role) => {
      if (role === UserRole.REP || role === 'REP') {
        return user.isRep === true || user.role === 'REP';
      }
      if (role === UserRole.ADMIN || role === 'ADMIN') {
        return user.role === 'ADMIN';
      }
      if (role === UserRole.STUDENT || role === 'STUDENT') {
        return true; // All authenticated users are students
      }
      return user.role === role;
    });

    if (!hasRole) {
      throw new ForbiddenException(
        `Insufficient privileges. Required role(s): [${requiredRoles.join(', ')}]`,
      );
    }

    return true;
  }
}
