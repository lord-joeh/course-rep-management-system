import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';

@Entity('google_tokens')
export class GoogleToken {
  @PrimaryColumn({ name: 'userId', type: 'varchar', length: 255 })
  userId: string;

  @Column({ name: 'client_id', type: 'varchar', length: 255 })
  clientId: string;

  @Column({ name: 'client_secret', type: 'varchar', length: 255 })
  clientSecret: string;

  @Column({ name: 'refresh_token', type: 'text' })
  refreshToken: string;

  @Column({ name: 'access_token', type: 'text', nullable: true })
  accessToken: string | null;

  @Column({ name: 'expiry_date', type: 'bigint', nullable: true })
  expiryDate: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  type: string | null;

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

