import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

import { Group } from './entities/group.entity';
import { GroupMember } from './entities/group-member.entity';
import { Course } from '../course/entities/course.entity';
import { CourseStudent } from '../course/entities/course-student.entity';
import { Student } from '../student/entities/student.entity';
import { CacheService } from '../redis/cache.service';
import {
  CreateGroupDto,
  UpdateGroupDto,
  AutomatedGroupDivisionDto,
  AddGroupMemberDto,
  GroupQueryDto,
} from './dto';
import { PaginatedResult } from '../../common/pagination';

@Injectable()
export class GroupService {
  private readonly logger = new Logger(GroupService.name);

  constructor(
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(GroupMember)
    private readonly groupMemberRepository: Repository<GroupMember>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(CourseStudent)
    private readonly courseStudentRepository: Repository<CourseStudent>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    private readonly dataSource: DataSource,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Fisher-Yates uniform shuffle algorithm on an in-memory array clone.
   */
  shuffle<T>(array: T[]): T[] {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  /**
   * Create a single group (general cohort group or course-specific group).
   */
  async createGroup(dto: CreateGroupDto): Promise<Group> {
    const isGeneral = Boolean(dto.isGeneral);

    if (!isGeneral) {
      if (!dto.courseId) {
        throw new BadRequestException('Course ID is required for non-general groups');
      }
      const course = await this.courseRepository.findOne({
        where: { id: dto.courseId },
      });
      if (!course) {
        throw new NotFoundException(`Course "${dto.courseId}" not found`);
      }
    }

    const group = this.groupRepository.create({
      name: dto.name,
      courseId: isGeneral ? null : dto.courseId,
      isGeneral,
      description: dto.description || null,
    });

    const saved = await this.groupRepository.save(group);
    await this.cacheService.scanAndInvalidate('cr:groups:*');
    return saved;
  }

  /**
   * Automated algorithmic group division engine using Fisher-Yates shuffle.
   * Supports chunking by studentsPerGroup or balanced bucket distribution by numberOfGroups.
   */
  async divideStudents(
    dto: AutomatedGroupDivisionDto,
  ): Promise<{ totalGroups: number; totalStudents: number; groups: Group[] }> {
    const hasStudentsPerGroup =
      dto.studentsPerGroup !== undefined && dto.studentsPerGroup > 0;
    const hasNumberOfGroups =
      dto.numberOfGroups !== undefined && dto.numberOfGroups > 0;

    if (!hasStudentsPerGroup && !hasNumberOfGroups) {
      throw new BadRequestException(
        'Must specify either studentsPerGroup or numberOfGroups with a positive integer',
      );
    }

    const isGeneral = Boolean(dto.isGeneral);

    let studentIds: string[] = [];

    if (isGeneral) {
      const students = await this.studentRepository.find({
        where: { status: 'active' },
      });
      studentIds = students.map((s) => s.id);
    } else {
      if (!dto.courseId) {
        throw new BadRequestException(
          'courseId is required for course-specific group division',
        );
      }
      const course = await this.courseRepository.findOne({
        where: { id: dto.courseId },
      });
      if (!course) {
        throw new NotFoundException(`Course "${dto.courseId}" not found`);
      }

      const enrollments = await this.courseStudentRepository.find({
        where: { courseId: dto.courseId, isRegister: true },
        relations: ['student'],
      });

      const activeEnrollments = enrollments.filter(
        (e) => e.student && e.student.status === 'active',
      );
      studentIds = activeEnrollments.map((e) => e.studentId);
    }

    if (studentIds.length === 0) {
      throw new BadRequestException('No active students found to group');
    }

    // Uniformly shuffle students
    const shuffled = this.shuffle(studentIds);

    // Partition into buckets
    const buckets: string[][] = [];

    if (hasStudentsPerGroup) {
      const size = dto.studentsPerGroup!;
      for (let i = 0; i < shuffled.length; i += size) {
        buckets.push(shuffled.slice(i, i + size));
      }
    } else {
      const numGroups = dto.numberOfGroups!;
      if (numGroups > shuffled.length) {
        throw new BadRequestException(
          `Number of groups (${numGroups}) cannot exceed available students (${shuffled.length})`,
        );
      }

      for (let i = 0; i < numGroups; i++) {
        buckets.push([]);
      }
      shuffled.forEach((studentId, idx) => {
        buckets[idx % numGroups].push(studentId);
      });
    }

    const prefix = dto.namingPrefix?.trim() || 'Group';
    const autoAssignLeader = dto.autoAssignLeader !== false;

    // Transactionally persist all groups and member rosters
    const createdGroups = await this.dataSource.transaction(async (manager) => {
      const savedGroups: Group[] = [];

      for (let i = 0; i < buckets.length; i++) {
        const groupMembers = buckets[i];
        const groupName = `${prefix} ${i + 1}`;

        const groupEntity = manager.create(Group, {
          name: groupName,
          courseId: isGeneral ? null : dto.courseId,
          isGeneral,
          description: `${groupName} (${groupMembers.length} members)`,
        });

        const savedGroup = await manager.save(Group, groupEntity);

        const memberEntities = groupMembers.map((studentId, mIdx) =>
          manager.create(GroupMember, {
            groupId: savedGroup.id,
            studentId,
            isLeader: autoAssignLeader && mIdx === 0,
          }),
        );

        await manager.save(GroupMember, memberEntities);
        savedGroups.push(savedGroup);
      }

      return savedGroups;
    });

    await this.cacheService.scanAndInvalidate('cr:groups:*');

    return {
      totalGroups: createdGroups.length,
      totalStudents: shuffled.length,
      groups: createdGroups,
    };
  }

  /**
   * Update group details.
   */
  async updateGroup(id: string, dto: UpdateGroupDto): Promise<Group> {
    const group = await this.groupRepository.findOne({ where: { id } });
    if (!group) {
      throw new NotFoundException(`Group "${id}" not found`);
    }

    if (dto.name !== undefined) {
      group.name = dto.name;
    }

    if (dto.description !== undefined) {
      group.description = dto.description;
    }

    if (dto.courseId !== undefined) {
      if (dto.courseId) {
        const course = await this.courseRepository.findOne({
          where: { id: dto.courseId },
        });
        if (!course) {
          throw new NotFoundException(`Course "${dto.courseId}" not found`);
        }
        group.courseId = dto.courseId;
        group.isGeneral = false;
      } else {
        group.courseId = null;
        group.isGeneral = true;
      }
    }

    const updated = await this.groupRepository.save(group);
    await this.cacheService.scanAndInvalidate('cr:groups:*');
    return updated;
  }

  /**
   * Add a student to a group with course enrollment validation.
   */
  async addGroupMember(
    groupId: string,
    dto: AddGroupMemberDto,
  ): Promise<GroupMember> {
    const group = await this.groupRepository.findOne({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException(`Group "${groupId}" not found`);
    }

    const student = await this.studentRepository.findOne({
      where: { id: dto.studentId },
    });
    if (!student) {
      throw new NotFoundException(`Student "${dto.studentId}" not found`);
    }

    // Verify course enrollment if group is course-specific
    if (group.courseId) {
      const enrollment = await this.courseStudentRepository.findOne({
        where: { courseId: group.courseId, studentId: dto.studentId },
      });
      if (!enrollment) {
        throw new BadRequestException(
          'Student is not enrolled in the course for this group',
        );
      }
    }

    const existingMember = await this.groupMemberRepository.findOne({
      where: { groupId, studentId: dto.studentId },
    });
    if (existingMember) {
      throw new ConflictException('Student is already a member of this group');
    }

    // If making leader, demote previous leader
    if (dto.isLeader) {
      await this.groupMemberRepository.update(
        { groupId, isLeader: true },
        { isLeader: false },
      );
    }

    const member = this.groupMemberRepository.create({
      groupId,
      studentId: dto.studentId,
      isLeader: Boolean(dto.isLeader),
    });

    const saved = await this.groupMemberRepository.save(member);
    await this.cacheService.scanAndInvalidate('cr:groups:*');
    return saved;
  }

  /**
   * Remove student strictly from target group (preventing unintended global deletion).
   */
  async removeGroupMember(
    groupId: string,
    studentId: string,
  ): Promise<{ message: string }> {
    const member = await this.groupMemberRepository.findOne({
      where: { groupId, studentId },
    });
    if (!member) {
      throw new NotFoundException('Student is not a member of this group');
    }

    await this.groupMemberRepository.remove(member);
    await this.cacheService.scanAndInvalidate('cr:groups:*');

    return { message: 'Student successfully removed from group' };
  }

  /**
   * Designate or transfer leadership for a group.
   */
  async setGroupLeader(
    groupId: string,
    studentId: string,
  ): Promise<{ message: string; leaderId: string }> {
    const member = await this.groupMemberRepository.findOne({
      where: { groupId, studentId },
    });
    if (!member) {
      throw new NotFoundException('Student is not a member of this group');
    }

    await this.dataSource.transaction(async (manager) => {
      // Demote current leader
      await manager.update(
        GroupMember,
        { groupId, isLeader: true },
        { isLeader: false },
      );

      // Promote target member
      member.isLeader = true;
      await manager.save(GroupMember, member);
    });

    await this.cacheService.scanAndInvalidate('cr:groups:*');
    return {
      message: 'Group leader successfully assigned',
      leaderId: studentId,
    };
  }

  /**
   * List paginated groups with course, isGeneral, and search filters.
   */
  async getGroups(query: GroupQueryDto): Promise<PaginatedResult<any>> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const search = query.search?.trim();
    const cacheKey = `cr:groups:${query.courseId || 'all'}:${query.isGeneral !== undefined ? query.isGeneral : 'all'}:${page}:${limit}:${search || ''}`;

    const cached = await this.cacheService.get<PaginatedResult<any>>(cacheKey);
    if (cached) return cached;

    const qb = this.groupRepository
      .createQueryBuilder('group')
      .leftJoinAndSelect('group.course', 'course')
      .leftJoinAndSelect('group.members', 'members');

    if (query.courseId) {
      qb.andWhere('group.courseId = :courseId', { courseId: query.courseId });
    }

    if (query.isGeneral !== undefined) {
      qb.andWhere('group.isGeneral = :isGeneral', {
        isGeneral: query.isGeneral,
      });
    }

    if (search) {
      qb.andWhere(
        '(group.name ILIKE :search OR group.description ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    qb.orderBy('group.createdAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [groups, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    const items = groups.map((g) => ({
      ...g,
      memberCount: g.members?.length || 0,
    }));

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
   * Retrieve group details with populated member roster and student profiles.
   */
  async getGroupById(id: string): Promise<any> {
    const group = await this.groupRepository.findOne({
      where: { id },
      relations: ['course', 'members', 'members.student'],
    });
    if (!group) {
      throw new NotFoundException(`Group "${id}" not found`);
    }

    return {
      ...group,
      members: (group.members || []).map((m) => ({
        studentId: m.studentId,
        studentName: m.student?.name,
        studentEmail: m.student?.email,
        isLeader: m.isLeader,
        joinedAt: m.createdAt,
      })),
    };
  }

  /**
   * Retrieve groups that a specific student is assigned to.
   */
  async getStudentGroups(studentId: string): Promise<any[]> {
    const memberships = await this.groupMemberRepository.find({
      where: { studentId },
      relations: ['group', 'group.course'],
    });

    return memberships.map((m) => ({
      ...m.group,
      isLeader: m.isLeader,
      joinedAt: m.createdAt,
    }));
  }

  /**
   * Cascade delete a group and all its memberships.
   */
  async deleteGroup(id: string): Promise<{ message: string }> {
    const group = await this.groupRepository.findOne({ where: { id } });
    if (!group) {
      throw new NotFoundException(`Group "${id}" not found`);
    }

    await this.groupRepository.remove(group);
    await this.cacheService.scanAndInvalidate('cr:groups:*');

    return { message: 'Group successfully deleted' };
  }
}

