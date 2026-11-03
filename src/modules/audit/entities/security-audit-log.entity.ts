import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum AuditSeverity {
  INFO = 'INFO',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum AuditAction {
  // Authentication & Session
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  PASSWORD_RESET_REQUEST = 'PASSWORD_RESET_REQUEST',
  PASSWORD_RESET_SUCCESS = 'PASSWORD_RESET_SUCCESS',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',

  // Attendance
  ATTENDANCE_INITIALIZED = 'ATTENDANCE_INITIALIZED',
  ATTENDANCE_MARKED = 'ATTENDANCE_MARKED',
  ATTENDANCE_GEOFENCE_BREACH = 'ATTENDANCE_GEOFENCE_BREACH',
  ATTENDANCE_MANUAL_OVERRIDE = 'ATTENDANCE_MANUAL_OVERRIDE',
  ATTENDANCE_SESSION_CLOSED = 'ATTENDANCE_SESSION_CLOSED',

  // Course & Roster Management
  STUDENT_CREATED = 'STUDENT_CREATED',
  STUDENT_UPDATED = 'STUDENT_UPDATED',
  STUDENT_DELETED = 'STUDENT_DELETED',
  COURSE_CREATED = 'COURSE_CREATED',
  COURSE_DELETED = 'COURSE_DELETED',
  GROUP_DIVIDED = 'GROUP_DIVIDED',

  // Drive & File Sync
  DRIVE_FILE_UPLOADED = 'DRIVE_FILE_UPLOADED',
  DRIVE_FILE_DELETED = 'DRIVE_FILE_DELETED',

  // Security & Defenses
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTEGRITY_VERIFICATION = 'INTEGRITY_VERIFICATION',
  SYSTEM_ALERT = 'SYSTEM_ALERT',
}

export enum AuditResource {
  AUTH = 'AUTH',
  ATTENDANCE = 'ATTENDANCE',
  STUDENT = 'STUDENT',
  COURSE = 'COURSE',
  DRIVE = 'DRIVE',
  GROUP = 'GROUP',
  FEEDBACK = 'FEEDBACK',
  NOTIFICATION = 'NOTIFICATION',
  SYSTEM = 'SYSTEM',
}

@Entity('security_audit_logs')
export class SecurityAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'bigint' })
  sequenceNumber: number;

  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  timestamp: Date;

  @Index()
  @Column({ type: 'varchar', nullable: true })
  actorId: string | null;

  @Column({ type: 'varchar', default: 'ANONYMOUS' })
  actorRole: string;

  @Column({ type: 'varchar', nullable: true })
  actorEmail: string | null;

  @Index()
  @Column({ type: 'enum', enum: AuditAction })
  action: AuditAction;

  @Index()
  @Column({ type: 'enum', enum: AuditSeverity, default: AuditSeverity.INFO })
  severity: AuditSeverity;

  @Index()
  @Column({ type: 'varchar', default: AuditResource.SYSTEM })
  resource: string;

  @Column({ type: 'varchar', nullable: true })
  resourceId: string | null;

  @Column({ type: 'varchar', default: '127.0.0.1' })
  ipAddress: string;

  @Column({ type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ type: 'jsonb', default: {} })
  details: Record<string, any>;

  @Column({ type: 'varchar', length: 64 })
  previousHash: string;

  @Column({ type: 'varchar', length: 64 })
  currentHash: string;
}

