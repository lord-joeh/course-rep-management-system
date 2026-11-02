import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { LecturerService } from './lecturer.service';
import { Roles, UserRole } from '../../common/decorators/roles.decorator';
import { CreateLecturerDto, UpdateLecturerDto, LecturerQueryDto } from './dto';

@Controller('lecturers')
export class LecturerController {
  constructor(private readonly lecturerService: LecturerService) {}

  /**
   * Faculty Directory: Retrieve paginated list of lecturers with search.
   * Accessible by all authenticated students and reps.
   */
  @Get()
  async getLecturers(@Query() query: LecturerQueryDto) {
    return this.lecturerService.findPaginated(query);
  }

  /**
   * Retrieve single lecturer details by ID.
   * Accessible by all authenticated students and reps.
   */
  @Get(':id')
  async getLecturerById(@Param('id') id: string) {
    return this.lecturerService.findById(id);
  }

  /**
   * Administrative creation of a new lecturer.
   * Course Rep only.
   */
  @Post()
  @Roles(UserRole.REP)
  async createLecturer(@Body() dto: CreateLecturerDto) {
    return this.lecturerService.create(dto);
  }

  /**
   * Administrative update of an existing lecturer.
   * Course Rep only.
   */
  @Patch(':id')
  @Roles(UserRole.REP)
  async updateLecturer(
    @Param('id') id: string,
    @Body() dto: UpdateLecturerDto,
  ) {
    return this.lecturerService.update(id, dto);
  }

  /**
   * Administrative deletion of a lecturer.
   * Course Rep only.
   */
  @Delete(':id')
  @Roles(UserRole.REP)
  async deleteLecturer(@Param('id') id: string) {
    return this.lecturerService.delete(id);
  }
}

