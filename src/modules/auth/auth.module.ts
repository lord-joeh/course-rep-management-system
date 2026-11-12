import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleOAuthService } from './services/google-oauth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { StudentModule } from '../student/student.module';
import { QueueModule } from '../queue/queue.module';
import { NotificationModule } from '../notification/notification.module';
import { Student } from '../student/entities/student.entity';
import { RefreshToken } from '../student/entities/refresh-token.entity';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
    TypeOrmModule.forFeature([Student, RefreshToken]),
    StudentModule,
    QueueModule,
    NotificationModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, GoogleOAuthService],
  exports: [AuthService, GoogleOAuthService, PassportModule, JwtModule],
})
export class AuthModule {}

