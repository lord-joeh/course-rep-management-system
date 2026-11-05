export const emailHTMLFooter = `
  <p style="margin-top: 30px; font-size: 13px; color: #666; border-top: 1px solid #eee; padding-top: 15px;">
    Best regards,<br/>
    <strong>Course Rep Management Team</strong><br/>
    <small style="color: #999;"><a href='https://mensah.dev-joseph.me'>Software developed by STYLES</a></small>
  </p>
`;

export function wrapEmailLayout(title: string, innerContent: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 10px; color: #1a202c; background-color: #ffffff;">
      <div style="margin-bottom: 20px; border-bottom: 2px solid #3182ce; padding-bottom: 10px;">
        <h2 style="color: #2b6cb0; margin: 0; font-size: 22px;">${title}</h2>
      </div>
      <div style="font-size: 15px; line-height: 1.6; color: #2d3748;">
        ${innerContent}
      </div>
      ${emailHTMLFooter}
    </div>
  `.trim();
}

