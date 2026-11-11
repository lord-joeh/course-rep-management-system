export enum QueueName {
  EMAIL = 'email-queue',
  SMS = 'sms-queue',
  DRIVE_SYNC = 'drive-sync-queue',
  ATTENDANCE = 'attendance-queue',
  ENROLLMENT = 'enrollment-queue',
}

export enum EmailJobType {
  REGISTRATION_SUCCESS = 'registration-success',
  PASSWORD_RESET = 'password-reset',
  PASSWORD_CHANGED = 'password-changed',
  GROUP_ASSIGNMENT = 'group-assignment',
  FEEDBACK_RECEIVED = 'feedback-received',
  STUDENT_MESSAGE = 'student-message',
}

export enum DriveJobType {
  UPLOAD_SLIDE_FILE = 'upload-slide-file',
  UPLOAD_ASSIGNMENT_FILE = 'upload-assignment-file',
  UPLOAD_SUBMISSION_FILE = 'upload-submission-file',
  DELETE_DRIVE_FILE = 'delete-drive-file',
}

export enum AttendanceJobType {
  INITIALIZE_ROSTER = 'initialize-roster',
}

export enum EnrollmentJobType {
  ENROLL_STUDENT_ALL_COURSES = 'enroll-student-all-courses',
  ENROLL_ALL_STUDENTS_COURSE = 'enroll-all-students-course',
}

