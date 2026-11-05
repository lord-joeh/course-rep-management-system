import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import {
  getMessaging,
  Message,
  MulticastMessage,
  Messaging,
} from 'firebase-admin/messaging';

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface MulticastResult {
  successCount: number;
  failureCount: number;
  invalidTokens: string[];
}

@Injectable()
export class FirebaseMessagingService {
  private readonly logger = new Logger(FirebaseMessagingService.name);
  private firebaseApp: App | null = null;
  private messagingClient: Messaging | null = null;
  private isConfigured = false;

  constructor(private readonly configService: ConfigService) {
    this.initializeFirebase();
  }

  private initializeFirebase(): void {
    try {
      const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = this.configService.get<string>(
        'FIREBASE_CLIENT_EMAIL',
      );
      const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');

      if (projectId && clientEmail && privateKey) {
        const apps = getApps();
        if (!apps.length) {
          this.firebaseApp = initializeApp({
            credential: cert({
              projectId,
              clientEmail,
              privateKey: privateKey.replace(/\\n/g, '\n'),
            }),
          });
        } else {
          this.firebaseApp = getApp();
        }
        this.messagingClient = getMessaging(this.firebaseApp);
        this.isConfigured = true;
        this.logger.log('Firebase Admin SDK initialized successfully');
      } else {
        this.logger.warn(
          'Firebase credentials not detected; running in mock/log-only mode',
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to initialize Firebase Admin SDK: ${error?.message || error}`,
        error?.stack,
      );
      this.isConfigured = false;
    }
  }

  /**
   * Check whether Firebase Admin SDK is active.
   */
  public isReady(): boolean {
    return this.isConfigured && this.messagingClient !== null;
  }

  /**
   * Send push notification to a single device token.
   */
  async sendToToken(
    token: string,
    payload: PushNotificationPayload,
  ): Promise<string | null> {
    if (!token) return null;

    if (!this.isReady()) {
      this.logger.log(
        `[MOCK FCM] Sent to token ${token.substring(0, 10)}...: "${payload.title}"`,
      );
      return 'mock-message-id';
    }

    try {
      const message: Message = {
        token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data,
      };

      const messageId = await this.messagingClient!.send(message);
      this.logger.log(`FCM message successfully sent: ${messageId}`);
      return messageId;
    } catch (error: any) {
      this.logger.error(
        `Failed to send FCM message to token: ${error?.message || error}`,
      );
      return null;
    }
  }

  /**
   * Send multicast push notification to multiple device tokens.
   * Identifies invalid/stale registration tokens for automatic pruning.
   */
  async sendMulticast(
    tokens: string[],
    payload: PushNotificationPayload,
  ): Promise<MulticastResult> {
    if (!tokens || tokens.length === 0) {
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    if (!this.isReady()) {
      this.logger.log(
        `[MOCK FCM MULTICAST] Broadcast to ${tokens.length} tokens: "${payload.title}"`,
      );
      return {
        successCount: tokens.length,
        failureCount: 0,
        invalidTokens: [],
      };
    }

    try {
      const message: MulticastMessage = {
        tokens,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data,
      };

      const response = await this.messagingClient!.sendEachForMulticast(message);

      const invalidTokens: string[] = [];
      response.responses.forEach((resp: any, index: number) => {
        if (!resp.success && resp.error) {
          const errorCode = resp.error.code;
          this.logger.warn(
            `FCM delivery failure for token [${tokens[index]?.substring(0, 20)}...]: ${errorCode} - ${resp.error.message || 'delivery failed'}`,
          );
          if (
            errorCode === 'messaging/invalid-registration-token' ||
            errorCode === 'messaging/registration-token-not-registered' ||
            errorCode === 'messaging/invalid-argument' ||
            tokens[index]?.startsWith('dev-fcm-token-')
          ) {
            invalidTokens.push(tokens[index]);
          }
        } else if (tokens[index]?.startsWith('dev-fcm-token-')) {
          invalidTokens.push(tokens[index]);
        }
      });

      this.logger.log(
        `FCM multicast completed: ${response.successCount} succeeded, ${response.failureCount} failed`,
      );

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
        invalidTokens,
      };
    } catch (error: any) {
      this.logger.error(
        `FCM multicast dispatch failed: ${error?.message || error}`,
        error?.stack,
      );
      return {
        successCount: 0,
        failureCount: tokens.length,
        invalidTokens: [],
      };
    }
  }
}
