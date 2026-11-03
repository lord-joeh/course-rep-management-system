import { wrapEmailLayout } from './base.template';

export interface PasswordChangedParams {
  name?: string;
  changedAt?: string;
}

export function renderPasswordChangedTemplate(params: PasswordChangedParams): string {
  const greeting = params.name ? `Dear <strong>${params.name}</strong>,` : 'Hello,';
  const timestamp = params.changedAt || new Date().toUTCString();
  const innerContent = `
    <p>${greeting}</p>
    <p>This is confirmation that the password for your Course Rep Management account was successfully updated on <strong>${timestamp}</strong>.</p>
    <p>All active sessions and refresh tokens on other devices have been securely invalidated.</p>
    <div style="background-color: #ebf8ff; border-left: 4px solid #3182ce; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; font-size: 14px; color: #2b6cb0;">
        If you did not perform this action, please contact your Course Representative or Administrator immediately to lock your account.
      </p>
    </div>
  `;
  return wrapEmailLayout('Password Successfully Changed', innerContent);
}

