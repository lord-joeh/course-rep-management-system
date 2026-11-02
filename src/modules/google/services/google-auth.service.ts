import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { google, Auth } from 'googleapis';
import * as crypto from 'crypto';

type OAuth2Client = InstanceType<typeof Auth.OAuth2Client>;

import { GoogleToken } from '../entities/google-token.entity';
import { EncryptionService } from './encryption.service';
import { CacheService } from '../../redis/cache.service';
import { CACHE_TTL } from '../../../common/constants/cache.constants';

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly userId: string;
  private readonly scopes = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.file',
  ];

  constructor(
    @InjectRepository(GoogleToken)
    private readonly googleTokenRepository: Repository<GoogleToken>,
    private readonly encryptionService: EncryptionService,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
  ) {
    this.clientId =
      this.configService.get<string>('GOOGLE_CLIENT_ID') ||
      'mock_google_client_id';

    this.clientSecret =
      this.configService.get<string>('GOOGLE_CLIENT_SECRET') ||
      'mock_google_client_secret';

    this.redirectUri =
      this.configService.get<string>('GOOGLE_REDIRECT_URI') ||
      'http://localhost:5000/api/google/callback';

    this.userId =
      this.configService.get<string>('USER_ID') ||
      'system_default_rep';
  }

  /**
   * Generate Google OAuth2 authorization URL with a Redis-backed CSRF state token.
   */
  async generateAuthUrl(repId: string): Promise<{ authUrl: string; state: string }> {
    const state = crypto.randomBytes(32).toString('hex');
    const stateKey = `cr:google:oauth:state:${state}`;

    // Store state in Redis with 15-minute TTL to prevent CSRF / injection
    await this.cacheService.set(
      stateKey,
      { repId, createdAt: Date.now() },
      CACHE_TTL.FIFTEEN_MINUTES,
    );

    const client = new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      this.redirectUri,
    );

    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      scope: this.scopes,
      prompt: 'consent',
      state,
    });

    return { authUrl, state };
  }

  /**
   * Handle OAuth2 callback, validate state, and persist AES-256-GCM encrypted tokens.
   */
  async handleCallback(
    code: string,
    state: string,
  ): Promise<{ message: string; connected: boolean }> {
    if (!state) {
      throw new BadRequestException('State parameter is missing');
    }

    const stateKey = `cr:google:oauth:state:${state}`;
    const stateData = await this.cacheService.get(stateKey);

    if (!stateData) {
      throw new BadRequestException(
        'Invalid or expired OAuth state parameter. Please initiate connection again.',
      );
    }

    // Single-use: Atomically invalidate state in Redis
    await this.cacheService.del(stateKey);

    const client = new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      this.redirectUri,
    );

    let tokens: any;
    try {
      const response = await client.getToken(code);
      tokens = response.tokens;
    } catch (err: any) {
      this.logger.error(`Failed to exchange authorization code: ${err.message}`);
      throw new BadRequestException(`Google token exchange failed: ${err.message}`);
    }

    // Encrypt secrets before storing in PostgreSQL
    const encryptedClientSecret = this.encryptionService.encrypt(this.clientSecret);
    const encryptedRefreshToken = this.encryptionService.encrypt(tokens.refresh_token || '');
    const encryptedAccessToken = tokens.access_token
      ? this.encryptionService.encrypt(tokens.access_token)
      : null;

    const existingRecord = await this.googleTokenRepository.findOne({
      where: { userId: this.userId },
    });

    const now = new Date();
    if (existingRecord) {
      existingRecord.clientId = this.clientId;
      existingRecord.clientSecret = encryptedClientSecret;
      if (tokens.refresh_token) {
        existingRecord.refreshToken = encryptedRefreshToken;
      }
      existingRecord.accessToken = encryptedAccessToken;
      existingRecord.expiryDate = tokens.expiry_date ? Number(tokens.expiry_date) : null;
      existingRecord.updatedAt = now;
      await this.googleTokenRepository.save(existingRecord);
    } else {
      const newRecord = this.googleTokenRepository.create({
        userId: this.userId,
        type: 'authorized_user',
        clientId: this.clientId,
        clientSecret: encryptedClientSecret,
        refreshToken: encryptedRefreshToken,
        accessToken: encryptedAccessToken,
        expiryDate: tokens.expiry_date ? Number(tokens.expiry_date) : null,
        createdAt: now,
        updatedAt: now,
      });
      await this.googleTokenRepository.save(newRecord);
    }

    // Invalidate cached status
    await this.cacheService.del('cr:google:status');

    return {
      message: 'Google account connected successfully',
      connected: true,
    };
  }

  /**
   * Decrypt credentials and obtain an authenticated OAuth2Client, automatically refreshing expiring tokens.
   */
  async getAuthorizedClient(): Promise<OAuth2Client> {
    const record = await this.googleTokenRepository.findOne({
      where: { userId: this.userId },
    });

    if (!record || !record.refreshToken) {
      throw new UnauthorizedException(
        'Google Drive account is not connected. Please connect Google Drive first.',
      );
    }

    const decryptedSecret = this.encryptionService.decrypt(record.clientSecret);
    const decryptedRefreshToken = this.encryptionService.decrypt(record.refreshToken);
    const decryptedAccessToken = record.accessToken
      ? this.encryptionService.decrypt(record.accessToken)
      : undefined;

    const client = new google.auth.OAuth2(
      record.clientId,
      decryptedSecret,
      this.redirectUri,
    );

    client.setCredentials({
      refresh_token: decryptedRefreshToken,
      access_token: decryptedAccessToken,
      expiry_date: record.expiryDate ? Number(record.expiryDate) : undefined,
    });

    // Auto-refresh expiring token
    try {
      const isExpiring = record.expiryDate
        ? Date.now() >= Number(record.expiryDate) - 60000
        : false;

      if (isExpiring) {
        const { credentials } = await client.refreshAccessToken();
        const encryptedNewAccess = credentials.access_token
          ? this.encryptionService.encrypt(credentials.access_token)
          : null;

        await this.googleTokenRepository.update(this.userId, {
          accessToken: encryptedNewAccess,
          expiryDate: credentials.expiry_date ? Number(credentials.expiry_date) : null,
          updatedAt: new Date(),
        });

        client.setCredentials(credentials);
      }
    } catch (err: any) {
      this.logger.warn(`Could not refresh Google token: ${err.message}`);
    }

    return client;
  }

  /**
   * Revoke Google OAuth access and delete persisted token record.
   */
  async revokeAccess(): Promise<{ message: string }> {
    try {
      const client = await this.getAuthorizedClient();
      await client.revokeCredentials();
    } catch (err: any) {
      this.logger.warn(`Revocation call to Google API failed: ${err.message}`);
    }

    await this.googleTokenRepository.delete({ userId: this.userId });
    await this.cacheService.del('cr:google:status');

    return { message: 'Google account disconnected successfully' };
  }

  /**
   * Check connection and token status.
   */
  async getStatus(): Promise<{ connected: boolean; expiryDate: number | null }> {
    const record = await this.googleTokenRepository.findOne({
      where: { userId: this.userId },
    });

    return {
      connected: Boolean(record && record.refreshToken),
      expiryDate: record?.expiryDate ? Number(record.expiryDate) : null,
    };
  }
}
