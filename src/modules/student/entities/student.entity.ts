import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  BeforeInsert,
  BeforeUpdate,
} from "typeorm";
import { RefreshToken } from "./refresh-token.entity";

export enum StudentStatus {
  ACTIVE = "active",
  SUSPENDED = "suspended",
  PENDING = "pending",
}

@Entity({ name: "student" })
export class Student {
  @PrimaryColumn({ type: "varchar", length: 255 })
  id: string; // Student ID / Index Number

  @Column({ type: "varchar", length: 255, nullable: true })
  name: string;

  @Column({ type: "varchar", length: 255, unique: true, nullable: true })
  email: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  phone: string;

  @Column({
    type: "varchar",
    length: 255,
    default: StudentStatus.ACTIVE,
  })
  status: StudentStatus | string;

  @Column({
    name: "password_hash",
    type: "text",
    select: false,
    nullable: true,
  })
  passwordHash: string;

  @Column({
    name: "isRep",
    type: "boolean",
    default: false,
  })
  isRep: boolean;

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

  @OneToMany(() => RefreshToken, (token) => token.student, {
    cascade: ["remove"],
  })
  refreshTokens: RefreshToken[];

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
