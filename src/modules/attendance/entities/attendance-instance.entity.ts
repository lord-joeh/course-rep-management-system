import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import { Course } from '../../course/entities/course.entity';
import { Attendance } from './attendance.entity';

export enum ClassType {
  IN_PERSON = 'in-person',
  ONLINE = 'online',
}

@Entity('attendance_instance')
export class AttendanceInstance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  courseId: string;

  @Column({ type: 'timestamptz' })
  date: Date;

  @Column({ name: 'qr_token', type: 'text', nullable: true })
  qrToken: string | null;

  @Column({ name: 'qr_image', type: 'text', nullable: true })
  qrImage: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'double precision', nullable: true })
  latitude: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude: number | null;

  @Column({
    name: 'class_type',
    type: 'varchar',
    length: 255,
    default: ClassType.IN_PERSON,
  })
  classType: ClassType;

  @Column({ name: 'is_close', type: 'boolean', default: false })
  isClose: boolean;

  @CreateDateColumn({ name: 'createdAt', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'courseId' })
  course: Course;

  @OneToMany(() => Attendance, (att) => att.instance, { cascade: true })
  attendances: Attendance[];

  @BeforeInsert()
  setInitialDates() {
    const now = new Date();
    if (!this.createdAt) this.createdAt = now;
    if (!this.updatedAt) this.updatedAt = now;
  }

  @BeforeUpdate()
  setUpdatedDate() {
    this.updatedAt = new Date();
  }
}

