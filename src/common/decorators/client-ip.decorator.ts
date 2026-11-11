import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * Custom parameter decorator to extract the real client IP address.
 * Accurately extracts client IP behind reverse proxies (Nginx / Cloudflare / AWS ALB)
 * from 'x-forwarded-for' or 'x-real-ip' before falling back to req.ip or socket remote address.
 */
export const ClientIp = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<Request>();

    // 1. Check X-Forwarded-For header (comma-separated if through multiple proxies; first is original client)
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      const clientIp = raw.split(',')[0].trim();
      if (clientIp) {
        return cleanIp(clientIp);
      }
    }

    // 2. Check X-Real-IP header
    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      const raw = Array.isArray(realIp) ? realIp[0] : realIp;
      const clientIp = raw.trim();
      if (clientIp) {
        return cleanIp(clientIp);
      }
    }

    // 3. Fallback to Express req.ip (enabled when trust proxy is active)
    if (req.ip) {
      return cleanIp(req.ip);
    }

    // 4. Socket remote address
    if (req.socket?.remoteAddress) {
      return cleanIp(req.socket.remoteAddress);
    }

    return '127.0.0.1';
  },
);

function cleanIp(ip: string): string {
  // Strip IPv4-mapped IPv6 prefix (e.g., "::ffff:192.168.1.1" -> "192.168.1.1")
  return ip.replace(/^::ffff:/, '').trim();
}
