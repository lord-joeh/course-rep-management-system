import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import { Course } from './course.entity';
import { Student } from '../../student/entities/student.entity';

@Entity('course_student')
export class CourseStudent {
  @PrimaryColumn({ name: 'courseId', type: 'varchar', length: 255 })
  courseId: string;

  @PrimaryColumn({ name: 'studentId', type: 'varchar', length: 255 })
  studentId: string;

  @Column({ name: 'is_register', type: 'boolean', default: true, nullable: true })
  isRegister: boolean;

  @ManyToOne(() => Course, (course) => course.enrollments, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'courseId' })
  course: Course;

  @ManyToOne(() => Student, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @CreateDateColumn({ name: 'createdAt', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt', type: 'timestamptz' })
  updatedAt: Date;

  @BeforeInsert()
  setInitialDates() {
    const now = new Date();
    if (!this.createdAt) {
      this.createdAt = now;
    }
    if (!this.updatedAt) {
      this.updatedAt = now;
    }
  }

  @BeforeUpdate()
  setUpdatedDate() {
    this.updatedAt = new Date();
  }
}

