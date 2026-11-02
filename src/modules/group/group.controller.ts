import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { GroupService } from './group.service';
import {
  CreateGroupDto,
  UpdateGroupDto,
  AutomatedGroupDivisionDto,
  AddGroupMemberDto,
  GroupQueryDto,
} from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, UserRole } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/jwt-payload.interface';

@Controller('groups')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  /**
   * Create a single group.
   * Rep only.
   */
  @Post()
  @Roles(UserRole.REP)
  async createGroup(@Body() dto: CreateGroupDto) {
    return this.groupService.createGroup(dto);
  }

  /**
   * Automated algorithmic group division engine using Fisher-Yates shuffle.
   * Rep only.
   */
  @Post('auto-divide')
  @Roles(UserRole.REP)
  async divideStudents(@Body() dto: AutomatedGroupDivisionDto) {
    return this.groupService.divideStudents(dto);
  }

  /**
   * List paginated groups with course, isGeneral, and search filters.
   */
  @Get()
  @Roles(UserRole.STUDENT, UserRole.REP)
  async getGroups(@Query() query: GroupQueryDto) {
    return this.groupService.getGroups(query);
  }

  /**
   * Retrieve groups that the authenticated student belongs to.
   */
  @Get('my-groups')
  @Roles(UserRole.STUDENT, UserRole.REP)
  async getMyGroups(@CurrentUser() user: AuthenticatedUser) {
    return this.groupService.getStudentGroups(user.id);
  }

  /**
   * Course Rep directory: retrieve groups for a specific student.
   * Rep only.
   */
  @Get('student/:studentId')
  @Roles(UserRole.REP)
  async getStudentGroups(@Param('studentId') studentId: string) {
    return this.groupService.getStudentGroups(studentId);
  }

  /**
   * Retrieve group details with member roster.
   */
  @Get(':id')
  @Roles(UserRole.STUDENT, UserRole.REP)
  async getGroupById(@Param('id') id: string) {
    return this.groupService.getGroupById(id);
  }

  /**
   * Update group details.
   * Rep only.
   */
  @Put(':id')
  @Roles(UserRole.REP)
  async updateGroup(
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groupService.updateGroup(id, dto);
  }

  /**
   * Delete group and all associated member records.
   * Rep only.
   */
  @Delete(':id')
  @Roles(UserRole.REP)
  async deleteGroup(@Param('id') id: string) {
    return this.groupService.deleteGroup(id);
  }

  /**
   * Add a student to a group (validates course enrollment).
   * Rep only.
   */
  @Post(':id/members')
  @Roles(UserRole.REP)
  async addGroupMember(
    @Param('id') id: string,
    @Body() dto: AddGroupMemberDto,
  ) {
    return this.groupService.addGroupMember(id, dto);
  }

  /**
   * Remove a student strictly from target group.
   * Rep only.
   */
  @Delete(':id/members/:studentId')
  @Roles(UserRole.REP)
  async removeGroupMember(
    @Param('id') id: string,
    @Param('studentId') studentId: string,
  ) {
    return this.groupService.removeGroupMember(id, studentId);
  }

  /**
   * Assign or transfer group leadership.
   * Rep only.
   */
  @Patch(':id/leader/:studentId')
  @Roles(UserRole.REP)
  async setGroupLeader(
    @Param('id') id: string,
    @Param('studentId') studentId: string,
  ) {
    return this.groupService.setGroupLeader(id, studentId);
  }
}

