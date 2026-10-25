import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubscriptionSeats1773140100000 implements MigrationInterface {
  name = 'AddSubscriptionSeats1773140100000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "subscriptions" ADD COLUMN "seats" integer NOT NULL DEFAULT 1');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "subscriptions" DROP COLUMN "seats"');
  }
}
