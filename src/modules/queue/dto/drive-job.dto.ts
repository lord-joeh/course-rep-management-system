import { DriveJobType } from "../constants";

export type DriveUploadType =
  | DriveJobType.UPLOAD_SLIDE_FILE
  | DriveJobType.UPLOAD_ASSIGNMENT_FILE
  | DriveJobType.UPLOAD_SUBMISSION_FILE;

export interface DriveUploadJobData {
  type: DriveUploadType;
  courseId: string;
  folderId?: string;
  fileName: string;
  mimeType: string;
  fileBufferBase64?: string;
  tempFilePath?: string;
  slideId?: string;
  assignmentId?: string;
  submissionId?: string;
  socketId?: string;
  userId?: string;
}

export interface DriveDeleteJobData {
  type: DriveJobType.DELETE_DRIVE_FILE;
  driveFileId: string;
  slideId?: string;
  assignmentId?: string;
  submissionId?: string;
  socketId?: string;
  userId?: string;
}

export type DriveJobData = DriveUploadJobData | DriveDeleteJobData;
