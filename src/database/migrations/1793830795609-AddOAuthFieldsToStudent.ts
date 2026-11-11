import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOAuthFieldsToStudent1793830795609 implements MigrationInterface {
  name = 'AddOAuthFieldsToStudent1793830795609';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Defensively add nullable OAuth columns
    await queryRunner.query(
      `ALTER TABLE "student" ADD COLUMN IF NOT EXISTS "google_id" character varying(255)`
    );
    await queryRunner.query(
      `ALTER TABLE "student" ADD COLUMN IF NOT EXISTS "apple_id" character varying(255)`
    );
    await queryRunner.query(
      `ALTER TABLE "student" ADD COLUMN IF NOT EXISTS "avatar_url" text`
    );

    // 2. Create partial unique indexes (ignoring NULLs) for fast lookups & zero conflicts
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_student_google_id" ON "student" ("google_id") WHERE "google_id" IS NOT NULL`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_student_apple_id" ON "student" ("apple_id") WHERE "apple_id" IS NOT NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_student_apple_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_student_google_id"`);
    await queryRunner.query(`ALTER TABLE "student" DROP COLUMN IF EXISTS "avatar_url"`);
    await queryRunner.query(`ALTER TABLE "student" DROP COLUMN IF EXISTS "apple_id"`);
    await queryRunner.query(`ALTER TABLE "student" DROP COLUMN IF EXISTS "google_id"`);
  }
}

