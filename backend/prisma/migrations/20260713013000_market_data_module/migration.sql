-- Align financial-domain column names without losing existing data.
ALTER TABLE "assets" RENAME COLUMN "ticker" TO "symbol";
ALTER TABLE "assets" RENAME COLUMN "type" TO "asset_type";
ALTER TABLE "assets" RENAME COLUMN "exchange" TO "exchange_code";
ALTER TABLE "assets" RENAME COLUMN "is_active" TO "active";

DROP INDEX IF EXISTS "assets_ticker_currency_code_exchange_key";
DROP INDEX IF EXISTS "assets_ticker_idx";
CREATE UNIQUE INDEX "assets_symbol_exchange_code_asset_type_key" ON "assets"("symbol", "exchange_code", "asset_type");
CREATE INDEX "assets_symbol_idx" ON "assets"("symbol");

ALTER TABLE "transactions" RENAME COLUMN "account_id" TO "broker_account_id";
ALTER TABLE "transactions" RENAME COLUMN "trade_at" TO "executed_at";
ALTER TABLE "transactions" RENAME COLUMN "fees" TO "commission";
ALTER TABLE "transactions" RENAME COLUMN "exchange_rate" TO "exchange_rate_to_base";
ALTER TABLE "transactions" RENAME COLUMN "external_id" TO "external_order_id";
ALTER TABLE "transactions" ADD COLUMN "settled_at" TIMESTAMPTZ(3);
ALTER TABLE "transactions" ADD COLUMN "net_amount" DECIMAL(28,10);
UPDATE "transactions"
SET "net_amount" = CASE
  WHEN "side" = 'BUY' THEN -1 * ("gross_amount" + "commission" + "taxes")
  WHEN "side" = 'SELL' THEN "gross_amount" - "commission" - "taxes"
  ELSE "gross_amount" - "commission" - "taxes"
END;

ALTER TABLE "portfolio_snapshots" RENAME COLUMN "snapshot_at" TO "snapshot_date";

-- Upgrade the original last-price table into OHLCV history with a natural composite key.
DROP INDEX IF EXISTS "market_prices_asset_id_price_at_source_key";
DROP INDEX IF EXISTS "market_prices_asset_id_price_at_idx";
ALTER TABLE "market_prices" DROP CONSTRAINT "market_prices_pkey";
ALTER TABLE "market_prices" RENAME COLUMN "price_at" TO "price_datetime";
ALTER TABLE "market_prices" RENAME COLUMN "source" TO "provider";
ALTER TABLE "market_prices" RENAME COLUMN "price" TO "close_price";
ALTER TABLE "market_prices" RENAME COLUMN "created_at" TO "fetched_at";
ALTER TABLE "market_prices" ADD COLUMN "interval" VARCHAR(20) NOT NULL DEFAULT '1day';
ALTER TABLE "market_prices" ADD COLUMN "open_price" DECIMAL(28,10);
ALTER TABLE "market_prices" ADD COLUMN "high_price" DECIMAL(28,10);
ALTER TABLE "market_prices" ADD COLUMN "low_price" DECIMAL(28,10);
ALTER TABLE "market_prices" ADD COLUMN "volume" DECIMAL(28,4);
UPDATE "market_prices" SET
  "open_price" = "close_price",
  "high_price" = "close_price",
  "low_price" = "close_price";
ALTER TABLE "market_prices" ALTER COLUMN "open_price" SET NOT NULL;
ALTER TABLE "market_prices" ALTER COLUMN "high_price" SET NOT NULL;
ALTER TABLE "market_prices" ALTER COLUMN "low_price" SET NOT NULL;
ALTER TABLE "market_prices" DROP COLUMN "id";
ALTER TABLE "market_prices" ADD CONSTRAINT "market_prices_pkey" PRIMARY KEY ("asset_id", "price_datetime", "interval", "provider");
CREATE INDEX "market_prices_asset_id_interval_price_datetime_idx" ON "market_prices"("asset_id", "interval", "price_datetime" DESC);

