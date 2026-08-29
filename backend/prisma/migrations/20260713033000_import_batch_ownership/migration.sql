ALTER TABLE "import_batches" ADD COLUMN "user_id" UUID;

UPDATE "import_batches" ib
SET "user_id" = w."owner_user_id"
FROM "broker_accounts" ba
JOIN "portfolios" p ON p."id" = ba."portfolio_id"
JOIN "workspaces" w ON w."id" = p."workspace_id"
WHERE ib."account_id" = ba."id" AND ib."user_id" IS NULL;

DELETE FROM "import_batches" WHERE "user_id" IS NULL;
ALTER TABLE "import_batches" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "import_batches_user_id_created_at_idx" ON "import_batches"("user_id", "created_at");
