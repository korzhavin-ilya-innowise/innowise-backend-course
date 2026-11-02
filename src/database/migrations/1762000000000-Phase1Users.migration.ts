import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase1Users1762000000000 implements MigrationInterface {
  name = 'Phase1Users1762000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await q.query(
      `CREATE TYPE "users_status_enum" AS ENUM ('pending', 'active', 'blocked', 'deleting', 'deleted')`,
    );
    await q.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" character varying(320) NOT NULL,
        "password_hash" text NOT NULL,
        "status" "users_status_enum" NOT NULL DEFAULT 'pending',
        "display_name" character varying(100),
        "photo_key" character varying(512),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);
    await q.query(
      `CREATE TYPE "registration_challenges_method_enum" AS ENUM ('otp', 'magic_link')`,
    );
    await q.query(
      `CREATE TYPE "registration_challenges_consumed_reason_enum" AS ENUM ('confirmed', 'replaced', 'attempts_exhausted', 'user_inactive')`,
    );
    await q.query(`
      CREATE TABLE "registration_challenges" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "method" "registration_challenges_method_enum" NOT NULL,
        "secret_hash" character varying(64) NOT NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "last_sent_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "consumed_at" TIMESTAMP WITH TIME ZONE,
        "consumed_reason" "registration_challenges_consumed_reason_enum",
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_registration_challenges" PRIMARY KEY ("id"),
        CONSTRAINT "FK_registration_challenges_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await q.query(
      `CREATE INDEX "IDX_registration_challenges_user_id" ON "registration_challenges" ("user_id")`,
    );
    await q.query(
      `CREATE TYPE "login_challenges_method_enum" AS ENUM ('otp', 'magic_link')`,
    );
    await q.query(
      `CREATE TYPE "login_challenges_consumed_reason_enum" AS ENUM ('confirmed', 'replaced', 'attempts_exhausted', 'user_inactive')`,
    );
    await q.query(`
      CREATE TABLE "login_challenges" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "method" "login_challenges_method_enum" NOT NULL,
        "secret_hash" character varying(64) NOT NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "last_sent_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "consumed_at" TIMESTAMP WITH TIME ZONE,
        "consumed_reason" "login_challenges_consumed_reason_enum",
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_login_challenges" PRIMARY KEY ("id"),
        CONSTRAINT "FK_login_challenges_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await q.query(
      `CREATE INDEX "IDX_login_challenges_user_id" ON "login_challenges" ("user_id")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "login_challenges"`);
    await q.query(`DROP TYPE "login_challenges_consumed_reason_enum"`);
    await q.query(`DROP TYPE "login_challenges_method_enum"`);
    await q.query(`DROP TABLE "registration_challenges"`);
    await q.query(`DROP TYPE "registration_challenges_consumed_reason_enum"`);
    await q.query(`DROP TYPE "registration_challenges_method_enum"`);
    await q.query(`DROP TABLE "users"`);
    await q.query(`DROP TYPE "users_status_enum"`);
  }
}
