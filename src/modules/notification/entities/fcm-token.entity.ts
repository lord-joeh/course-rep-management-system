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

@Entity('fcm_tokens')
@Index(['studentId', 'token'], { unique: true })
export class FcmToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'student_id', type: 'varchar', length: 255 })
  studentId: string;

  @ManyToOne(() => Student, (student) => student.fcmTokens, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @Index()
  @Column({ type: 'text' })
  token: string;

  @Column({ name: 'device_type', type: 'varchar', length: 50, default: 'web' })
  deviceType: string;

  @Index()
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
