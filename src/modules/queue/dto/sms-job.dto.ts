export interface SmsJobData {
  to: string;
  message: string;
  socketId?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

