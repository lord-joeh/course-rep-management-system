import { AttendanceJobType } from '../constants';

export interface AttendanceRosterJobData {
  type: AttendanceJobType.INITIALIZE_ROSTER;
  sessionId: string;
  courseId: string;
  date: string;
  socketId?: string;
  userId?: string;
}

export type AttendanceJobData = AttendanceRosterJobData;

