import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvitationDelivery1773139900000 implements MigrationInterface {
  name = 'AddInvitationDelivery1773139900000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "invitations" ADD "delivered_at" TIMESTAMP WITH TIME ZONE');
    // Delivery was not tracked before this migration. Preserve idempotence for
    // existing invitations whose tokens may already have reached recipients.
    await queryRunner.query('UPDATE "invitations" SET "delivered_at" = "created_at"');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "invitations" DROP COLUMN "delivered_at"');
  }
}
