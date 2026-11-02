import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import { Assignment } from './assignment.entity';
import { Student } from '../../student/entities/student.entity';

@Entity('assignment_submission')
export class AssignmentSubmission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  assignmentId: string;

  @Column({ type: 'varchar', length: 255 })
  studentId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fileId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fileName: string | null;

  @CreateDateColumn({ name: 'submittedAt', type: 'timestamptz' })
  submittedAt: Date;

  @CreateDateColumn({ name: 'createdAt', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Assignment, (assignment) => assignment.submissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignmentId' })
  assignment: Assignment;

  @ManyToOne(() => Student, (student) => student.assignmentSubmissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @BeforeInsert()
  setInitialDates() {
    const now = new Date();
    if (!this.submittedAt) this.submittedAt = now;
    if (!this.createdAt) this.createdAt = now;
    if (!this.updatedAt) this.updatedAt = now;
  }

  @BeforeUpdate()
  setUpdatedDate() {
    this.updatedAt = new Date();
  }
}

