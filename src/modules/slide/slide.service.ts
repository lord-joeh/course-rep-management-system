import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Readable } from 'stream';
import * as crypto from 'crypto';

import { Slide } from './entities/slide.entity';
import { Course } from '../course/entities/course.entity';
import { GoogleDriveService } from '../google/services/google-drive.service';
import { CacheService } from '../redis/cache.service';
import { CACHE_TTL } from '../../common/constants/cache.constants';
import { SlideQueryDto } from './dto';
import { PaginatedResult } from '../../common/pagination';

export interface SlideUploadResult {
  uploaded: Slide[];
  duplicatesSkipped: { fileName: string; hash: string }[];
  failed: { fileName: string; error: string }[];
}

@Injectable()
export class SlideService {
  private readonly logger = new Logger(SlideService.name);

  constructor(
    @InjectRepository(Slide)
    private readonly slideRepository: Repository<Slide>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    private readonly googleDriveService: GoogleDriveService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * High-performance slide upload with pre-check deduplication,
   * zero-disk in-memory streaming, and parallel Drive upload pool.
   */
  async uploadSlides(
    files: Express.Multer.File[],
    courseId: string,
    folderId?: string,
  ): Promise<SlideUploadResult> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No slide files provided for upload');
    }

    if (files.length > 10) {
      throw new BadRequestException('Cannot upload more than 10 slides at a time');
    }

    const course = await this.courseRepository.findOne({ where: { id: courseId } });
    if (!course) {
      throw new NotFoundException(`Course with ID "${courseId}" not found`);
    }

    // 1. Resolve or auto-provision target Google Drive folder
    let targetFolderId = folderId || course.slidesFolderId;
    if (!targetFolderId) {
      const createdFolder = await this.googleDriveService.createFolder(
        `${course.id} Slides`,
      );
      targetFolderId = createdFolder.id;
      course.slidesFolderId = targetFolderId;
      await this.courseRepository.save(course);
    }

    // 2. Compute in-memory SHA-256 digests for all files
    const fileHashes = files.map((file) => ({
      file,
      hash: crypto.createHash('sha256').update(file.buffer).digest('hex'),
    }));

    const hashes = fileHashes.map((f) => f.hash);
    const existingSlides = await this.slideRepository.find({
      where: {
        courseId,
        hash: In(hashes),
      },
    });

    const existingHashSet = new Set(existingSlides.map((s) => s.hash));

    const duplicatesSkipped: { fileName: string; hash: string }[] = [];
    const filesToUpload: { file: Express.Multer.File; hash: string }[] = [];

    for (const item of fileHashes) {
      if (existingHashSet.has(item.hash)) {
        duplicatesSkipped.push({
          fileName: item.file.originalname,
          hash: item.hash,
        });
      } else {
        filesToUpload.push(item);
      }
    }

    // 3. Parallel Uploads via Promise.allSettled
    const uploadPromises = filesToUpload.map(async ({ file, hash }) => {
      const bodyStream = Readable.from(file.buffer);
      const driveFile = await this.googleDriveService.uploadFileStream(
        targetFolderId,
        file.originalname,
        file.mimetype,
        bodyStream,
      );

      return {
        driveFileId: driveFile.id,
        fileName: driveFile.name,
        courseId,
        hash,
      };
    });

    const results = await Promise.allSettled(uploadPromises);

    const slidesToSave: Slide[] = [];
    const failed: { fileName: string; error: string }[] = [];

    results.forEach((res, index) => {
      const originalFile = filesToUpload[index].file;
      if (res.status === 'fulfilled') {
        const slide = this.slideRepository.create(res.value);
        slidesToSave.push(slide);
      } else {
        this.logger.error(
          `Failed uploading "${originalFile.originalname}": ${res.reason?.message}`,
        );
        failed.push({
          fileName: originalFile.originalname,
          error: res.reason?.message || 'Upload failed',
        });
      }
    });

    // 4. Batch Atomic Persistence
    let uploaded: Slide[] = [];
    if (slidesToSave.length > 0) {
      uploaded = await this.slideRepository.save(slidesToSave);
      // Invalidate course slides cache
      await this.cacheService.scanAndInvalidate(`cr:slides:course:${courseId}:*`);
    }

    return {
      uploaded,
      duplicatesSkipped,
      failed,
    };
  }

  /**
   * Paginated slide listing with Redis caching.
   */
  async findSlidesByCourse(query: SlideQueryDto): Promise<PaginatedResult<Slide>> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const { courseId, search } = query;
    const cacheKey = `cr:slides:course:${courseId}:page:${page}:limit:${limit}:search:${search || ''}`;

    const cached = await this.cacheService.get<PaginatedResult<Slide>>(cacheKey);
    if (cached) {
      return cached;
    }

    const course = await this.courseRepository.findOne({ where: { id: courseId } });
    if (!course) {
      throw new NotFoundException(`Course with ID "${courseId}" not found`);
    }

    const qb = this.slideRepository
      .createQueryBuilder('slide')
      .where('slide.courseId = :courseId', { courseId });

    if (search && search.trim()) {
      qb.andWhere('slide.fileName ILIKE :search', { search: `%${search.trim()}%` });
    }

    qb.orderBy('slide.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    const result: PaginatedResult<Slide> = {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };

    await this.cacheService.set(cacheKey, result, CACHE_TTL.ONE_HOUR);

    return result;
  }

  /**
   * Stream slide download from Google Drive.
   */
  async downloadSlideStream(slideId: string) {
    const slide = await this.slideRepository.findOne({ where: { id: slideId } });
    if (!slide) {
      throw new NotFoundException(`Slide with ID "${slideId}" not found`);
    }

    return this.googleDriveService.downloadFileStream(slide.driveFileId);
  }

  /**
   * Delete slide record from DB and remove asset from Google Drive.
   */
  async deleteSlide(slideId: string): Promise<{ message: string; slideId: string }> {
    const slide = await this.slideRepository.findOne({ where: { id: slideId } });
    if (!slide) {
      throw new NotFoundException(`Slide with ID "${slideId}" not found`);
    }

    try {
      await this.googleDriveService.deleteFile(slide.driveFileId);
    } catch (err: any) {
      this.logger.warn(
        `Google Drive deletion failed for slide "${slideId}" (${slide.driveFileId}): ${err.message}`,
      );
    }

    await this.slideRepository.remove(slide);
    await this.cacheService.scanAndInvalidate(`cr:slides:course:${slide.courseId}:*`);

    return {
      message: 'Slide deleted successfully',
      slideId,
    };
  }

  /**
   * Search files in a Google Drive folder.
   */
  async searchFilesInFolder(folderId: string) {
    return this.googleDriveService.searchFilesInFolder(folderId);
  }
}
