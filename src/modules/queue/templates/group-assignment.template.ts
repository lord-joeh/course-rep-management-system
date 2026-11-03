import { wrapEmailLayout } from './base.template';

export interface GroupMemberItem {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

export interface GroupAssignmentParams {
  studentName: string;
  groupName: string;
  leaderName: string;
  members: GroupMemberItem[];
}

export function renderGroupAssignmentTemplate(params: GroupAssignmentParams): string {
  const tableRows = params.members
    .map(
      (m, idx) => `
      <tr style="border-bottom: 1px solid #edf2f7;">
        <td style="padding: 10px; font-size: 14px;">${idx + 1}</td>
        <td style="padding: 10px; font-size: 14px; font-weight: 500;">${m.name}</td>
        <td style="padding: 10px; font-size: 14px; font-family: monospace;">${m.id}</td>
        <td style="padding: 10px; font-size: 14px;">
          <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 12px; font-weight: bold; ${
            m.role === 'Leader'
              ? 'background-color: #feebc8; color: #7b341e;'
              : 'background-color: #edf2f7; color: #4a5568;'
          }">
            ${m.role || 'Member'}
          </span>
        </td>
      </tr>
    `,
    )
    .join('');

  const innerContent = `
    <p>Dear <strong>${params.studentName}</strong>,</p>
    <p>You have been assigned to academic group <strong>${params.groupName}</strong>.</p>
    <p><strong>Designated Group Leader:</strong> ${params.leaderName}</p>
    
    <h3 style="color: #2b6cb0; margin-top: 25px; margin-bottom: 12px; font-size: 17px;">Group Roster</h3>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <thead>
        <tr style="background-color: #f7fafc; border-bottom: 2px solid #e2e8f0; text-align: left;">
          <th style="padding: 10px; font-size: 13px; color: #4a5568;">#</th>
          <th style="padding: 10px; font-size: 13px; color: #4a5568;">Name</th>
          <th style="padding: 10px; font-size: 13px; color: #4a5568;">Student ID</th>
          <th style="padding: 10px; font-size: 13px; color: #4a5568;">Role</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>

    <p style="font-size: 14px; color: #4a5568;">Please collaborate with your peers and group leader to organize upcoming project milestones.</p>
  `;

  return wrapEmailLayout(`Group Assignment: ${params.groupName}`, innerContent);
}

