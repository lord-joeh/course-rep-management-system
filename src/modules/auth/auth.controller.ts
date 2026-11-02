import {
  Controller,
  Post,
  Body,
  Get,
  Patch,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/jwt-payload.interface';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
} from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh-token')
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(
    @CurrentUser('id') studentId: string,
    @Body() dto: Partial<RefreshTokenDto>,
  ) {
    return this.authService.logout(studentId, dto?.refreshToken);
  }

  @Get('profile')
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @HttpCode(HttpStatus.OK)
  @Patch('change-password')
  async changePassword(
    @CurrentUser('id') studentId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(studentId, dto);
  }
}

