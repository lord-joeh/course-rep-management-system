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
    const senderId = this.configService.get<string>('ARKESEL_SENDER_ID', 'CourseRep');
    const baseUrl = this.configService.get<string>(
      'ARKESEL_BASE_URL',
      'https://sms.arkesel.com/api/v2/sms/send',
    );

    if (!apiKey) {
      this.logger.warn(`ARKESEL_API_KEY is not configured. Simulating SMS dispatch to [${to}] in mock mode.`);
      return { success: true, mocked: true, to, messageLength: message.length };
    }

    const formattedRecipient = this.formatRecipientPhone(to);

    try {
      const response = await fetch(baseUrl, {
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

      const responseData: any = await response.json();

      if (!response.ok || (responseData?.status && responseData.status !== 'success')) {
        const errorMsg =
          responseData?.message || `Arkesel API rejected dispatch with status code ${response.status}`;
        this.logger.error(`SMS dispatch failed: ${errorMsg}`);
        throw new Error(errorMsg);
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

