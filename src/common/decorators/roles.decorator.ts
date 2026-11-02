import { SetMetadata } from '@nestjs/common';

export enum UserRole {
  STUDENT = 'STUDENT',
  REP = 'REP',
  ADMIN = 'ADMIN',
}

export const ROLES_KEY = 'roles';

/**
 * Decorator to specify the user roles required to access an endpoint.
 *
 * Example:
 *   @Roles(UserRole.REP, UserRole.ADMIN)
 *   @Post('broadcast')
 */
export const Roles = (...roles: (UserRole | string)[]) => SetMetadata(ROLES_KEY, roles);

