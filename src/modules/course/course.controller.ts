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
import { CourseService } from './course.service';
import { Roles, UserRole } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateCourseDto, UpdateCourseDto, CourseQueryDto } from './dto';

@Controller('courses')
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

  /**
   * Course Catalog: Paginated list of courses with search and filters.
   * Accessible by all authenticated students and reps.
   */
  @Get()
  async getCourses(@Query() query: CourseQueryDto) {
    return this.courseService.findPaginated(query);
  }

  /**
   * Self-Service: Retrieve the authenticated student's enrolled courses.
   */
  @Get('my-courses')
  async getMyCourses(@CurrentUser('id') studentId: string) {
    return this.courseService.getStudentCourses(studentId);
  }

  /**
   * Retrieve single course details by ID/code.
   */
  @Get(':id')
  async getCourseById(@Param('id') id: string) {
    return this.courseService.findById(id);
  }

  /**
   * Course Roster: View all students enrolled in a course.
   * Course Rep only.
   */
  @Get(':id/roster')
  @Roles(UserRole.REP)
  async getCourseRoster(@Param('id') id: string) {
    return this.courseService.getCourseRoster(id);
  }

  /**
   * Administrative creation of a new course.
   * Course Rep only.
   */
  @Post()
  @Roles(UserRole.REP)
  async createCourse(@Body() dto: CreateCourseDto) {
    return this.courseService.create(dto);
  }

  /**
   * Administrative update of an existing course.
   * Course Rep only.
   */
  @Patch(':id')
  @Roles(UserRole.REP)
  async updateCourse(
    @Param('id') id: string,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.courseService.update(id, dto);
  }

  /**
   * Administrative deletion of a course.
   * Course Rep only.
   */
  @Delete(':id')
  @Roles(UserRole.REP)
  async deleteCourse(@Param('id') id: string) {
    return this.courseService.delete(id);
  }

  /**
   * Student Self-Enrollment in a course.
   */
  @Post(':id/enroll')
  @HttpCode(HttpStatus.OK)
  async enroll(
    @Param('id') courseId: string,
    @CurrentUser('id') studentId: string,
  ) {
    return this.courseService.enrollStudent(courseId, studentId);
  }

  /**
   * Student Self-Unenrollment from a course.
   */
  @Delete(':id/enroll')
  async unenroll(
    @Param('id') courseId: string,
    @CurrentUser('id') studentId: string,
  ) {
    return this.courseService.unenrollStudent(courseId, studentId);
  }
}

