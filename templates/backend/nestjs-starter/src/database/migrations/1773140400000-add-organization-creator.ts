import { MigrationInterface, QueryRunner } from 'typeorm';

/** Preserve provenance independently of later ownership transfers. */
export class AddOrganizationCreator1773140400000 implements MigrationInterface {
  name = 'AddOrganizationCreator1773140400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "organizations" ADD COLUMN "created_by_id" uuid NULL
      CONSTRAINT "fk_organizations_creator" REFERENCES "users"("id") ON DELETE NO ACTION`);
    await queryRunner.query(`UPDATE "organizations" AS organization SET "created_by_id" = (
      SELECT membership."user_id" FROM "memberships" AS membership
      WHERE membership."organization_id" = organization."id" AND membership."role" = 'owner'
      ORDER BY membership."created_at" ASC, membership."id" ASC LIMIT 1
    )`);
    const [result] = await queryRunner.query(
      'SELECT COUNT(*)::text AS count FROM "organizations" WHERE "created_by_id" IS NULL',
    ) as Array<{ count: string }>;
    const unresolved = Number(result.count);
    queryRunner.connection.logger.log('info', `Organization creator backfill: ${unresolved} organizations without an owner.`);
    if (unresolved === 0) {
      await queryRunner.query('ALTER TABLE "organizations" ALTER COLUMN "created_by_id" SET NOT NULL');
    } else {
      queryRunner.connection.logger.log('warn', `Keeping organizations.created_by_id nullable: ${unresolved} organizations have no owner. No creator was invented.`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "organizations" DROP COLUMN "created_by_id"');
  }
}
