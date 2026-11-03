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

@WebSocketGateway({
  namespace: '/notifications',
  cors: { origin: '*' },
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationGateway.name);

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    this.logger.log(`Client connected to notifications: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from notifications: ${client.id}`);
  }

  /**
   * Client joins general cohort broadcast room.
   */
  @SubscribeMessage('joinCohort')
  handleJoinCohort(@ConnectedSocket() client: Socket) {
    client.join('cohort:all');
    return { event: 'joinedCohort', status: 'ok' };
  }

  /**
   * Client joins a course-specific notification room.
   */
  @SubscribeMessage('joinCourse')
  handleJoinCourse(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { courseId: string },
  ) {
    if (data?.courseId) {
      const room = `course:${data.courseId}`;
      client.join(room);
      return { event: 'joinedCourse', room, status: 'ok' };
    }
    return { event: 'joinedCourse', status: 'error', message: 'Missing courseId' };
  }

  /**
   * Client joins a personal direct notification room.
   */
  @SubscribeMessage('joinUser')
  handleJoinUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { studentId: string },
  ) {
    if (data?.studentId) {
      const room = `user:${data.studentId}`;
      client.join(room);
      return { event: 'joinedUser', room, status: 'ok' };
    }
    return { event: 'joinedUser', status: 'error', message: 'Missing studentId' };
  }

  /**
   * Emit newly created notification to relevant audience.
   */
  emitNewNotification(notification: any): void {
    if (!this.server) return;

    if (notification.courseId) {
      this.server
        .to(`course:${notification.courseId}`)
        .emit('notification:new', notification);
    }
    // Also broadcast to general room / entire namespace
    this.server.emit('notification:new', notification);
  }

  /**
   * Emit updated notification.
   */
  emitUpdateNotification(notification: any): void {
    if (!this.server) return;
    this.server.emit('notification:update', notification);
  }

  /**
   * Emit deleted notification event.
   */
  emitDeleteNotification(id: string): void {
    if (!this.server) return;
    this.server.emit('notification:delete', { id });
  }

  /**
   * Emit direct message to a specific student's room.
   */
  emitDirectNotification(studentId: string, payload: any): void {
    if (!this.server) return;
    this.server.to(`user:${studentId}`).emit('notification:direct', payload);
  }
}
