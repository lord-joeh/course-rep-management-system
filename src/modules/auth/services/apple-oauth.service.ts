import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface AppleTokenPayload {
  sub: string;
  email?: string;
  emailVerified?: boolean;
}

interface AppleJwk {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

@Injectable()
export class AppleOAuthService {
  private readonly logger = new Logger(AppleOAuthService.name);
  private readonly clientId: string;
  private jwksCache: { keys: AppleJwk[]; fetchedAt: number } | null = null;
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor(private readonly configService: ConfigService) {
    this.clientId =
      this.configService.get<string>('APPLE_CLIENT_ID') ||
      this.configService.get<string>('apple.clientId') ||
      'com.courserep.app';
  }

  /**
   * Cryptographically verify Apple Identity Token using Apple JWKS public keys.
   */
  async verifyIdentityToken(idToken: string): Promise<AppleTokenPayload> {
    if (!idToken) {
      throw new UnauthorizedException('Apple identity token is required');
    }

    // Support mock token for test and development environments
    if (idToken.startsWith('mock-apple-token')) {
      if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
        return {
          sub: 'mock-apple-sub-98765',
          email: 'mock.apple.student@privaterelay.appleid.com',
          emailVerified: true,
        };
      }
      throw new UnauthorizedException(
        'Mock Apple authentication tokens are disabled in production mode',
      );
    }

    try {
      const parts = idToken.split('.');
      if (parts.length !== 3) {
        throw new UnauthorizedException('Malformed Apple identity token');
      }

      const [headerB64, payloadB64, signatureB64] = parts;
      const header = JSON.parse(
        Buffer.from(headerB64, 'base64url').toString('utf8'),
      );
      const payload = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf8'),
      );

      // Verify claims
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        throw new UnauthorizedException('Apple sign-in token has expired');
      }

      if (payload.iss !== 'https://appleid.apple.com') {
        throw new UnauthorizedException('Invalid Apple token issuer');
      }

      if (payload.aud !== this.clientId && process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('Apple token audience mismatch');
      }

      if (!payload.sub) {
        throw new UnauthorizedException('Apple token missing subject identifier');
      }

      // Fetch matching public key from Apple JWKS
      const key = await this.getApplePublicKey(header.kid);
      if (!key) {
        throw new UnauthorizedException('Apple public key not found for token kid');
      }

      // Verify RSA signature
      const publicKey = crypto.createPublicKey({
        key: {
          kty: key.kty,
          n: key.n,
          e: key.e,
        },
        format: 'jwk',
      });

      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(`${headerB64}.${payloadB64}`);
      const isSignatureValid = verifier.verify(
        publicKey,
        Buffer.from(signatureB64, 'base64url'),
      );

      if (!isSignatureValid) {
        throw new UnauthorizedException('Invalid Apple token signature');
      }

      return {
        sub: payload.sub,
        email: payload.email ? payload.email.toLowerCase().trim() : undefined,
        emailVerified:
          payload.email_verified === true || payload.email_verified === 'true',
      };
    } catch (err: any) {
      this.logger.error(`Apple token verification failed: ${err.message}`);
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException('Invalid or forged Apple identity token');
    }
  }

  /**
   * Retrieve Apple JWKS key by Key ID (kid) with caching.
   */
  private async getApplePublicKey(kid: string): Promise<AppleJwk | undefined> {
    const now = Date.now();
    if (!this.jwksCache || now - this.jwksCache.fetchedAt > this.CACHE_TTL_MS) {
      await this.refreshJwks();
    }

    let found = this.jwksCache?.keys.find((k) => k.kid === kid);
    if (!found) {
      // Refresh cache in case Apple recently rotated keys
      await this.refreshJwks();
      found = this.jwksCache?.keys.find((k) => k.kid === kid);
    }

    return found;
  }

  private async refreshJwks(): Promise<void> {
    try {
      const response = await fetch('https://appleid.apple.com/auth/keys', {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Apple JWKS returned HTTP ${response.status}`);
      }
      const data = (await response.json()) as { keys: AppleJwk[] };
      this.jwksCache = {
        keys: data.keys,
        fetchedAt: Date.now(),
      };
    } catch (err: any) {
      this.logger.warn(`Failed to fetch live Apple JWKS keys: ${err.message}`);
      if (!this.jwksCache) {
        this.jwksCache = { keys: [], fetchedAt: Date.now() };
      }
    }
  }
}

