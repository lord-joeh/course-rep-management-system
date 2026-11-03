import { wrapEmailLayout } from './base.template';

export interface RegistrationSuccessParams {
  name: string;
  studentId: string;
  loginUrl: string;
}

export function renderRegistrationSuccessTemplate(params: RegistrationSuccessParams): string {
  const innerContent = `
    <p>Dear <strong>${params.name}</strong>,</p>
    <p>Welcome aboard! Your registration with Student ID <strong>${params.studentId}</strong> to the Course Rep Management System was successful.</p>
    <p>You can now access your enrolled courses, communicate with your course representatives, access uploaded slides, submit assignments, and stay updated on important academic announcements.</p>
    <div style="margin: 25px 0;">
      <a href="${params.loginUrl}" style="display: inline-block; padding: 12px 24px; font-size: 15px; font-weight: bold; color: #ffffff; background-color: #3182ce; text-decoration: none; border-radius: 6px;">
        Click Here to Login
      </a>
    </div>
    <p style="font-size: 14px; color: #718096;">If the button above does not work, copy and paste this link into your browser: <br/><a href="${params.loginUrl}" style="color: #3182ce;">${params.loginUrl}</a></p>
  `;
  return wrapEmailLayout('Registration Successful', innerContent);
}

