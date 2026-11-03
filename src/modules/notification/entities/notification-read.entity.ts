import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Student } from '../../student/entities/student.entity';
import { Notification } from './notification.entity';

@Entity('notification_reads')
@Index(['notificationId', 'studentId'], { unique: true })
export class NotificationRead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'notification_id', type: 'uuid' })
  notificationId: string;

  @ManyToOne(() => Notification, (notification) => notification.reads, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'notification_id' })
  notification: Notification;

  @Column({ name: 'student_id', type: 'varchar', length: 255 })
  studentId: string;

  @ManyToOne(() => Student, (student) => student.notificationReads, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @Column({ name: 'is_read', type: 'boolean', default: true })
  isRead: boolean;

  @Column({
    name: 'read_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  readAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
