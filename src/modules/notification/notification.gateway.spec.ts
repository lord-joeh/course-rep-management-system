import { Test, TestingModule } from '@nestjs/testing';
import { NotificationGateway } from './notification.gateway';
import { Socket } from 'socket.io';

describe('NotificationGateway', () => {
  let gateway: NotificationGateway;
  let socketMock: {
    id: string;
    join: jest.Mock;
    leave: jest.Mock;
  };
  let serverMock: {
    emit: jest.Mock;
    to: jest.Mock;
  };
  let roomMock: {
    emit: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    socketMock = {
      id: 'socket-123',
      join: jest.fn(),
      leave: jest.fn(),
    };

    roomMock = {
      emit: jest.fn(),
    };

    serverMock = {
      emit: jest.fn(),
      to: jest.fn().mockReturnValue(roomMock),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationGateway],
    }).compile();

    gateway = module.get<NotificationGateway>(NotificationGateway);
    gateway.server = serverMock as any;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('connection / disconnection', () => {
    it('should log connection', () => {
      expect(() =>
        gateway.handleConnection(socketMock as unknown as Socket),
      ).not.toThrow();
    });

    it('should log disconnection', () => {
      expect(() =>
        gateway.handleDisconnect(socketMock as unknown as Socket),
      ).not.toThrow();
    });
  });

  describe('rooms', () => {
    it('should join cohort:all room', () => {
      const res = gateway.handleJoinCohort(socketMock as unknown as Socket);
      expect(socketMock.join).toHaveBeenCalledWith('cohort:all');
      expect(res).toEqual({ event: 'joinedCohort', status: 'ok' });
    });

    it('should join course room when courseId provided', () => {
      const res = gateway.handleJoinCourse(socketMock as unknown as Socket, {
        courseId: 'csc-301',
      });
      expect(socketMock.join).toHaveBeenCalledWith('course:csc-301');
      expect(res).toEqual({
        event: 'joinedCourse',
        room: 'course:csc-301',
        status: 'ok',
      });
    });

    it('should return error when courseId is missing', () => {
      const res = gateway.handleJoinCourse(
        socketMock as unknown as Socket,
        {} as any,
      );
      expect(socketMock.join).not.toHaveBeenCalled();
      expect(res.status).toBe('error');
    });

    it('should join personal user room when studentId provided', () => {
      const res = gateway.handleJoinUser(socketMock as unknown as Socket, {
        studentId: 'student-99',
      });
      expect(socketMock.join).toHaveBeenCalledWith('user:student-99');
      expect(res).toEqual({
        event: 'joinedUser',
        room: 'user:student-99',
        status: 'ok',
      });
    });

    it('should return error when studentId is missing', () => {
      const res = gateway.handleJoinUser(
        socketMock as unknown as Socket,
        {} as any,
      );
      expect(socketMock.join).not.toHaveBeenCalled();
      expect(res.status).toBe('error');
    });
  });

  describe('event emitters', () => {
    it('should emit new general notification', () => {
      const notification = {
        id: 'notif-1',
        title: 'Welcome',
        courseId: null,
      };
      gateway.emitNewNotification(notification);

      expect(serverMock.emit).toHaveBeenCalledWith(
        'notification:new',
        notification,
      );
      expect(serverMock.to).not.toHaveBeenCalled();
    });

    it('should emit new course-specific notification to course room and server', () => {
      const notification = {
        id: 'notif-2',
        title: 'Assignment Released',
        courseId: 'csc-301',
      };
      gateway.emitNewNotification(notification);

      expect(serverMock.to).toHaveBeenCalledWith('course:csc-301');
      expect(roomMock.emit).toHaveBeenCalledWith(
        'notification:new',
        notification,
      );
      expect(serverMock.emit).toHaveBeenCalledWith(
        'notification:new',
        notification,
      );
    });

    it('should emit update notification', () => {
      const notification = { id: 'notif-1', title: 'Updated Title' };
      gateway.emitUpdateNotification(notification);

      expect(serverMock.emit).toHaveBeenCalledWith(
        'notification:update',
        notification,
      );
    });

    it('should emit delete notification', () => {
      gateway.emitDeleteNotification('notif-1');

      expect(serverMock.emit).toHaveBeenCalledWith('notification:delete', {
        id: 'notif-1',
      });
    });

    it('should emit direct notification to user room', () => {
      const payload = { title: 'Direct Alert', message: 'See rep ASAP' };
      gateway.emitDirectNotification('student-123', payload);

      expect(serverMock.to).toHaveBeenCalledWith('user:student-123');
      expect(roomMock.emit).toHaveBeenCalledWith(
        'notification:direct',
        payload,
      );
    });

    it('should handle undefined server gracefully', () => {
      gateway.server = undefined as any;
      expect(() => gateway.emitNewNotification({})).not.toThrow();
      expect(() => gateway.emitUpdateNotification({})).not.toThrow();
      expect(() => gateway.emitDeleteNotification('1')).not.toThrow();
      expect(() => gateway.emitDirectNotification('1', {})).not.toThrow();
    });
  });
});
