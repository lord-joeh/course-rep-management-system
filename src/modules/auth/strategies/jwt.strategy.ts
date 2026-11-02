import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { StudentService } from '../../student/student.service';
import { StudentStatus } from '../../student/entities/student.entity';
import { JwtPayload, AuthenticatedUser } from '../../../common/types/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly studentService: StudentService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('jwt.accessSecret') ||
        process.env.JWT_ACCESS_SECRET ||
        'default_jwt_access_secret_min_32_chars_long',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Malformed token payload');
    }

    const student = await this.studentService.findById(payload.sub);

    if (!student) {
      throw new UnauthorizedException('Student account not found');
    }

    if (student.status !== StudentStatus.ACTIVE) {
      throw new UnauthorizedException(`Student account is ${student.status}`);
    }

    return {
      id: student.id,
      email: student.email,
      name: student.name,
      phone: student.phone,
      isRep: Boolean(student.isRep),
      role: student.isRep ? 'REP' : 'STUDENT',
      status: student.status,
    };
  }
}

