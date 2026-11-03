import { DriveJobType } from '../constants';

export interface DriveUploadJobData {
  type: DriveJobType.UPLOAD_SLIDE_FILE | DriveJobType.UPLOAD_ASSIGNMENT_FILE;
  courseId: string;
  folderId?: string;
  fileName: string;
  mimeType: string;
  fileBufferBase64?: string;
  tempFilePath?: string;
  slideId?: string;
  assignmentId?: string;
  socketId?: string;
  userId?: string;
}

export interface DriveDeleteJobData {
  type: DriveJobType.DELETE_DRIVE_FILE;
  driveFileId: string;
  slideId?: string;
  assignmentId?: string;
  socketId?: string;
  userId?: string;
}

export type DriveJobData = DriveUploadJobData | DriveDeleteJobData;

