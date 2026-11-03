import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class BullBoardAuthGuard implements CanActivate {
  private readonly logger = new Logger(BullBoardAuthGuard.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const clientIp = this.extractClientIp(request);

    // 1. Validate IP Whitelist
    const allowedIpsConfig = this.configService.get<string>(
      'ADMIN_ALLOWED_IPS',
      '127.0.0.1,::1,localhost',
    );
    const allowedIps = allowedIpsConfig
      .split(',')
      .map((ip) => ip.trim().toLowerCase());

    const isIpAllowed =
      allowedIps.includes('*') ||
      allowedIps.includes(clientIp.toLowerCase()) ||
      (clientIp === '::1' && allowedIps.includes('127.0.0.1')) ||
      (clientIp === '127.0.0.1' && allowedIps.includes('::1'));

    if (!isIpAllowed) {
      this.logger.warn(`Unauthorized IP access attempt to Bull Board from: ${clientIp}`);
      throw new ForbiddenException(`Access denied: IP address [${clientIp}] not authorized for queue monitoring`);
    }

    // 2. Validate Rep / Admin Identity
    let user = request.user;

    if (!user) {
      const authHeader = request.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException('Authentication token required for queue board access');
      }

      const token = authHeader.substring(7);
      try {
        const secret =
          this.configService.get<string>('JWT_ACCESS_SECRET') ||
          this.configService.get<string>('JWT_SECRET', 'cr_access_secret_key_2026_dev');
        const payload = await this.jwtService.verifyAsync(token, { secret });
        user = payload;
        request.user = payload;
      } catch (err: any) {
        throw new UnauthorizedException('Invalid or expired authentication token');
      }
    }

    if (!user.isRep) {
      this.logger.warn(`Non-rep student [${user.sub || user.id}] rejected from Bull Board`);
      throw new ForbiddenException('Course Representative privileges required to access queue dashboard');
    }

    return true;
  }

  private extractClientIp(req: any): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const first = typeof forwarded === 'string' ? forwarded.split(',')[0] : forwarded[0];
      return first.trim().replace(/^::ffff:/, '');
    }
    const ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '127.0.0.1';
    return ip.replace(/^::ffff:/, '');
  }
}

