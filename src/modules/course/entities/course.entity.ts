import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import { Lecturer } from '../../lecturer/entities/lecturer.entity';
import { CourseStudent } from './course-student.entity';
import { Slide } from '../../slide/entities/slide.entity';

@Entity('course')
export class Course {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string;

  @Column({ name: 'lecturerId', type: 'uuid', nullable: true })
  lecturerId: string | null;

  @ManyToOne(() => Lecturer, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lecturerId' })
  lecturer: Lecturer | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  day: string;

  @Column({ name: 'start_time', type: 'varchar', length: 255, nullable: true })
  startTime: string;

  @Column({ name: 'end_time', type: 'varchar', length: 255, nullable: true })
  endTime: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  semester: string;

  @Column({ name: 'slidesFolderID', type: 'varchar', length: 255, nullable: true })
  slidesFolderId: string | null;

  @OneToMany(() => CourseStudent, (cs) => cs.course)
  enrollments: CourseStudent[];

  @OneToMany(() => Slide, (s) => s.course)
  slides: Slide[];

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

