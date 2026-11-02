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
import { Course } from '../../course/entities/course.entity';

@Entity('slides')
export class Slide {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'driveFileID', type: 'varchar', length: 255 })
  driveFileId: string;

  @Column({ name: 'fileName', type: 'varchar', length: 255 })
  fileName: string;

  @Column({ name: 'courseId', type: 'varchar', length: 50 })
  courseId: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  hash: string | null;

  @CreateDateColumn({ name: 'createdAt', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Course, (course) => course.slides, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'courseId' })
  course: Course;

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

