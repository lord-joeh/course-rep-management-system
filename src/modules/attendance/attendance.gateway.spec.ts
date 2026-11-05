import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceGateway } from './attendance.gateway';
import { AttendanceService } from './attendance.service';

describe('AttendanceGateway', () => {
  let gateway: AttendanceGateway;
  let serverMock: {
    to: jest.Mock;
    emit: jest.Mock;
    adapter?: any;
  };
  let attendanceServiceMock: {
    startProjectionStream: jest.Mock;
    stopProjectionStream: jest.Mock;
    handleDisconnectCleanup: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    serverMock = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      adapter: {
        rooms: new Map(),
      },
    };

    attendanceServiceMock = {
      startProjectionStream: jest.fn().mockResolvedValue(undefined),
      stopProjectionStream: jest.fn().mockReturnValue(undefined),
      handleDisconnectCleanup: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceGateway,
        {
          provide: AttendanceService,
          useValue: attendanceServiceMock,
        },
      ],
    }).compile();

    gateway = module.get<AttendanceGateway>(AttendanceGateway);
    gateway.server = serverMock as any;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('connection lifecycle', () => {
    it('should handle client connection and disconnection without error', () => {
      const client = { id: 'sock-123' } as any;
      expect(() => gateway.handleConnection(client)).not.toThrow();
      expect(() => gateway.handleDisconnect(client)).not.toThrow();
      expect(attendanceServiceMock.handleDisconnectCleanup).toHaveBeenCalled();
    });
  });

  describe('handleJoinSession', () => {
    it('should allow client to join attendance instance room and start stream when first occupant', async () => {
      const client = { id: 'sock-123', join: jest.fn() } as any;
      const res = await gateway.handleJoinSession(client, { instanceId: 'inst-1' });

      expect(client.join).toHaveBeenCalledWith('instance_inst-1');
      expect(attendanceServiceMock.startProjectionStream).toHaveBeenCalledWith('inst-1');
      expect(res).toEqual({
        event: 'joinedSession',
        data: { room: 'instance_inst-1', instanceId: 'inst-1' },
      });
    });

    it('should ignore join request if instanceId is missing', async () => {
      const client = { id: 'sock-123', join: jest.fn() } as any;
      const res = await gateway.handleJoinSession(client, null as any);

      expect(client.join).not.toHaveBeenCalled();
      expect(res).toBeUndefined();
    });
  });

  describe('handleLeaveSession', () => {
    it('should leave room and stop stream when room is empty', () => {
      const client = { id: 'sock-123', leave: jest.fn() } as any;
      gateway.handleLeaveSession(client, { instanceId: 'inst-1' });

      expect(client.leave).toHaveBeenCalledWith('instance_inst-1');
      expect(attendanceServiceMock.stopProjectionStream).toHaveBeenCalledWith('inst-1');
    });

    it('should ignore leave request if instanceId is missing', () => {
      const client = { id: 'sock-123', leave: jest.fn() } as any;
      expect(() => gateway.handleLeaveSession(client, null as any)).not.toThrow();
      expect(client.leave).not.toHaveBeenCalled();
    });
  });

  describe('broadcastQRRotate', () => {
    it('should broadcast qrRotate event to room', () => {
      const payload = {
        instanceId: 'inst-1',
        qrImage: 'data:image/png;base64,...',
        token: 'tok-1',
        expiresInSeconds: 20,
        rotatedAt: new Date().toISOString(),
      };

      gateway.broadcastQRRotate(payload);

      expect(serverMock.to).toHaveBeenCalledWith('instance_inst-1');
      expect(serverMock.emit).toHaveBeenCalledWith('qrRotate', payload);
    });

    it('should handle null server safely', () => {
      gateway.server = null as any;
      expect(() =>
        gateway.broadcastQRRotate({ instanceId: 'inst-1' } as any),
      ).not.toThrow();
    });
  });

  describe('broadcastAttendeeMarked', () => {
    it('should broadcast attendeeMarked event to room', () => {
      const payload = {
        instanceId: 'inst-1',
        studentId: 'st-1',
        studentName: 'Alice',
        markedAt: new Date(),
        presentCount: 15,
      };

      gateway.broadcastAttendeeMarked(payload);

      expect(serverMock.to).toHaveBeenCalledWith('instance_inst-1');
      expect(serverMock.emit).toHaveBeenCalledWith('attendeeMarked', payload);
    });

    it('should handle null server safely', () => {
      gateway.server = null as any;
      expect(() =>
        gateway.broadcastAttendeeMarked({ instanceId: 'inst-1' } as any),
      ).not.toThrow();
    });
  });

  describe('broadcastSessionClosed', () => {
    it('should broadcast sessionClosed event to room', () => {
      gateway.broadcastSessionClosed('inst-1');

      expect(serverMock.to).toHaveBeenCalledWith('instance_inst-1');
      expect(serverMock.emit).toHaveBeenCalledWith(
        'sessionClosed',
        expect.objectContaining({ instanceId: 'inst-1' }),
      );
    });

    it('should handle null server safely', () => {
      gateway.server = null as any;
      expect(() => gateway.broadcastSessionClosed('inst-1')).not.toThrow();
    });
  });
});

