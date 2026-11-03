import { wrapEmailLayout } from './base.template';

export interface FeedbackReceivedParams {
  name: string;
}

export function renderFeedbackReceivedTemplate(params: FeedbackReceivedParams): string {
  const innerContent = `
    <p>Dear <strong>${params.name}</strong>,</p>
    <p>Thank you for submitting your suggestion/feedback through the Course Rep Management System.</p>
    <p>We have successfully received your submission. Your Course Representative team will review your comments and take appropriate action to improve our academic environment.</p>
    <div style="background-color: #f0fff4; border-left: 4px solid #38a169; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; font-size: 14px; color: #276749;">
        Student feedback is vital for course coordination and lecturer engagement. Thank you for making our cohort stronger!
      </p>
    </div>
  `;
  return wrapEmailLayout("We've Received Your Feedback", innerContent);
}

