import { User } from '../user.entity';

export class UserPublicDto {
  id!: string;
  email!: string;
  name!: string;
  email_verified!: boolean;
  is_active!: boolean;

  static fromEntity(user: User): UserPublicDto {
    return { id: user.id, email: user.email, name: user.name, email_verified: user.emailVerified, is_active: user.isActive };
  }
}
