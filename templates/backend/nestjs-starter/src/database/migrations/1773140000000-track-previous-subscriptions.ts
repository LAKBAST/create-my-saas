import { MigrationInterface, QueryRunner } from 'typeorm';

export class TrackPreviousSubscriptions1773140000000 implements MigrationInterface {
  name = 'TrackPreviousSubscriptions1773140000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD COLUMN "previous_subscription_ids" text NOT NULL DEFAULT '[]'`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "subscriptions" DROP COLUMN "previous_subscription_ids"');
  }
}
