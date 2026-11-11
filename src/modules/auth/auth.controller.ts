import {
  Controller,
  Post,
  Body,
  Get,
  Patch,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ClientIp } from '../../common/decorators/client-ip.decorator';
import { AuthenticatedUser } from '../../common/types/jwt-payload.interface';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  GoogleAuthDto,
  AppleAuthDto,
  CompleteOAuthRegistrationDto,
} from './dto';

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @ClientIp() clientIp: string = '127.0.0.1') {
    return this.authService.register(dto, clientIp);
  }

  @Public()
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() dto: LoginDto, @ClientIp() clientIp: string = '127.0.0.1') {
    return this.authService.login(dto, clientIp);
  }

  @Public()
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @Post('google')
  async loginWithGoogle(
    @Body() dto: GoogleAuthDto,
    @ClientIp() clientIp: string = '127.0.0.1',
  ) {
    return this.authService.loginWithGoogle(dto, clientIp);
  }

  @Public()
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @Post('apple')
  async loginWithApple(
    @Body() dto: AppleAuthDto,
    @ClientIp() clientIp: string = '127.0.0.1',
  ) {
    return this.authService.loginWithApple(dto, clientIp);
  }

  @Public()
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @Post('oauth/complete-registration')
  async completeOAuthRegistration(
    @Body() dto: CompleteOAuthRegistrationDto,
    @ClientIp() clientIp: string = '127.0.0.1',
  ) {
    return this.authService.completeOAuthRegistration(dto, clientIp);
  }

  @Public()
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @Post('refresh-token')
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }

  @Public()
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @ClientIp() clientIp: string = '127.0.0.1',
  ) {
    return this.authService.forgotPassword(dto, clientIp);
  }

  @Public()
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @ClientIp() clientIp: string = '127.0.0.1',
  ) {
    return this.authService.resetPassword(dto, clientIp);
  }

  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(
    @CurrentUser('id') studentId: string,
    @Body() dto: Partial<RefreshTokenDto>,
  ) {
    return this.authService.logout(studentId, dto?.refreshToken);
  }

  @SkipThrottle()
  @Get('profile')
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @Patch('change-password')
  async changePassword(
    @CurrentUser('id') studentId: string,
    @Body() dto: ChangePasswordDto,
    @ClientIp() clientIp: string = '127.0.0.1',
  ) {
    return this.authService.changePassword(studentId, dto, clientIp);
  }
}
