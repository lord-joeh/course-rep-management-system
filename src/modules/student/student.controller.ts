import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { StudentService } from './student.service';
import { StudentOwnershipGuard } from '../../common/guards/student-ownership.guard';
import { Roles, UserRole } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/jwt-payload.interface';
import { StudentQueryDto, RepUpdateStudentDto } from './dto';

@Controller('students')
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  /**
   * Self-service: Retrieve the authenticated student's profile.
   * Read-only access: Students cannot directly modify their profile.
   */
  @Get('me')
  async getMyProfile(@CurrentUser() user: AuthenticatedUser) {
    const student = await this.studentService.findById(user.id);
    if (!student) {
      throw new NotFoundException('Student profile not found');
    }
    return student;
  }

  /**
   * View student profile by ID.
   * Guarded by StudentOwnershipGuard: Allowed only for Course Reps or the target student.
   */
  @Get(':id')
  @UseGuards(StudentOwnershipGuard)
  async getStudentById(@Param('id') id: string) {
    const student = await this.studentService.findById(id);
    if (!student) {
      throw new NotFoundException(`Student with ID "${id}" not found`);
    }
    return student;
  }

  /**
   * Course Rep Directory: Retrieve paginated list of students with search & filters.
   * Course Rep only.
   */
  @Get()
  @Roles(UserRole.REP)
  async getStudents(@Query() query: StudentQueryDto) {
    return this.studentService.findPaginated(query);
  }

  /**
   * Course Rep Administrative Update: Update student details (name, phone, email, status, isRep).
   * Course Rep only.
   */
  @Patch(':id')
  @Roles(UserRole.REP)
  async updateStudent(
    @Param('id') id: string,
    @Body() dto: RepUpdateStudentDto,
  ) {
    return this.studentService.repUpdate(id, dto);
  }

  /**
   * Course Rep Administrative Deletion: Remove a student record.
   * Course Rep only.
   */
  @Delete(':id')
  @Roles(UserRole.REP)
  async deleteStudent(@Param('id') id: string) {
    return this.studentService.delete(id);
  }
}

