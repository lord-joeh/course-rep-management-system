import { EnrollmentJobType } from '../constants';

export interface EnrollStudentAllCoursesJobData {
  type: EnrollmentJobType.ENROLL_STUDENT_ALL_COURSES;
  studentId: string;
}

export interface EnrollAllStudentsCourseJobData {
  type: EnrollmentJobType.ENROLL_ALL_STUDENTS_COURSE;
  courseId: string;
}

export type EnrollmentJobData =
  | EnrollStudentAllCoursesJobData
  | EnrollAllStudentsCourseJobData;

