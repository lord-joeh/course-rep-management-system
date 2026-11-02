import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

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

  handleConnection(client: Socket) {
    this.logger.log(`Client connected to attendance stream: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from attendance stream: ${client.id}`);
  }

  /**
   * Rep client joins the real-time projection room for a specific attendance instance.
   */
  @SubscribeMessage('joinSession')
  handleJoinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { instanceId: string },
  ) {
    if (data && data.instanceId) {
      const room = `instance_${data.instanceId}`;
      client.join(room);
      this.logger.log(`Client ${client.id} joined room ${room}`);
      return { event: 'joinedSession', data: { room, instanceId: data.instanceId } };
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

