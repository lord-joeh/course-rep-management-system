import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { QueueName } from '../constants';
import { SmsJobData } from '../dto';

@Processor(QueueName.SMS)
export class SmsProcessor extends WorkerHost {
  private readonly logger = new Logger(SmsProcessor.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async process(job: Job<SmsJobData, any, string>): Promise<any> {
    const { to, message, userId } = job.data;
    this.logger.log(`Processing SMS job [${job.id}] for recipient [${to}] (User: ${userId || 'N/A'})`);

    const apiKey = this.configService.get<string>('ARKESEL_API_KEY');
    const senderId = this.configService.get<string>('ARKESEL_SENDER_ID', 'COURSE REP');
    const baseUrl = this.configService.get<string>(
      'ARKESEL_BASE_URL',
      'https://sms.arkesel.com/sms/api?action=send-sms&',
    );

    if (!apiKey) {
      this.logger.warn(`ARKESEL_API_KEY is not configured. Simulating SMS dispatch to [${to}] in mock mode.`);
      return { success: true, mocked: true, to, messageLength: message.length };
    }

    const formattedRecipient = this.formatRecipientPhone(to);

    try {
      let response: Response;
      let responseData: any;

      // Check if Arkesel V1 legacy endpoint is configured (GET request with query params)
      const isLegacyV1 = baseUrl.includes('/sms/api') || baseUrl.includes('action=send-sms');

      if (isLegacyV1) {
        const cleanBaseUrl = baseUrl.split('?')[0];
        const url = new URL(cleanBaseUrl.startsWith('http') ? cleanBaseUrl : `https://${cleanBaseUrl}`);
        url.searchParams.set('action', 'send-sms');
        url.searchParams.set('api_key', apiKey);
        url.searchParams.set('to', formattedRecipient);
        url.searchParams.set('from', senderId);
        url.searchParams.set('sms', message);

        response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        });

        responseData = await response.json().catch(() => ({}));

        if (!response.ok || (responseData?.code && responseData.code !== 'ok' && responseData.code !== '100')) {
          const errorMsg =
            responseData?.message || `Arkesel V1 API rejected dispatch with status code ${response.status}`;
          this.logger.error(`SMS dispatch failed: ${errorMsg}`);
          throw new Error(errorMsg);
        }
      } else {
        // Arkesel V2 standard endpoint (POST JSON)
        response = await fetch(baseUrl, {
          method: 'POST',
          headers: {
            'api-key': apiKey,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            sender: senderId,
            message,
            recipients: [formattedRecipient],
          }),
        });

        responseData = await response.json().catch(() => ({}));

        // Fallback: If POST returned 405 Method Not Allowed, fallback to Arkesel V1 GET
        if (
          response.status === 405 ||
          (responseData?.message && responseData.message.includes('The POST method is not supported'))
        ) {
          this.logger.warn(`POST method not supported on ${baseUrl}. Falling back to Arkesel V1 GET endpoint.`);
          const v1Url = new URL('https://sms.arkesel.com/sms/api');
          v1Url.searchParams.set('action', 'send-sms');
          v1Url.searchParams.set('api_key', apiKey);
          v1Url.searchParams.set('to', formattedRecipient);
          v1Url.searchParams.set('from', senderId);
          v1Url.searchParams.set('sms', message);

          response = await fetch(v1Url.toString(), {
            method: 'GET',
            headers: { Accept: 'application/json' },
          });

          responseData = await response.json().catch(() => ({}));

          if (!response.ok || (responseData?.code && responseData.code !== 'ok' && responseData.code !== '100')) {
            const errorMsg =
              responseData?.message || `Arkesel V1 fallback failed with status code ${response.status}`;
            this.logger.error(`SMS dispatch failed: ${errorMsg}`);
            throw new Error(errorMsg);
          }
        } else if (!response.ok || (responseData?.status && responseData.status !== 'success')) {
          const errorMsg =
            responseData?.message || `Arkesel API rejected dispatch with status code ${response.status}`;
          this.logger.error(`SMS dispatch failed: ${errorMsg}`);
          throw new Error(errorMsg);
        }
      }

      this.logger.log(`SMS job [${job.id}] dispatched successfully to [${to}]`);
      return { success: true, to, response: responseData };
    } catch (error: any) {
      this.logger.error(`SMS job [${job.id}] exception for [${to}]: ${error.message}`, error.stack);
      throw error;
    }
  }

  private formatRecipientPhone(phone: string): string {
    const cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.startsWith('0') && cleaned.length === 10) {
      return `233${cleaned.substring(1)}`;
    }
    return cleaned;
  }
}
