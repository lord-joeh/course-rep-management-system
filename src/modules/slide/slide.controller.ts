import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Res,
  UseInterceptors,
  UploadedFiles,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';

import { SlideService } from './slide.service';
import { UploadSlideDto, SlideQueryDto } from './dto';
import { Roles, UserRole } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('slides')
export class SlideController {
  constructor(private readonly slideService: SlideService) {}

  /**
   * Upload slides for a course (up to 10 files, 50MB each).
   * Course Rep only.
   */
  @Post('upload')
  @Roles(UserRole.REP)
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async uploadSlides(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: UploadSlideDto,
    @CurrentUser('id') uploaderId?: string,
  ) {
    return this.slideService.uploadSlides(files, dto.courseId, dto.folderId, uploaderId);
  }

  /**
   * List paginated slides for a course.
   * Accessible by all authenticated students and reps.
   */
  @Get()
  async getSlidesByCourse(@Query() query: SlideQueryDto) {
    return this.slideService.findSlidesByCourse(query);
  }

  /**
   * Search files directly in a Google Drive folder.
   * Accessible by all authenticated students and reps.
   */
  @Get('search')
  async searchFilesInFolder(@Query('folderId') folderId: string) {
    return this.slideService.searchFilesInFolder(folderId);
  }

  /**
   * Download a slide file directly as a stream.
   * Accessible by all authenticated students and reps.
   */
  @Get(':slideId/download')
  async downloadSlide(
    @Param('slideId', ParseUUIDPipe) slideId: string,
    @Res() res: Response,
  ) {
    const { stream, fileName, mimeType, fileSize } =
      await this.slideService.downloadSlideStream(slideId);

    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`,
    );

    if (fileSize) {
      res.setHeader('Content-Length', fileSize);
    }

    stream.pipe(res);
  }

  /**
   * Delete a slide record and remove its asset from Google Drive.
   * Course Rep only.
   */
  @Delete(':slideId')
  @Roles(UserRole.REP)
  async deleteSlide(@Param('slideId', ParseUUIDPipe) slideId: string) {
    return this.slideService.deleteSlide(slideId);
  }
}

