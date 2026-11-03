import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Job } from 'bullmq';
import { QueueName, AttendanceJobType } from '../constants';
import { AttendanceJobData, AttendanceRosterJobData } from '../dto';
import { Attendance, AttendanceStatus } from '../../attendance/entities/attendance.entity';
import { CourseStudent } from '../../course/entities/course-student.entity';
import { StudentStatus } from '../../student/entities/student.entity';

@Processor(QueueName.ATTENDANCE)
export class AttendanceProcessor extends WorkerHost {
  private readonly logger = new Logger(AttendanceProcessor.name);

  constructor(
    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,
    @InjectRepository(CourseStudent)
    private readonly courseStudentRepository: Repository<CourseStudent>,
  ) {
    super();
  }

  async process(job: Job<AttendanceJobData, any, string>): Promise<any> {
    const data = job.data;
    this.logger.log(`Processing attendance job [${job.id}] type [${data.type}]`);

    switch (data.type) {
      case AttendanceJobType.INITIALIZE_ROSTER:
        return this.handleInitializeRoster(job.id, data as AttendanceRosterJobData);

      default:
        throw new Error(`Unsupported attendance job type: ${(data as any).type}`);
    }
  }

  private async handleInitializeRoster(
    jobId: string | undefined,
    data: AttendanceRosterJobData,
  ): Promise<any> {
    const { sessionId, courseId, date } = data;
    this.logger.log(`Initializing attendance roster for session [${sessionId}] in course [${courseId}]`);

    try {
      // Find all enrolled students
      const enrollments = await this.courseStudentRepository.find({
        where: { courseId },
        relations: ['student'],
      });

      const activeStudents = enrollments.filter(
        (e) => e.student && e.student.status === StudentStatus.ACTIVE,
      );

      if (!activeStudents.length) {
        this.logger.warn(`No active enrolled students found for course [${courseId}]`);
        return { success: true, sessionId, recordsCreated: 0 };
      }

      // Check if records already exist for this instance
      const existingRecords = await this.attendanceRepository.find({
        where: {
          instanceId: sessionId,
          studentId: In(activeStudents.map((e) => e.studentId)),
        },
        select: ['studentId'],
      });

      const existingSet = new Set(existingRecords.map((r) => r.studentId));
      const targetDate = new Date(date);

      const recordsToCreate = activeStudents
        .filter((e) => !existingSet.has(e.studentId))
        .map((e) => {
          const record = this.attendanceRepository.create({
            instanceId: sessionId,
            courseId,
            date: targetDate,
            studentId: e.studentId,
            status: AttendanceStatus.ABSENT,
          });
          return record;
        });

      if (!recordsToCreate.length) {
        this.logger.log(`All enrolled students already have roster entries for session [${sessionId}]`);
        return { success: true, sessionId, recordsCreated: 0 };
      }

      // Chunk batch insertion in groups of 100 for memory and lock safety
      const chunkSize = 100;
      let totalCreated = 0;

      for (let i = 0; i < recordsToCreate.length; i += chunkSize) {
        const chunk = recordsToCreate.slice(i, i + chunkSize);
        await this.attendanceRepository.save(chunk);
        totalCreated += chunk.length;
      }

      this.logger.log(
        `Attendance roster initialized successfully for session [${sessionId}]: created ${totalCreated} records`,
      );

      return {
        success: true,
        sessionId,
        courseId,
        recordsCreated: totalCreated,
      };
    } catch (error: any) {
      this.logger.error(`Attendance roster job [${jobId}] failed: ${error.message}`, error.stack);
      throw error;
    }
  }
}

