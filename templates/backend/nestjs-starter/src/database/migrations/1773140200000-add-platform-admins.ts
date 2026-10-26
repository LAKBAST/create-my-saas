import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlatformAdmins1773140200000 implements MigrationInterface {
  name = 'AddPlatformAdmins1773140200000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "platform_admins" ("user_id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_platform_admins" PRIMARY KEY ("user_id"), CONSTRAINT "FK_platform_admins_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE)');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "platform_admins"');
  }
}
