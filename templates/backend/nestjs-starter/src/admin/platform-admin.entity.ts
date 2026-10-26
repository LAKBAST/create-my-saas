import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from '../users/user.entity';

@Entity({ name: 'platform_admins' })
export class PlatformAdmin {
  @PrimaryColumn('uuid', { name: 'user_id' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ name: 'created_at', type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz', default: () => 'CURRENT_TIMESTAMP' }) createdAt!: Date;
}
