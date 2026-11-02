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
import { Course } from '../../course/entities/course.entity';

export enum EventType {
  LECTURE = 'lecture',
  TUTORIAL = 'tutorial',
  EXAM = 'exam',
  DEADLINE = 'deadline',
  MEETING = 'meeting',
  SEMINAR = 'seminar',
  OTHER = 'other',
}

export enum RecurrenceFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  BIWEEKLY = 'biweekly',
  MONTHLY = 'monthly',
}

@Entity('event')
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'event_type',
    type: 'varchar',
    length: 50,
    default: EventType.MEETING,
  })
  eventType: string;

  @Column({ name: 'course_id', type: 'varchar', length: 255, nullable: true })
  courseId: string | null;

  @ManyToOne(() => Course, (course) => course.events, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'course_id' })
  course: Course | null;

  @Index()
  @Column({ name: 'start_date', type: 'timestamptz' })
  startDate: Date;

  @Index()
  @Column({ name: 'end_date', type: 'timestamptz' })
  endDate: Date;

  @Column({ type: 'varchar', length: 255 })
  venue: string;

  @Column({ name: 'meeting_link', type: 'varchar', length: 500, nullable: true })
  meetingLink: string | null;

  @Column({ name: 'is_cancelled', type: 'boolean', default: false })
  isCancelled: boolean;

  // Recurring Event Engine
  @Column({ name: 'is_recurring', type: 'boolean', default: false })
  isRecurring: boolean;

  @Column({
    name: 'recurrence_frequency',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  recurrenceFrequency: string | null;

  @Column({ name: 'recurrence_interval', type: 'int', default: 1 })
  recurrenceInterval: number;

  @Column({
    name: 'recurrence_days_of_week',
    type: 'jsonb',
    nullable: true,
  })
  recurrenceDaysOfWeek: number[] | null;

  @Column({ name: 'recurrence_end_date', type: 'timestamptz', nullable: true })
  recurrenceEndDate: Date | null;

  @Column({ name: 'recurrence_count', type: 'int', nullable: true })
  recurrenceCount: number | null;

  @Index()
  @Column({ name: 'recurrence_series_id', type: 'uuid', nullable: true })
  recurrenceSeriesId: string | null;

  // Legacy schema compatibility fields
  @Column({ type: 'timestamptz', nullable: true })
  date: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  time: string | null;

  @CreateDateColumn({ name: 'createdAt', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt', type: 'timestamptz' })
  updatedAt: Date;
}

