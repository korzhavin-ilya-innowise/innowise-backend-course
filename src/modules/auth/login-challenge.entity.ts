import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from '../users/user.entity';

import { ChallengeMethod, ConsumedReason } from './challenge.types';

/** Schema only in phase 1; the login flow is implemented in phase 3. */
@Entity('login_challenges')
export class LoginChallenge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_login_challenges_user_id')
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_login_challenges_user',
  })
  user?: User;

  @Column({ type: 'enum', enum: ChallengeMethod })
  method: ChallengeMethod;

  @Column({ name: 'secret_hash', type: 'varchar', length: 64 })
  secretHash: string;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'last_sent_at', type: 'timestamptz' })
  lastSentAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @Column({
    name: 'consumed_reason',
    type: 'enum',
    enum: ConsumedReason,
    nullable: true,
  })
  consumedReason: ConsumedReason | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
