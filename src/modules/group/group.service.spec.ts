import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { GroupService } from './group.service';
import { Group } from './entities/group.entity';
import { GroupMember } from './entities/group-member.entity';
import { Course } from '../course/entities/course.entity';
import { CourseStudent } from '../course/entities/course-student.entity';
import { Student } from '../student/entities/student.entity';
import { CacheService } from '../redis/cache.service';

describe('GroupService', () => {
  let service: GroupService;
  let groupRepoMock: any;
  let groupMemberRepoMock: any;
  let courseRepoMock: any;
  let courseStudentRepoMock: any;
  let studentRepoMock: any;
  let cacheServiceMock: any;
  let dataSourceMock: any;
  let managerMock: any;
  let queryBuilderMock: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    queryBuilderMock = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    groupRepoMock = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((dto) => dto),
      save: jest.fn((entity) => Promise.resolve({ id: 'group-uuid-1', ...entity })),
      remove: jest.fn().mockResolvedValue(true),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilderMock),
    };

    groupMemberRepoMock = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((dto) => dto),
      save: jest.fn((entity) => Promise.resolve(entity)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      remove: jest.fn().mockResolvedValue(true),
    };

    courseRepoMock = {
      findOne: jest.fn(),
    };

    courseStudentRepoMock = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    };

    studentRepoMock = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    };

    managerMock = {
      create: jest.fn((entityClass, dto) => ({ ...dto })),
      save: jest.fn((entityClass, entity) => {
        if (Array.isArray(entity)) {
          return Promise.resolve(entity);
        }
        return Promise.resolve({ id: 'tx-group-uuid', ...entity });
      }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    dataSourceMock = {
      transaction: jest.fn((cb) => cb(managerMock)),
    };

    cacheServiceMock = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      scanAndInvalidate: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupService,
        { provide: getRepositoryToken(Group), useValue: groupRepoMock },
        { provide: getRepositoryToken(GroupMember), useValue: groupMemberRepoMock },
        { provide: getRepositoryToken(Course), useValue: courseRepoMock },
        { provide: getRepositoryToken(CourseStudent), useValue: courseStudentRepoMock },
        { provide: getRepositoryToken(Student), useValue: studentRepoMock },
        { provide: DataSource, useValue: dataSourceMock },
        { provide: CacheService, useValue: cacheServiceMock },
      ],
    }).compile();

    service = module.get<GroupService>(GroupService);
  });

  describe('shuffle', () => {
    it('should return a shuffled copy with the exact same items', () => {
      const items = ['a', 'b', 'c', 'd', 'e'];
      const result = service.shuffle(items);

      expect(result).toHaveLength(5);
      expect(result.sort()).toEqual(items.sort());
      expect(result).not.toBe(items);
    });

    it('should handle empty and single-element arrays', () => {
      expect(service.shuffle([])).toEqual([]);
      expect(service.shuffle(['single'])).toEqual(['single']);
    });
  });

  describe('createGroup', () => {
    it('should create a general cohort group when isGeneral is true', async () => {
      const dto = {
        name: 'Cohort Alpha',
        isGeneral: true,
        description: 'General study group',
      };

      const result = await service.createGroup(dto);

      expect(groupRepoMock.create).toHaveBeenCalledWith({
        name: 'Cohort Alpha',
        courseId: null,
        isGeneral: true,
        description: 'General study group',
      });
      expect(groupRepoMock.save).toHaveBeenCalled();
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:groups:*');
      expect(result.id).toBe('group-uuid-1');
    });

    it('should throw BadRequestException if non-general group lacks courseId', async () => {
      const dto = {
        name: 'CSC 101 Group 1',
        isGeneral: false,
      };

      await expect(service.createGroup(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if course does not exist for non-general group', async () => {
      courseRepoMock.findOne.mockResolvedValue(null);
      const dto = {
        name: 'CSC 101 Group 1',
        courseId: 'NON_EXISTENT',
        isGeneral: false,
      };

      await expect(service.createGroup(dto)).rejects.toThrow(NotFoundException);
    });

    it('should create a course-specific group when course exists', async () => {
      courseRepoMock.findOne.mockResolvedValue({ id: 'CSC101', title: 'Intro' });
      const dto = {
        name: 'CSC 101 Group 1',
        courseId: 'CSC101',
        isGeneral: false,
      };

      const result = await service.createGroup(dto);

      expect(groupRepoMock.create).toHaveBeenCalledWith({
        name: 'CSC 101 Group 1',
        courseId: 'CSC101',
        isGeneral: false,
        description: null,
      });
      expect(result.id).toBe('group-uuid-1');
    });
  });

  describe('divideStudents', () => {
    it('should throw BadRequestException if neither studentsPerGroup nor numberOfGroups is provided (>0)', async () => {
      await expect(
        service.divideStudents({ isGeneral: true }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.divideStudents({ isGeneral: true, studentsPerGroup: 0 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if general division finds no active students', async () => {
      studentRepoMock.find.mockResolvedValue([]);

      await expect(
        service.divideStudents({ isGeneral: true, studentsPerGroup: 3 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if courseId missing for course division', async () => {
      await expect(
        service.divideStudents({ isGeneral: false, studentsPerGroup: 3 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if course does not exist for course division', async () => {
      courseRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.divideStudents({
          isGeneral: false,
          courseId: 'INVALID_COURSE',
          studentsPerGroup: 3,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if no active students enrolled in course', async () => {
      courseRepoMock.findOne.mockResolvedValue({ id: 'CSC101' });
      courseStudentRepoMock.find.mockResolvedValue([
        { studentId: 'std-1', student: { status: 'inactive' } },
        { studentId: 'std-2', student: null },
      ]);

      await expect(
        service.divideStudents({
          isGeneral: false,
          courseId: 'CSC101',
          studentsPerGroup: 2,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should divide general students by studentsPerGroup into buckets and persist transactionally', async () => {
      studentRepoMock.find.mockResolvedValue([
        { id: 'std-1', status: 'active' },
        { id: 'std-2', status: 'active' },
        { id: 'std-3', status: 'active' },
        { id: 'std-4', status: 'active' },
        { id: 'std-5', status: 'active' },
      ]);

      const result = await service.divideStudents({
        isGeneral: true,
        studentsPerGroup: 2,
        namingPrefix: 'Team',
        autoAssignLeader: true,
      });

      expect(dataSourceMock.transaction).toHaveBeenCalled();
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:groups:*');
      expect(result.totalStudents).toBe(5);
      expect(result.totalGroups).toBe(3); // 2, 2, 1
    });

    it('should divide course students by numberOfGroups using balanced distribution', async () => {
      courseRepoMock.findOne.mockResolvedValue({ id: 'CSC101' });
      courseStudentRepoMock.find.mockResolvedValue([
        { studentId: 'std-1', student: { status: 'active' } },
        { studentId: 'std-2', student: { status: 'active' } },
        { studentId: 'std-3', student: { status: 'active' } },
        { studentId: 'std-4', student: { status: 'active' } },
      ]);

      const result = await service.divideStudents({
        courseId: 'CSC101',
        isGeneral: false,
        numberOfGroups: 2,
        namingPrefix: 'Lab Group',
        autoAssignLeader: false,
      });

      expect(dataSourceMock.transaction).toHaveBeenCalled();
      expect(result.totalStudents).toBe(4);
      expect(result.totalGroups).toBe(2);
    });

    it('should throw BadRequestException if numberOfGroups exceeds student count', async () => {
      courseRepoMock.findOne.mockResolvedValue({ id: 'CSC101' });
      courseStudentRepoMock.find.mockResolvedValue([
        { studentId: 'std-1', student: { status: 'active' } },
      ]);

      await expect(
        service.divideStudents({
          courseId: 'CSC101',
          isGeneral: false,
          numberOfGroups: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateGroup', () => {
    it('should throw NotFoundException if group does not exist', async () => {
      groupRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.updateGroup('non-existent', { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if updated courseId does not exist', async () => {
      groupRepoMock.findOne.mockResolvedValue({ id: 'grp-1', name: 'Old' });
      courseRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.updateGroup('grp-1', { courseId: 'INVALID_COURSE' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update group name, description, and associate to a course', async () => {
      const existingGroup = { id: 'grp-1', name: 'Old Name', isGeneral: true };
      groupRepoMock.findOne.mockResolvedValue(existingGroup);
      courseRepoMock.findOne.mockResolvedValue({ id: 'CSC201' });
      groupRepoMock.save.mockImplementation((g: any) => Promise.resolve(g));

      const updated = await service.updateGroup('grp-1', {
        name: 'New Name',
        description: 'New Desc',
        courseId: 'CSC201',
      });

      expect(updated.name).toBe('New Name');
      expect(updated.description).toBe('New Desc');
      expect(updated.courseId).toBe('CSC201');
      expect(updated.isGeneral).toBe(false);
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:groups:*');
    });

    it('should unset courseId and mark isGeneral if courseId passed as null/empty', async () => {
      const existingGroup = { id: 'grp-1', name: 'Old Name', courseId: 'CSC101', isGeneral: false };
      groupRepoMock.findOne.mockResolvedValue(existingGroup);
      groupRepoMock.save.mockImplementation((g: any) => Promise.resolve(g));

      const updated = await service.updateGroup('grp-1', {
        courseId: '',
      });

      expect(updated.courseId).toBeNull();
      expect(updated.isGeneral).toBe(true);
    });
  });

  describe('addGroupMember', () => {
    it('should throw NotFoundException if group does not exist', async () => {
      groupRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.addGroupMember('invalid-group', { studentId: 'std-1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if student does not exist', async () => {
      groupRepoMock.findOne.mockResolvedValue({ id: 'grp-1' });
      studentRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.addGroupMember('grp-1', { studentId: 'non-existent-student' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if course-specific group and student is not enrolled', async () => {
      groupRepoMock.findOne.mockResolvedValue({ id: 'grp-1', courseId: 'CSC101' });
      studentRepoMock.findOne.mockResolvedValue({ id: 'std-1' });
      courseStudentRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.addGroupMember('grp-1', { studentId: 'std-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if student is already in the group', async () => {
      groupRepoMock.findOne.mockResolvedValue({ id: 'grp-1', courseId: null });
      studentRepoMock.findOne.mockResolvedValue({ id: 'std-1' });
      groupMemberRepoMock.findOne.mockResolvedValue({ groupId: 'grp-1', studentId: 'std-1' });

      await expect(
        service.addGroupMember('grp-1', { studentId: 'std-1' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should add member and demote existing leader if new member is leader', async () => {
      groupRepoMock.findOne.mockResolvedValue({ id: 'grp-1', courseId: 'CSC101' });
      studentRepoMock.findOne.mockResolvedValue({ id: 'std-1' });
      courseStudentRepoMock.findOne.mockResolvedValue({ courseId: 'CSC101', studentId: 'std-1' });
      groupMemberRepoMock.findOne.mockResolvedValue(null);

      const result = await service.addGroupMember('grp-1', {
        studentId: 'std-1',
        isLeader: true,
      });

      expect(groupMemberRepoMock.update).toHaveBeenCalledWith(
        { groupId: 'grp-1', isLeader: true },
        { isLeader: false },
      );
      expect(groupMemberRepoMock.save).toHaveBeenCalled();
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:groups:*');
      expect(result.studentId).toBe('std-1');
      expect(result.isLeader).toBe(true);
    });
  });

  describe('removeGroupMember', () => {
    it('should throw NotFoundException if student is not a member of the group', async () => {
      groupMemberRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.removeGroupMember('grp-1', 'std-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should remove student from the group and invalidate cache', async () => {
      const member = { groupId: 'grp-1', studentId: 'std-1' };
      groupMemberRepoMock.findOne.mockResolvedValue(member);

      const result = await service.removeGroupMember('grp-1', 'std-1');

      expect(groupMemberRepoMock.remove).toHaveBeenCalledWith(member);
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:groups:*');
      expect(result.message).toContain('successfully removed');
    });
  });

  describe('setGroupLeader', () => {
    it('should throw NotFoundException if member not found in group', async () => {
      groupMemberRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.setGroupLeader('grp-1', 'std-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update leadership in transaction and invalidate cache', async () => {
      const member = { groupId: 'grp-1', studentId: 'std-1', isLeader: false };
      groupMemberRepoMock.findOne.mockResolvedValue(member);

      const result = await service.setGroupLeader('grp-1', 'std-1');

      expect(dataSourceMock.transaction).toHaveBeenCalled();
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:groups:*');
      expect(result.leaderId).toBe('std-1');
      expect(result.message).toContain('successfully assigned');
    });
  });

  describe('getGroups', () => {
    it('should return cached paginated result if present in cache', async () => {
      const cachedData = {
        items: [{ id: 'cached-grp-1' }],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      };
      cacheServiceMock.get.mockResolvedValue(cachedData);

      const result = await service.getGroups({ page: 1, limit: 10 });

      expect(result).toEqual(cachedData);
      expect(groupRepoMock.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should query, paginate, filter, and cache groups on cache miss', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      const fakeGroups = [
        {
          id: 'grp-1',
          name: 'Group 1',
          members: [{ studentId: 'std-1' }, { studentId: 'std-2' }],
        },
      ];
      queryBuilderMock.getManyAndCount.mockResolvedValue([fakeGroups, 1]);

      const result = await service.getGroups({
        courseId: 'CSC101',
        isGeneral: false,
        search: 'Group',
        page: 1,
        limit: 10,
      });

      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith('group.courseId = :courseId', {
        courseId: 'CSC101',
      });
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith('group.isGeneral = :isGeneral', {
        isGeneral: false,
      });
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        '(group.name ILIKE :search OR group.description ILIKE :search)',
        { search: '%Group%' },
      );
      expect(cacheServiceMock.set).toHaveBeenCalled();
      expect(result.items[0].memberCount).toBe(2);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('getGroupById', () => {
    it('should throw NotFoundException if group not found', async () => {
      groupRepoMock.findOne.mockResolvedValue(null);

      await expect(service.getGroupById('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return group with mapped member information', async () => {
      const fakeGroup = {
        id: 'grp-1',
        name: 'Study Group',
        members: [
          {
            studentId: 'std-1',
            student: { name: 'Alice', email: 'alice@uni.edu' },
            isLeader: true,
            createdAt: new Date(),
          },
        ],
      };
      groupRepoMock.findOne.mockResolvedValue(fakeGroup);

      const result = await service.getGroupById('grp-1');

      expect(result.id).toBe('grp-1');
      expect(result.members[0].studentName).toBe('Alice');
      expect(result.members[0].isLeader).toBe(true);
    });
  });

  describe('getStudentGroups', () => {
    it('should return formatted group memberships for a student', async () => {
      groupMemberRepoMock.find.mockResolvedValue([
        {
          groupId: 'grp-1',
          isLeader: true,
          createdAt: new Date(),
          group: { id: 'grp-1', name: 'Team One' },
        },
      ]);

      const result = await service.getStudentGroups('std-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('grp-1');
      expect(result[0].isLeader).toBe(true);
    });
  });

  describe('deleteGroup', () => {
    it('should throw NotFoundException if group does not exist', async () => {
      groupRepoMock.findOne.mockResolvedValue(null);

      await expect(service.deleteGroup('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should delete group and invalidate cache', async () => {
      const fakeGroup = { id: 'grp-1', name: 'Group 1' };
      groupRepoMock.findOne.mockResolvedValue(fakeGroup);

      const result = await service.deleteGroup('grp-1');

      expect(groupRepoMock.remove).toHaveBeenCalledWith(fakeGroup);
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:groups:*');
      expect(result.message).toContain('successfully deleted');
    });
  });
});
