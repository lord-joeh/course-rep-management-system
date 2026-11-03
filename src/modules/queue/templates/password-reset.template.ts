import { wrapEmailLayout } from './base.template';

export interface PasswordResetParams {
  name?: string;
  resetUrl: string;
  expiryMinutes?: number;
}

export function renderPasswordResetTemplate(params: PasswordResetParams): string {
  const expiry = params.expiryMinutes || 15;
  const greeting = params.name ? `Dear <strong>${params.name}</strong>,` : 'Hello,';
  const innerContent = `
    <p>${greeting}</p>
    <p>We received a request to reset your Course Rep Management System account password.</p>
    <p style="color: #c53030; font-weight: bold; font-size: 14px;">
      For security reasons, this reset link will expire in ${expiry} minutes.
    </p>
    <div style="margin: 25px 0;">
      <a href="${params.resetUrl}" style="display: inline-block; padding: 12px 24px; font-size: 15px; font-weight: bold; color: #ffffff; background-color: #e53e3e; text-decoration: none; border-radius: 6px;">
        Reset Password
      </a>
    </div>
    <p style="font-size: 14px; color: #718096;">If you did not initiate this password reset request, please ignore this email or notify your Course Representative immediately. Your password will remain unchanged.</p>
  `;
  return wrapEmailLayout('Password Reset Request', innerContent);
}

