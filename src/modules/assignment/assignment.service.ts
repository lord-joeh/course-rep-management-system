import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Readable } from 'stream';
import { Assignment } from './entities/assignment.entity';
import { AssignmentSubmission } from './entities/assignment-submission.entity';
import { Course } from '../course/entities/course.entity';
import { Student } from '../student/entities/student.entity';
import { GoogleDriveService, DriveDownloadResult } from '../google/services/google-drive.service';
import { CacheService } from '../redis/cache.service';
import { QueueService } from '../queue/queue.service';
import { NotificationDispatcherService } from '../notification/services/notification-dispatcher.service';
import { DriveJobType } from '../queue/constants';
import {
  CreateAssignmentDto,
  UpdateAssignmentDto,
  SubmitAssignmentDto,
  AssignmentQueryDto,
  StudentSubmissionsQueryDto,
} from './dto';
import { PaginatedResult, PaginationQueryDto } from '../../common/pagination';
import { UserRole } from '../../common/decorators/roles.decorator';

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);

  constructor(
    @InjectRepository(Assignment)
    private readonly assignmentRepository: Repository<Assignment>,
    @InjectRepository(AssignmentSubmission)
    private readonly submissionRepository: Repository<AssignmentSubmission>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    private readonly googleDriveService: GoogleDriveService,
    private readonly cacheService: CacheService,
    private readonly queueService: QueueService,
    private readonly notificationDispatcher: NotificationDispatcherService,
  ) {}

  /**
   * Create a new course assignment with dedicated Drive folder and optional brief file.
   */
  async createAssignment(
    dto: CreateAssignmentDto,
    file?: Express.Multer.File,
    creatorId?: string,
  ): Promise<Assignment> {
    const course = await this.courseRepository.findOne({
      where: { id: dto.courseId },
    });
    if (!course) {
      throw new NotFoundException(`Course "${dto.courseId}" not found`);
    }

    const deadline = new Date(dto.deadline);
    if (isNaN(deadline.getTime()) || deadline <= new Date()) {
      throw new BadRequestException('Deadline must be a valid future date and time');
    }

    // Ensure parent course materials/slides folder exists on Google Drive
    let parentFolderId = course.slidesFolderId;
    if (!parentFolderId) {
      const courseFolder = await this.googleDriveService.createFolder(
        `${course.name || course.id} Materials`,
      );
      course.slidesFolderId = courseFolder.id;
      await this.courseRepository.save(course);
      parentFolderId = courseFolder.id;
    }

    // Create a dedicated Google Drive folder for submissions nested under the course folder
    const folderName = `${course.name || course.id} ${dto.title} Submissions`;
    const driveFolder = await this.googleDriveService.createFolder(
      folderName,
      parentFolderId || undefined,
    );

    const assignment = this.assignmentRepository.create({
      title: dto.title,
      description: dto.description,
      courseId: dto.courseId,
      deadline,
      submissionFolderId: driveFolder.id,
      fileId: file ? 'pending' : null,
      fileName: file ? file.originalname : null,
    });

    const saved = await this.assignmentRepository.save(assignment);

    // Offload specification file upload to BullMQ background worker
    if (file) {
      await this.queueService.uploadToDrive({
        type: DriveJobType.UPLOAD_ASSIGNMENT_FILE,
        courseId: dto.courseId,
        folderId: driveFolder.id,
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileBufferBase64: file.buffer.toString('base64'),
        assignmentId: saved.id,
      });
    }

    await this.cacheService.scanAndInvalidate(`cr:assignments:course:${dto.courseId}:*`);

    // Dispatch centralized notification across in-app and push channels
    await this.notificationDispatcher.dispatchAssignmentCreated({
      courseId: dto.courseId,
      courseName: course.name,
      assignment: saved,
      creatorId,
    });

    return saved;
  }

  /**
   * Update assignment metadata.
   */
  async updateAssignment(id: string, dto: UpdateAssignmentDto): Promise<Assignment> {
    const assignment = await this.assignmentRepository.findOne({ where: { id } });
    if (!assignment) {
      throw new NotFoundException(`Assignment "${id}" not found`);
    }

    if (dto.deadline !== undefined) {
      const deadline = new Date(dto.deadline);
      if (isNaN(deadline.getTime()) || deadline <= new Date()) {
        throw new BadRequestException('Deadline must be a valid future date and time');
      }
      assignment.deadline = deadline;
    }

    if (dto.title !== undefined) {
      assignment.title = dto.title;
    }

    if (dto.description !== undefined) {
      assignment.description = dto.description;
    }

    const updated = await this.assignmentRepository.save(assignment);
    await this.cacheService.scanAndInvalidate(`cr:assignments:course:${assignment.courseId}:*`);
    await this.cacheService.del(`cr:assignment:${id}`);

    return updated;
  }

  /**
   * Submit an assignment solution with automatic prior file cleanup on resubmission.
   */
  async submitAssignment(
    dto: SubmitAssignmentDto,
    studentId: string,
    file?: Express.Multer.File,
  ): Promise<AssignmentSubmission> {
    if (!file) {
      throw new BadRequestException('Submission file is required');
    }

    const assignment = await this.assignmentRepository.findOne({
      where: { id: dto.assignmentId },
      relations: ['course'],
    });
    if (!assignment) {
      throw new NotFoundException(`Assignment "${dto.assignmentId}" not found`);
    }

    if (new Date() > new Date(assignment.deadline)) {
      throw new BadRequestException('Assignment submission deadline has passed');
    }

    const student = await this.studentRepository.findOne({
      where: { id: studentId },
    });
    if (!student) {
      throw new NotFoundException(`Student "${studentId}" not found`);
    }

    // Ensure target folder exists
    let folderId = assignment.submissionFolderId;
    if (!folderId) {
      let parentFolderId = assignment.course?.slidesFolderId;
      if (!parentFolderId && assignment.courseId) {
        const course = await this.courseRepository.findOne({
          where: { id: assignment.courseId },
        });
        if (course) {
          if (!course.slidesFolderId) {
            const courseFolder = await this.googleDriveService.createFolder(
              `${course.name || course.id} Materials`,
            );
            course.slidesFolderId = courseFolder.id;
            await this.courseRepository.save(course);
          }
          parentFolderId = course.slidesFolderId;
        }
      }
      const folderName = `${assignment.course?.name || assignment.courseId} ${assignment.title} Submissions`;
      const createdFolder = await this.googleDriveService.createFolder(
        folderName,
        parentFolderId || undefined,
      );
      folderId = createdFolder.id;
      assignment.submissionFolderId = folderId;
      await this.assignmentRepository.save(assignment);
    }

    // Check for prior submission to clean up old file
    const existingSubmission = await this.submissionRepository.findOne({
      where: { assignmentId: dto.assignmentId, studentId },
    });

    if (existingSubmission && existingSubmission.fileId && existingSubmission.fileId !== 'pending') {
      try {
        await this.queueService.deleteFromDrive(existingSubmission.fileId);
      } catch (err: any) {
        this.logger.warn(`Failed to clean up old submission file: ${err.message}`);
      }
    }

    let savedSubmission: AssignmentSubmission;
    if (existingSubmission) {
      existingSubmission.fileId = 'pending';
      existingSubmission.fileName = file.originalname;
      existingSubmission.submittedAt = new Date();
      savedSubmission = await this.submissionRepository.save(existingSubmission);
    } else {
      const newSubmission = this.submissionRepository.create({
        assignmentId: dto.assignmentId,
        studentId,
        fileId: 'pending',
        fileName: file.originalname,
        submittedAt: new Date(),
      });
      savedSubmission = await this.submissionRepository.save(newSubmission);
    }

    // Stream upload offloaded to BullMQ background worker
    await this.queueService.uploadToDrive({
      type: DriveJobType.UPLOAD_SUBMISSION_FILE,
      courseId: assignment.courseId,
      folderId,
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileBufferBase64: file.buffer.toString('base64'),
      submissionId: savedSubmission.id,
    });

    // Invalidate caches
    await this.cacheService.scanAndInvalidate(`cr:assignments:student:${studentId}:*`);
    await this.cacheService.scanAndInvalidate(`cr:assignments:detail:${dto.assignmentId}:*`);
    await this.cacheService.scanAndInvalidate(`cr:assignments:course:${assignment.courseId}:*`);

    return savedSubmission;
  }

  /**
   * List assignments for a course with user submission status decoration.
   */
  async getAssignmentsByCourse(
    query: AssignmentQueryDto,
    user: { id?: string; sub?: string; role: string },
  ): Promise<PaginatedResult<any>> {
    const userId = user.id || user.sub || '';
    const page = query.page || 1;
    const limit = query.limit || 20;
    const search = query.search?.trim();
    const cacheKey = `cr:assignments:course:${query.courseId}:${userId}:${page}:${limit}:${search || ''}`;

    const cached = await this.cacheService.get<PaginatedResult<any>>(cacheKey);
    if (cached) return cached;

    const qb = this.assignmentRepository
      .createQueryBuilder('assignment')
      .where('assignment.courseId = :courseId', { courseId: query.courseId });

    if (search) {
      qb.andWhere(
        '(assignment.title ILIKE :search OR assignment.description ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    qb.orderBy('assignment.deadline', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [assignments, total] = await qb.getManyAndCount();

    // Decorate with submission statuses
    const items = await Promise.all(
      assignments.map(async (assignment) => {
        let studentSubmission: AssignmentSubmission | null = null;
        if (user.role === UserRole.STUDENT) {
          studentSubmission = await this.submissionRepository.findOne({
            where: { assignmentId: assignment.id, studentId: userId },
          });
        }

        const submissionCount = await this.submissionRepository.count({
          where: { assignmentId: assignment.id },
        });

        return {
          ...assignment,
          submissionCount,
          studentSubmission: studentSubmission
            ? {
                id: studentSubmission.id,
                submittedAt: studentSubmission.submittedAt,
                fileName: studentSubmission.fileName,
              }
            : null,
          hasSubmitted: !!studentSubmission,
        };
      }),
    );

    const totalPages = Math.ceil(total / limit) || 1;
    const result: PaginatedResult<any> = {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };

    await this.cacheService.set(cacheKey, result, 300);
    return result;
  }

  /**
   * Retrieve assignment details with role-differentiated submission visibility.
   */
  async getAssignmentById(
    id: string,
    user: { id?: string; sub?: string; role: string },
    query: PaginationQueryDto,
  ): Promise<any> {
    const userId = user.id || user.sub || '';
    const assignment = await this.assignmentRepository.findOne({
      where: { id },
      relations: ['course'],
    });
    if (!assignment) {
      throw new NotFoundException(`Assignment "${id}" not found`);
    }

    if (user.role === UserRole.REP) {
      const page = query.page || 1;
      const limit = query.limit || 20;
      const [submissions, total] = await this.submissionRepository.findAndCount({
        where: { assignmentId: id },
        relations: ['student'],
        order: { submittedAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      const totalPages = Math.ceil(total / limit) || 1;
      return {
        assignment,
        submissions: {
          items: submissions.map((s) => ({
            id: s.id,
            studentId: s.studentId,
            studentName: s.student?.name,
            studentEmail: s.student?.email,
            fileId: s.fileId,
            fileName: s.fileName,
            submittedAt: s.submittedAt,
          })),
          meta: {
            total,
            page,
            limit,
            totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
          },
        },
      };
    }

    // Role is STUDENT
    const submission = await this.submissionRepository.findOne({
      where: { assignmentId: id, studentId: userId },
    });

    return {
      assignment,
      submission: submission || null,
    };
  }

  /**
   * List submissions for a specific student with ownership verification.
   */
  async getStudentSubmissions(
    studentId: string,
    user: { id?: string; sub?: string; role: string },
    query: StudentSubmissionsQueryDto,
  ): Promise<PaginatedResult<AssignmentSubmission>> {
    const userId = user.id || user.sub || '';
    if (user.role !== UserRole.REP && userId !== studentId) {
      throw new ForbiddenException('You can only view your own assignment submissions');
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const cacheKey = `cr:assignments:student:${studentId}:${query.assignmentId || 'all'}:${page}:${limit}`;

    const cached = await this.cacheService.get<PaginatedResult<AssignmentSubmission>>(cacheKey);
    if (cached) return cached;

    const qb = this.submissionRepository
      .createQueryBuilder('submission')
      .innerJoinAndSelect('submission.assignment', 'assignment')
      .leftJoinAndSelect('assignment.course', 'course')
      .where('submission.studentId = :studentId', { studentId });

    if (query.assignmentId) {
      qb.andWhere('submission.assignmentId = :assignmentId', {
        assignmentId: query.assignmentId,
      });
    }

    qb.orderBy('submission.submittedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    const result: PaginatedResult<AssignmentSubmission> = {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };

    await this.cacheService.set(cacheKey, result, 300);
    return result;
  }

  /**
   * Cascade delete assignment, all submission files, spec file, and Drive submission folder.
   */
  async deleteAssignment(id: string): Promise<{ message: string }> {
    const assignment = await this.assignmentRepository.findOne({
      where: { id },
      relations: ['submissions'],
    });
    if (!assignment) {
      throw new NotFoundException(`Assignment "${id}" not found`);
    }

    // Delete submission files from Google Drive in background queue
    const fileIds = (assignment.submissions || [])
      .map((s) => s.fileId)
      .filter((fid): fid is string => Boolean(fid && fid !== 'pending'));

    if (fileIds.length > 0) {
      await Promise.allSettled(
        fileIds.map((fid) => this.queueService.deleteFromDrive(fid)),
      );
    }

    // Delete assignment folder
    if (assignment.submissionFolderId) {
      try {
        await this.queueService.deleteFromDrive(assignment.submissionFolderId);
      } catch (err: any) {
        this.logger.warn(`Failed to delete Drive folder: ${err.message}`);
      }
    }

    // Delete spec file if present
    if (assignment.fileId && assignment.fileId !== 'pending') {
      try {
        await this.queueService.deleteFromDrive(assignment.fileId);
      } catch (err: any) {
        this.logger.warn(`Failed to delete spec file: ${err.message}`);
      }
    }

    await this.assignmentRepository.remove(assignment);
    await this.cacheService.scanAndInvalidate('cr:assignments:*');

    return {
      message: 'Assignment and all associated files successfully deleted',
    };
  }

  /**
   * Delete student submission with deadline validation.
   */
  async deleteSubmission(
    submissionId: string,
    user: { id?: string; sub?: string; role: string },
  ): Promise<{ message: string }> {
    const userId = user.id || user.sub || '';
    const submission = await this.submissionRepository.findOne({
      where: { id: submissionId },
      relations: ['assignment'],
    });
    if (!submission) {
      throw new NotFoundException(`Submission "${submissionId}" not found`);
    }

    if (user.role !== UserRole.REP && userId !== submission.studentId) {
      throw new ForbiddenException('You can only delete your own submission');
    }

    if (
      user.role !== UserRole.REP &&
      submission.assignment &&
      new Date() > new Date(submission.assignment.deadline)
    ) {
      throw new BadRequestException(
        'Cannot delete submission after assignment deadline has passed',
      );
    }

    if (submission.fileId && submission.fileId !== 'pending') {
      try {
        await this.queueService.deleteFromDrive(submission.fileId);
      } catch (err: any) {
        this.logger.warn(`Failed to delete Drive submission file: ${err.message}`);
      }
    }

    await this.submissionRepository.remove(submission);

    await this.cacheService.scanAndInvalidate(`cr:assignments:student:${submission.studentId}:*`);
    await this.cacheService.scanAndInvalidate(`cr:assignments:detail:${submission.assignmentId}:*`);
    if (submission.assignment) {
      await this.cacheService.scanAndInvalidate(`cr:assignments:course:${submission.assignment.courseId}:*`);
    }

    return { message: 'Submission successfully deleted' };
  }

  /**
   * Download assignment specification document.
   */
  async downloadAssignmentFile(id: string): Promise<DriveDownloadResult> {
    const assignment = await this.assignmentRepository.findOne({ where: { id } });
    if (!assignment || !assignment.fileId) {
      throw new NotFoundException('Assignment specification file not found');
    }

    return this.googleDriveService.downloadFileStream(assignment.fileId);
  }

  /**
   * Download student submission file with ownership guard.
   */
  async downloadSubmissionFile(
    submissionId: string,
    user: { id?: string; sub?: string; role: string },
  ): Promise<DriveDownloadResult> {
    const userId = user.id || user.sub || '';
    const submission = await this.submissionRepository.findOne({
      where: { id: submissionId },
    });
    if (!submission || !submission.fileId) {
      throw new NotFoundException('Submission file not found');
    }

    if (user.role !== UserRole.REP && userId !== submission.studentId) {
      throw new ForbiddenException('You do not have permission to download this submission');
    }

    return this.googleDriveService.downloadFileStream(submission.fileId);
  }
}
