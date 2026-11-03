import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import * as fs from 'fs/promises';
import { Readable } from 'stream';
import { QueueName, DriveJobType } from '../constants';
import { DriveJobData, DriveUploadJobData, DriveDeleteJobData } from '../dto';
import { GoogleDriveService } from '../../google/services/google-drive.service';
import { Slide } from '../../slide/entities/slide.entity';
import { Assignment } from '../../assignment/entities/assignment.entity';
import { AssignmentSubmission } from '../../assignment/entities/assignment-submission.entity';

@Processor(QueueName.DRIVE_SYNC)
export class DriveSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(DriveSyncProcessor.name);

  constructor(
    private readonly googleDriveService: GoogleDriveService,
    @InjectRepository(Slide)
    private readonly slideRepository: Repository<Slide>,
    @InjectRepository(Assignment)
    private readonly assignmentRepository: Repository<Assignment>,
    @InjectRepository(AssignmentSubmission)
    private readonly submissionRepository: Repository<AssignmentSubmission>,
  ) {
    super();
  }

  async process(job: Job<DriveJobData, any, string>): Promise<any> {
    const data = job.data;
    this.logger.log(`Processing drive job [${job.id}] type [${data.type}]`);

    switch (data.type) {
      case DriveJobType.UPLOAD_SLIDE_FILE:
      case DriveJobType.UPLOAD_ASSIGNMENT_FILE:
      case DriveJobType.UPLOAD_SUBMISSION_FILE:
        return this.handleUpload(job.id, data as DriveUploadJobData);

      case DriveJobType.DELETE_DRIVE_FILE:
        return this.handleDelete(job.id, data as DriveDeleteJobData);

      default:
        throw new Error(`Unsupported drive job type: ${(data as any).type}`);
    }
  }

  private async handleUpload(jobId: string | undefined, data: DriveUploadJobData): Promise<any> {
    let fileBuffer: Buffer | null = null;
    let tempPathToUnlink: string | null = null;

    try {
      if (data.fileBufferBase64) {
        fileBuffer = Buffer.from(data.fileBufferBase64, 'base64');
      } else if (data.tempFilePath) {
        tempPathToUnlink = data.tempFilePath;
        fileBuffer = await fs.readFile(data.tempFilePath);
      } else {
        throw new Error('Either fileBufferBase64 or tempFilePath must be provided for upload');
      }

      this.logger.log(`Uploading file [${data.fileName}] (${fileBuffer.length} bytes) to Drive folder [${data.folderId || 'root'}]`);

      // Delegate directly to existing GoogleDriveService logic
      const bodyStream = Readable.from(fileBuffer);
      const uploadResult = await this.googleDriveService.uploadFileStream(
        data.folderId || 'root',
        data.fileName,
        data.mimeType,
        bodyStream,
      );

      // If tied to an existing Slide record, update the driveFileId
      if (data.slideId) {
        await this.slideRepository.update(data.slideId, {
          driveFileId: uploadResult.id,
          fileName: data.fileName,
        });
        this.logger.log(`Updated Slide [${data.slideId}] with Drive file ID: ${uploadResult.id}`);
      }

      // If tied to an existing Assignment record, update fileId
      if (data.assignmentId) {
        await this.assignmentRepository.update(data.assignmentId, {
          fileId: uploadResult.id,
          fileName: data.fileName,
        });
        this.logger.log(`Updated Assignment [${data.assignmentId}] with Drive file ID: ${uploadResult.id}`);
      }

      // If tied to an existing AssignmentSubmission record, update fileId
      if (data.submissionId) {
        await this.submissionRepository.update(data.submissionId, {
          fileId: uploadResult.id,
          fileName: data.fileName,
        });
        this.logger.log(`Updated AssignmentSubmission [${data.submissionId}] with Drive file ID: ${uploadResult.id}`);
      }

      return {
        success: true,
        driveFileId: uploadResult.id,
        fileName: uploadResult.name,
        slideId: data.slideId,
        assignmentId: data.assignmentId,
        submissionId: data.submissionId,
      };
    } catch (error: any) {
      this.logger.error(`Drive upload job [${jobId}] failed: ${error.message}`, error.stack);
      throw error;
    } finally {
      // Non-blocking asynchronous cleanup of local temporary files
      if (tempPathToUnlink) {
        try {
          await fs.unlink(tempPathToUnlink);
          this.logger.debug(`Cleaned up temporary upload file: ${tempPathToUnlink}`);
        } catch (unlinkErr: any) {
          this.logger.warn(`Failed to unlink temporary file [${tempPathToUnlink}]: ${unlinkErr.message}`);
        }
      }
    }
  }

  private async handleDelete(jobId: string | undefined, data: DriveDeleteJobData): Promise<any> {
    try {
      this.logger.log(`Purging Drive file [${data.driveFileId}] for job [${jobId}]`);
      await this.googleDriveService.deleteFile(data.driveFileId);
      return { success: true, driveFileId: data.driveFileId };
    } catch (error: any) {
      this.logger.error(`Drive delete job [${jobId}] failed: ${error.message}`, error.stack);
      throw error;
    }
  }
}

