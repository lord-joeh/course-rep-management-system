import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../types/jwt-payload.interface';

@Injectable()
export class StudentOwnershipGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;
    const targetStudentId = request.params?.id;

    if (!user) {
      throw new ForbiddenException('User authentication context not found');
    }

    // Course Reps and Admins possess visibility into all student profiles
    if (user.isRep === true || user.role === 'REP' || user.role === 'ADMIN') {
      return true;
    }

    // Regular students can only access their own profile
    if (targetStudentId && user.id === targetStudentId) {
      return true;
    }

    throw new ForbiddenException(
      "You do not have permission to view or access another student's profile",
    );
  }
}

