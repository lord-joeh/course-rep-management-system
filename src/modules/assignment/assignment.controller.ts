import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AssignmentService } from './assignment.service';
import {
  CreateAssignmentDto,
  UpdateAssignmentDto,
  SubmitAssignmentDto,
  AssignmentQueryDto,
  StudentSubmissionsQueryDto,
} from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, UserRole } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/jwt-payload.interface';
import { PaginationQueryDto } from '../../common/pagination';

@Controller('assignments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssignmentController {
  constructor(private readonly assignmentService: AssignmentService) {}

  /**
   * Create a new course assignment.
   * Rep only. Optional specification file upload.
   */
  @Post()
  @Roles(UserRole.REP)
  @UseInterceptors(FileInterceptor('file'))
  async createAssignment(
    @Body() dto: CreateAssignmentDto,
    @UploadedFile() file?: Express.Multer.File,
    @CurrentUser('id') creatorId?: string,
  ) {
    return this.assignmentService.createAssignment(dto, file, creatorId);
  }

  /**
   * List assignments for a course with submission metadata.
   */
  @Get()
  @Roles(UserRole.STUDENT, UserRole.REP)
  async getAssignmentsByCourse(
    @Query() query: AssignmentQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assignmentService.getAssignmentsByCourse(query, user);
  }

  /**
   * Submit an assignment solution.
   * Automatically binds to the authenticated user ID.
   */
  @Post('submit')
  @Roles(UserRole.STUDENT, UserRole.REP)
  @UseInterceptors(FileInterceptor('file'))
  async submitAssignment(
    @Body() dto: SubmitAssignmentDto,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.assignmentService.submitAssignment(dto, user.id, file);
  }

  /**
   * Retrieve submissions for a student.
   * Access: Course Reps or the student themselves.
   */
  @Get('submissions/student/:studentId')
  @Roles(UserRole.STUDENT, UserRole.REP)
  async getStudentSubmissions(
    @Param('studentId') studentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StudentSubmissionsQueryDto,
  ) {
    return this.assignmentService.getStudentSubmissions(studentId, user, query);
  }

  /**
   * Delete a student submission before deadline.
   * Access: Course Reps or the submitting student.
   */
  @Delete('submissions/:submissionId')
  @Roles(UserRole.STUDENT, UserRole.REP)
  async deleteSubmission(
    @Param('submissionId') submissionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assignmentService.deleteSubmission(submissionId, user);
  }

  /**
   * Stream download a student submission file.
   */
  @Get('submissions/:submissionId/download')
  @Roles(UserRole.STUDENT, UserRole.REP)
  async downloadSubmissionFile(
    @Param('submissionId') submissionId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const fileResult = await this.assignmentService.downloadSubmissionFile(
      submissionId,
      user,
    );

    res.set({
      'Content-Type': fileResult.mimeType,
      'Content-Disposition': `attachment; filename="${fileResult.fileName}"`,
    });

    if (fileResult.fileSize) {
      res.set('Content-Length', fileResult.fileSize);
    }

    fileResult.stream.pipe(res);
  }

  /**
   * Get assignment details by ID.
   * Reps see student submissions; Students see their own submission.
   */
  @Get(':id')
  @Roles(UserRole.STUDENT, UserRole.REP)
  async getAssignmentById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.assignmentService.getAssignmentById(id, user, query);
  }

  /**
   * Update assignment details.
   * Rep only.
   */
  @Put(':id')
  @Roles(UserRole.REP)
  async updateAssignment(
    @Param('id') id: string,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.assignmentService.updateAssignment(id, dto);
  }

  /**
   * Delete an assignment and all its submissions.
   * Rep only.
   */
  @Delete(':id')
  @Roles(UserRole.REP)
  async deleteAssignment(@Param('id') id: string) {
    return this.assignmentService.deleteAssignment(id);
  }

  /**
   * Stream download the assignment specification document.
   */
  @Get(':id/download')
  @Roles(UserRole.STUDENT, UserRole.REP)
  async downloadAssignmentFile(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const fileResult = await this.assignmentService.downloadAssignmentFile(id);

    res.set({
      'Content-Type': fileResult.mimeType,
      'Content-Disposition': `attachment; filename="${fileResult.fileName}"`,
    });

    if (fileResult.fileSize) {
      res.set('Content-Length', fileResult.fileSize);
    }

    fileResult.stream.pipe(res);
  }
}

