import { EmailJobType } from '../constants';

export interface EmailJobData {
  jobType: EmailJobType;
  to: string;
  name?: string;
  studentId?: string;
  resetToken?: string;
  groupName?: string;
  groupMembers?: Array<{ id: string; name: string; email: string }>;
  isAnonymous?: boolean;
  message?: string;
  subject?: string;
  metadata?: Record<string, any>;
}

