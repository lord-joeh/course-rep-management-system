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
} from "typeorm";
import { Student } from "./student.entity";

@Entity({ name: "refresh_tokens" })
export class RefreshToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "student_id", type: "varchar", length: 255 })
  studentId: string;

  @Column({ type: "varchar", length: 255 })
  token: string; // Cryptographic SHA-256 hash of refresh token

  @Column({ name: "expires_at", type: "timestamp with time zone" })
  expiresAt: Date;

  @CreateDateColumn({
    name: "createdAt",
    type: "timestamp with time zone",
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: "updatedAt",
    type: "timestamp with time zone",
  })
  updatedAt: Date;

  @ManyToOne(() => Student, (student) => student.refreshTokens, {
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  })
  @JoinColumn({ name: "student_id" })
  student: Student;

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
