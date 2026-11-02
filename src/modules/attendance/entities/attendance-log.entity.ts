import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';

@Entity('attendance_logs')
export class AttendanceLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'student_id', type: 'varchar', length: 255 })
  studentId: string;

  @Column({ name: 'instance_id', type: 'varchar', length: 255 })
  instanceId: string;

  @Column({ name: 'location_checked', type: 'boolean', default: false })
  locationChecked: boolean;

  @Column({ name: 'location_valid', type: 'boolean', default: false })
  locationValid: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  details: string;

  @CreateDateColumn({ name: 'createdAt', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt', type: 'timestamptz' })
  updatedAt: Date;

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

