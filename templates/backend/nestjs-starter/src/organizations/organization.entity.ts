import { BeforeInsert, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { randomUUID } from 'node:crypto';
const dateType: 'datetime' | 'timestamptz' = process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz';
@Entity({ name: 'organizations' })
export class Organization {
 @PrimaryColumn('uuid') id!: string;
 @Column() name!: string;
 @Column({ unique: true }) slug!: string;
 @Column({ name: 'personal_owner_user_id', type: 'uuid', nullable: true, unique: true }) personalOwnerUserId!: string | null;
 @ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
 @JoinColumn({ name: 'personal_owner_user_id' }) personalOwner!: User | null;
 @Column({ name: 'created_at', type: dateType, default: () => 'CURRENT_TIMESTAMP' }) createdAt!: Date;
 @Column({ name: 'updated_at', type: dateType, default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' }) updatedAt!: Date;
 @BeforeInsert() assignId(): void { this.id ??= randomUUID(); }
}
