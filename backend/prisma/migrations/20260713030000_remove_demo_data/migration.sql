-- Remove only the development fixtures that shipped with the original MVP.
-- User-entered records and reference catalogs are intentionally preserved.
DELETE FROM "latest_market_quotes" WHERE "provider" = 'DEMO';
DELETE FROM "market_prices" WHERE "provider" = 'DEMO';

DELETE FROM "audit_logs"
WHERE "actor_user_id" IN (SELECT "id" FROM "users" WHERE "email" = 'demo@miportafolio.co');

DELETE FROM "workspaces"
WHERE "owner_user_id" IN (SELECT "id" FROM "users" WHERE "email" = 'demo@miportafolio.co');

DELETE FROM "users" WHERE "email" = 'demo@miportafolio.co';

DELETE FROM "assets" a
WHERE a."symbol" IN ('NVDA', 'VOO', 'KO', 'IGLN')
  AND NOT EXISTS (SELECT 1 FROM "transactions" t WHERE t."asset_id" = a."id")
  AND NOT EXISTS (SELECT 1 FROM "investment_analyses" ia WHERE ia."asset_id" = a."id");
