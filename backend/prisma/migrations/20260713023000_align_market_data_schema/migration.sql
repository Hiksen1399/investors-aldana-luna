ALTER TABLE "market_prices" ALTER COLUMN "provider" TYPE VARCHAR(40);
ALTER TABLE "market_prices" ALTER COLUMN "fetched_at" DROP DEFAULT;
ALTER TABLE "market_prices" ALTER COLUMN "interval" DROP DEFAULT;

ALTER TABLE "transactions" RENAME CONSTRAINT "transactions_account_id_fkey" TO "transactions_broker_account_id_fkey";
ALTER INDEX "transactions_account_id_external_id_key" RENAME TO "transactions_broker_account_id_external_order_id_key";
ALTER INDEX "transactions_account_id_trade_at_idx" RENAME TO "transactions_broker_account_id_executed_at_idx";
ALTER INDEX "transactions_asset_id_trade_at_idx" RENAME TO "transactions_asset_id_executed_at_idx";
ALTER INDEX "portfolio_snapshots_portfolio_id_snapshot_at_idx" RENAME TO "portfolio_snapshots_portfolio_id_snapshot_date_idx";
ALTER INDEX "portfolio_snapshots_portfolio_id_snapshot_at_key" RENAME TO "portfolio_snapshots_portfolio_id_snapshot_date_key";
