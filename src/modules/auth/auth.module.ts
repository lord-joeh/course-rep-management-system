import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleOAuthService } from './services/google-oauth.service';
import { AppleOAuthService } from './services/apple-oauth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { StudentModule } from '../student/student.module';
import { QueueModule } from '../queue/queue.module';
import { Student } from '../student/entities/student.entity';
import { RefreshToken } from '../student/entities/refresh-token.entity';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
    TypeOrmModule.forFeature([Student, RefreshToken]),
    StudentModule,
    QueueModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, GoogleOAuthService, AppleOAuthService],
  exports: [AuthService, GoogleOAuthService, AppleOAuthService, PassportModule, JwtModule],
})
export class AuthModule {}

