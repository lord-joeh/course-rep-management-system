import { Test, TestingModule } from '@nestjs/testing';
import { GroupController } from './group.controller';
import { GroupService } from './group.service';
import {
  CreateGroupDto,
  UpdateGroupDto,
  AutomatedGroupDivisionDto,
  AddGroupMemberDto,
  GroupQueryDto,
} from './dto';
import { AuthenticatedUser } from '../../common/types/jwt-payload.interface';

describe('GroupController', () => {
  let controller: GroupController;
  let serviceMock: {
    createGroup: jest.Mock;
    divideStudents: jest.Mock;
    getGroups: jest.Mock;
    getStudentGroups: jest.Mock;
    getGroupById: jest.Mock;
    updateGroup: jest.Mock;
    deleteGroup: jest.Mock;
    addGroupMember: jest.Mock;
    removeGroupMember: jest.Mock;
    setGroupLeader: jest.Mock;
  };

  const userMock: AuthenticatedUser = {
    id: 'student-uuid-1',
    email: 'student@uni.edu',
    name: 'Student Name',
    phone: '1234567890',
    isRep: false,
    role: 'STUDENT',
    status: 'active',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    serviceMock = {
      createGroup: jest.fn(),
      divideStudents: jest.fn(),
      getGroups: jest.fn(),
      getStudentGroups: jest.fn(),
      getGroupById: jest.fn(),
      updateGroup: jest.fn(),
      deleteGroup: jest.fn(),
      addGroupMember: jest.fn(),
      removeGroupMember: jest.fn(),
      setGroupLeader: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GroupController],
      providers: [
        {
          provide: GroupService,
          useValue: serviceMock,
        },
      ],
    }).compile();

    controller = module.get<GroupController>(GroupController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createGroup', () => {
    it('should call service.createGroup with given dto', async () => {
      const dto: CreateGroupDto = {
        name: 'Project Alpha',
        courseId: 'CSC101',
        isGeneral: false,
      };
      serviceMock.createGroup.mockResolvedValue({ id: 'grp-1', ...dto });

      const result = await controller.createGroup(dto);

      expect(serviceMock.createGroup).toHaveBeenCalledWith(dto);
      expect(result.id).toBe('grp-1');
    });
  });

  describe('divideStudents', () => {
    it('should call service.divideStudents with division parameters', async () => {
      const dto: AutomatedGroupDivisionDto = {
        courseId: 'CSC101',
        studentsPerGroup: 3,
        namingPrefix: 'Team',
        autoAssignLeader: true,
      };
      serviceMock.divideStudents.mockResolvedValue({
        totalGroups: 2,
        totalStudents: 6,
        groups: [],
      });

      const result = await controller.divideStudents(dto);

      expect(serviceMock.divideStudents).toHaveBeenCalledWith(dto);
      expect(result.totalGroups).toBe(2);
    });
  });

  describe('getGroups', () => {
    it('should call service.getGroups with query filter', async () => {
      const query: GroupQueryDto = {
        page: 1,
        limit: 10,
        courseId: 'CSC101',
      };
      serviceMock.getGroups.mockResolvedValue({
        items: [],
        meta: { total: 0, page: 1, limit: 10, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
      });

      const result = await controller.getGroups(query);

      expect(serviceMock.getGroups).toHaveBeenCalledWith(query);
      expect(result.items).toEqual([]);
    });
  });

  describe('getMyGroups', () => {
    it('should retrieve groups for authenticated student', async () => {
      serviceMock.getStudentGroups.mockResolvedValue([{ id: 'grp-1', name: 'Alpha' }]);

      const result = await controller.getMyGroups(userMock);

      expect(serviceMock.getStudentGroups).toHaveBeenCalledWith(userMock.id);
      expect(result).toHaveLength(1);
    });
  });

  describe('getStudentGroups', () => {
    it('should retrieve groups for specific student id', async () => {
      serviceMock.getStudentGroups.mockResolvedValue([{ id: 'grp-2', name: 'Beta' }]);

      const result = await controller.getStudentGroups('student-uuid-99');

      expect(serviceMock.getStudentGroups).toHaveBeenCalledWith('student-uuid-99');
      expect(result[0].name).toBe('Beta');
    });
  });

  describe('getGroupById', () => {
    it('should retrieve single group with populated details', async () => {
      serviceMock.getGroupById.mockResolvedValue({ id: 'grp-1', name: 'Alpha' });

      const result = await controller.getGroupById('grp-1');

      expect(serviceMock.getGroupById).toHaveBeenCalledWith('grp-1');
      expect(result.id).toBe('grp-1');
    });
  });

  describe('updateGroup', () => {
    it('should update group with provided dto', async () => {
      const dto: UpdateGroupDto = { name: 'Renamed Alpha' };
      serviceMock.updateGroup.mockResolvedValue({ id: 'grp-1', name: 'Renamed Alpha' });

      const result = await controller.updateGroup('grp-1', dto);

      expect(serviceMock.updateGroup).toHaveBeenCalledWith('grp-1', dto);
      expect(result.name).toBe('Renamed Alpha');
    });
  });

  describe('deleteGroup', () => {
    it('should delete target group', async () => {
      serviceMock.deleteGroup.mockResolvedValue({ message: 'Group successfully deleted' });

      const result = await controller.deleteGroup('grp-1');

      expect(serviceMock.deleteGroup).toHaveBeenCalledWith('grp-1');
      expect(result.message).toContain('successfully deleted');
    });
  });

  describe('addGroupMember', () => {
    it('should add student to group', async () => {
      const dto: AddGroupMemberDto = { studentId: 'student-uuid-2', isLeader: false };
      serviceMock.addGroupMember.mockResolvedValue({ groupId: 'grp-1', ...dto });

      const result = await controller.addGroupMember('grp-1', dto);

      expect(serviceMock.addGroupMember).toHaveBeenCalledWith('grp-1', dto);
      expect(result.studentId).toBe('student-uuid-2');
    });
  });

  describe('removeGroupMember', () => {
    it('should remove student from group', async () => {
      serviceMock.removeGroupMember.mockResolvedValue({ message: 'Student successfully removed' });

      const result = await controller.removeGroupMember('grp-1', 'student-uuid-2');

      expect(serviceMock.removeGroupMember).toHaveBeenCalledWith('grp-1', 'student-uuid-2');
      expect(result.message).toContain('successfully removed');
    });
  });

  describe('setGroupLeader', () => {
    it('should designate student as group leader', async () => {
      serviceMock.setGroupLeader.mockResolvedValue({
        message: 'Group leader successfully assigned',
        leaderId: 'student-uuid-2',
      });

      const result = await controller.setGroupLeader('grp-1', 'student-uuid-2');

      expect(serviceMock.setGroupLeader).toHaveBeenCalledWith('grp-1', 'student-uuid-2');
      expect(result.leaderId).toBe('student-uuid-2');
    });
  });
});

