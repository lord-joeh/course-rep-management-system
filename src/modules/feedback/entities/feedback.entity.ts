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
import { Course } from '../../course/entities/course.entity';

export enum FeedbackCategory {
  ACADEMIC = 'academic',
  FACILITIES = 'facilities',
  LECTURER = 'lecturer',
  WELFARE = 'welfare',
  GENERAL = 'general',
  OTHER = 'other',
}

export enum FeedbackPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum FeedbackStatus {
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

@Entity('feedback')
export class Feedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'studentId', type: 'varchar', length: 255, nullable: true })
  studentId: string | null;

  @ManyToOne(() => Student, (student) => student.feedbacks, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'studentId' })
  student: Student | null;

  @Index()
  @Column({ name: 'course_id', type: 'varchar', length: 255, nullable: true })
  courseId: string | null;

  @ManyToOne(() => Course, (course) => course.feedbacks, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'course_id' })
  course: Course | null;

  @Column({
    type: 'varchar',
    length: 50,
    default: FeedbackCategory.GENERAL,
  })
  category: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'is_anonymous', type: 'boolean', default: false })
  isAnonymous: boolean;

  @Column({
    type: 'varchar',
    length: 50,
    default: FeedbackPriority.MEDIUM,
  })
  priority: string;

  @Index()
  @Column({
    type: 'varchar',
    length: 50,
    default: FeedbackStatus.SUBMITTED,
  })
  status: string;

  @Column({ name: 'rep_response', type: 'text', nullable: true })
  repResponse: string | null;

  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt: Date | null;

  @Column({ name: 'responded_by', type: 'varchar', length: 255, nullable: true })
  respondedBy: string | null;

  @CreateDateColumn({ name: 'createdAt', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt', type: 'timestamptz' })
  updatedAt: Date;
}
