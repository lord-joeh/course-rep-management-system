import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';

export interface GoogleTokenPayload {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  emailVerified: boolean;
}

@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);
  private readonly clientId: string;

  constructor(private readonly configService: ConfigService) {
    this.clientId =
      this.configService.get<string>('GOOGLE_CLIENT_ID') ||
      this.configService.get<string>('google.clientId') ||
      'mock_google_client_id';
  }

  /**
   * Cryptographically verify Google Identity Services ID token.
   */
  async verifyIdToken(idToken: string): Promise<GoogleTokenPayload> {
    if (!idToken) {
      throw new UnauthorizedException('Google ID token is required');
    }

    // Support mock token for test environments
    if (
      (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') &&
      idToken.startsWith('mock-google-token')
    ) {
      return {
        sub: 'mock-google-sub-12345',
        email: 'test.oauth.student@university.edu',
        name: 'Mock OAuth Student',
        picture: 'https://lh3.googleusercontent.com/mock-avatar.png',
        emailVerified: true,
      };
    }

    try {
      const oauth2Client = new google.auth.OAuth2(this.clientId);
      const ticket = await oauth2Client.verifyIdToken({
        idToken,
        audience: this.clientId,
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.sub || !payload.email) {
        throw new UnauthorizedException('Invalid Google ID token payload');
      }

      return {
        sub: payload.sub,
        email: payload.email.toLowerCase().trim(),
        name: payload.name,
        picture: payload.picture,
        emailVerified: Boolean(payload.email_verified),
      };
    } catch (err: any) {
      this.logger.error(`Google token verification failed: ${err.message}`);
      throw new UnauthorizedException(
        err.message?.includes('expired')
          ? 'Google sign-in token has expired'
          : 'Invalid or forged Google token',
      );
    }
  }
}

