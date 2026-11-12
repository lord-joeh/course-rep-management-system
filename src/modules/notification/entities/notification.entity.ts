import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Student } from '../../student/entities/student.entity';
import { Course } from '../../course/entities/course.entity';
import { NotificationRead } from './notification-read.entity';

export enum NotificationType {
  ANNOUNCEMENT = 'announcement',
  ASSIGNMENT = 'assignment',
  ATTENDANCE = 'attendance',
  EVENT = 'event',
  FEEDBACK = 'feedback',
  SYSTEM = 'system',
  SLIDE = 'slide',
}

export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

@Entity('notification')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Index()
  @Column({
    type: 'varchar',
    length: 50,
    default: NotificationType.ANNOUNCEMENT,
  })
  type: NotificationType;

  @Index()
  @Column({
    type: 'varchar',
    length: 50,
    default: NotificationPriority.NORMAL,
  })
  priority: NotificationPriority;

  @Index()
  @Column({ name: 'sender_id', type: 'varchar', length: 255, nullable: true })
  senderId: string | null;

  @ManyToOne(() => Student, (student) => student.notificationsSent, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'sender_id' })
  sender: Student | null;

  @Index()
  @Column({ name: 'course_id', type: 'varchar', length: 255, nullable: true })
  courseId: string | null;

  @ManyToOne(() => Course, (course) => course.notifications, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'course_id' })
  course: Course | null;

  @OneToMany(() => NotificationRead, (nr) => nr.notification, {
    cascade: true,
  })
  reads: NotificationRead[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  // Virtual property populated dynamically per requesting student
  isRead?: boolean;
}
