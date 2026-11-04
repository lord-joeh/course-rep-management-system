import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { AttendanceService } from './attendance.service';

export interface QRRotatePayload {
  instanceId: string;
  qrImage: string;
  token: string;
  expiresInSeconds: number;
  rotatedAt: string;
}

export interface AttendeeMarkedPayload {
  instanceId: string;
  studentId: string;
  studentName?: string;
  markedAt: Date;
  presentCount: number;
}

@WebSocketGateway({
  namespace: '/attendance-stream',
  cors: { origin: '*' },
})
export class AttendanceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AttendanceGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    @Inject(forwardRef(() => AttendanceService))
    private readonly attendanceService: AttendanceService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected to attendance stream: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from attendance stream: ${client.id}`);
    if (this.server?.sockets?.adapter?.rooms) {
      this.attendanceService.handleDisconnectCleanup((instanceId: string) => {
        const room = `instance_${instanceId}`;
        const roomSockets = this.server.sockets.adapter.rooms.get(room);
        return !roomSockets || roomSockets.size === 0;
      });
    }
  }

  /**
   * Rep client joins the real-time projection room for a specific attendance instance.
   * On-demand activation: starts 20s QR rotation stream only when a client occupies the room.
   */
  @SubscribeMessage('joinSession')
  async handleJoinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { instanceId: string },
  ) {
    if (data && data.instanceId) {
      const room = `instance_${data.instanceId}`;
      client.join(room);
      this.logger.log(`Client ${client.id} joined room ${room}`);

      const roomSockets = this.server.sockets.adapter.rooms.get(room);
      const occupantCount = roomSockets ? roomSockets.size : 1;

      // Start on-demand dynamic stream when first client enters room
      if (occupantCount === 1) {
        try {
          await this.attendanceService.startProjectionStream(data.instanceId);
        } catch (err: any) {
          this.logger.warn(`Could not start projection stream for ${data.instanceId}: ${err.message}`);
        }
      }

      return { event: 'joinedSession', data: { room, instanceId: data.instanceId } };
    }
  }

  /**
   * Rep client leaves the projection room.
   * Stops 20s QR rotation stream if no other clients remain in the room.
   */
  @SubscribeMessage('leaveSession')
  handleLeaveSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { instanceId: string },
  ) {
    if (data && data.instanceId) {
      const room = `instance_${data.instanceId}`;
      client.leave(room);
      this.logger.log(`Client ${client.id} left room ${room}`);

      const roomSockets = this.server.sockets.adapter.rooms.get(room);
      const remaining = roomSockets ? roomSockets.size : 0;

      if (remaining === 0) {
        this.attendanceService.stopProjectionStream(data.instanceId);
      }
    }
  }

  /**
   * Broadcast rotated QR code data-URL to the classroom projection room.
   */
  broadcastQRRotate(payload: QRRotatePayload) {
    if (this.server) {
      const room = `instance_${payload.instanceId}`;
      this.server.to(room).emit('qrRotate', payload);
    }
  }

  /**
   * Broadcast real-time attendee check-in notification to the classroom projector.
   */
  broadcastAttendeeMarked(payload: AttendeeMarkedPayload) {
    if (this.server) {
      const room = `instance_${payload.instanceId}`;
      this.server.to(room).emit('attendeeMarked', payload);
    }
  }

  /**
   * Broadcast session closure event to room and terminate projection.
   */
  broadcastSessionClosed(instanceId: string) {
    if (this.server) {
      const room = `instance_${instanceId}`;
      this.server.to(room).emit('sessionClosed', {
        instanceId,
        message: 'Attendance session has been closed',
      });
    }
  }
}

