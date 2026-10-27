import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPersonalWorkspaces1773140300000 implements MigrationInterface {
  name = 'AddPersonalWorkspaces1773140300000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE "organizations" ADD COLUMN "personal_owner_user_id" uuid NULL');
    await runner.query('ALTER TABLE "organizations" ADD CONSTRAINT "UQ_organizations_personal_owner" UNIQUE ("personal_owner_user_id")');
    await runner.query('ALTER TABLE "organizations" ADD CONSTRAINT "FK_organizations_personal_owner" FOREIGN KEY ("personal_owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE');
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE "organizations" DROP CONSTRAINT "FK_organizations_personal_owner"');
    await runner.query('ALTER TABLE "organizations" DROP CONSTRAINT "UQ_organizations_personal_owner"');
    await runner.query('ALTER TABLE "organizations" DROP COLUMN "personal_owner_user_id"');
  }
}