ALTER TABLE "exchange_rates" ADD COLUMN "fetched_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "asset_provider_symbols" (
  "id" UUID NOT NULL,
  "asset_id" UUID NOT NULL,
  "provider" VARCHAR(40) NOT NULL,
  "provider_symbol" VARCHAR(100) NOT NULL,
  "exchange_code" VARCHAR(80),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "asset_provider_symbols_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "asset_provider_symbols_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "asset_provider_symbols_provider_provider_symbol_key" ON "asset_provider_symbols"("provider", "provider_symbol");
CREATE UNIQUE INDEX "asset_provider_symbols_asset_id_provider_key" ON "asset_provider_symbols"("asset_id", "provider");
CREATE INDEX "asset_provider_symbols_asset_id_active_idx" ON "asset_provider_symbols"("asset_id", "active");

CREATE TABLE "latest_market_quotes" (
  "asset_id" UUID NOT NULL,
  "price" DECIMAL(28,10) NOT NULL,
  "currency_code" CHAR(3) NOT NULL,
  "open_price" DECIMAL(28,10),
  "high_price" DECIMAL(28,10),
  "low_price" DECIMAL(28,10),
  "previous_close" DECIMAL(28,10),
  "change" DECIMAL(28,10),
  "percent_change" DECIMAL(18,8),
  "market_status" VARCHAR(30),
  "provider" VARCHAR(40) NOT NULL,
  "provider_timestamp" TIMESTAMPTZ(3),
  "fetched_at" TIMESTAMPTZ(3) NOT NULL,
  "is_delayed" BOOLEAN NOT NULL DEFAULT false,
  "delay_minutes" INTEGER,
  "raw_response" JSONB,
  CONSTRAINT "latest_market_quotes_pkey" PRIMARY KEY ("asset_id"),
  CONSTRAINT "latest_market_quotes_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "latest_market_quotes_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "latest_market_quotes_fetched_at_idx" ON "latest_market_quotes"("fetched_at");

-- Explicit mappings. Runtime code never strips broker suffixes heuristically.
INSERT INTO "asset_provider_symbols" ("id", "asset_id", "provider", "provider_symbol", "exchange_code", "updated_at")
SELECT gen_random_uuid(), "id", 'twelve-data',
  CASE WHEN "symbol" = 'IGLN' THEN 'IGLN:LSE' ELSE "symbol" END,
  "exchange_code", CURRENT_TIMESTAMP
FROM "assets"
ON CONFLICT ("asset_id", "provider") DO NOTHING;

INSERT INTO "asset_provider_symbols" ("id", "asset_id", "provider", "provider_symbol", "exchange_code", "updated_at")
SELECT gen_random_uuid(), "id", 'hapi', "symbol", "exchange_code", CURRENT_TIMESTAMP
FROM "assets"
ON CONFLICT ("asset_id", "provider") DO NOTHING;

INSERT INTO "asset_provider_symbols" ("id", "asset_id", "provider", "provider_symbol", "exchange_code", "updated_at")
SELECT gen_random_uuid(), "id", 'xtb',
  CASE WHEN "exchange_code" IN ('NASDAQ', 'NYSE', 'NYSE Arca') THEN "symbol" || '.US'
       WHEN "exchange_code" = 'LSE' THEN "symbol" || '.UK'
       ELSE "symbol" END,
  "exchange_code", CURRENT_TIMESTAMP
FROM "assets"
ON CONFLICT ("asset_id", "provider") DO NOTHING;

INSERT INTO "latest_market_quotes" (
  "asset_id", "price", "currency_code", "open_price", "high_price", "low_price",
  "previous_close", "change", "percent_change", "market_status", "provider",
  "provider_timestamp", "fetched_at", "is_delayed", "delay_minutes"
)
SELECT DISTINCT ON (mp."asset_id")
  mp."asset_id", mp."close_price", mp."currency_code", mp."open_price", mp."high_price", mp."low_price",
  mp."close_price", 0, 0, 'CLOSED', mp."provider", mp."price_datetime", mp."fetched_at", false, 0
FROM "market_prices" mp
ORDER BY mp."asset_id", mp."price_datetime" DESC
ON CONFLICT ("asset_id") DO NOTHING;
