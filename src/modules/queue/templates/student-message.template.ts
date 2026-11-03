import { wrapEmailLayout } from './base.template';

export interface StudentMessageParams {
  name: string;
  messageContent: string;
  subject?: string;
}

export function renderStudentMessageTemplate(params: StudentMessageParams): string {
  const innerContent = `
    <p>Dear <strong>${params.name}</strong>,</p>
    <p>You have received a direct message from your Course Representative:</p>
    <div style="background-color: #f7fafc; border-left: 4px solid #4299e1; padding: 15px 18px; margin: 20px 0; border-radius: 4px; font-size: 15px; color: #2d3748; line-height: 1.6;">
      ${params.messageContent}
    </div>
    <p style="font-size: 13px; color: #718096;">If you have any questions, you can reply directly or contact your Course Rep in class.</p>
  `;
  return wrapEmailLayout(params.subject || 'Notice from Course Representative', innerContent);
}

