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
import { AssignmentSubmission } from './assignment-submission.entity';

@Entity('assignment')
export class Assignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 255 })
  description: string;

  @Column({ type: 'varchar', length: 255 })
  courseId: string;

  @Column({ type: 'timestamptz' })
  deadline: Date;

  @Column({ name: 'submissionFolderID', type: 'varchar', length: 255, nullable: true })
  submissionFolderId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fileId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fileName: string | null;

  @CreateDateColumn({ name: 'createdAt', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Course, (course) => course.assignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'courseId' })
  course: Course;

  @OneToMany(() => AssignmentSubmission, (submission) => submission.assignment, {
    cascade: true,
  })
  submissions: AssignmentSubmission[];

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

