-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "WorkspaceType" AS ENUM ('PERSONAL', 'SHARED');

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('STOCK', 'ETF', 'FUND', 'BOND', 'CRYPTO', 'FOREX', 'COMMODITY', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('TRADE', 'DEPOSIT', 'WITHDRAWAL', 'DIVIDEND', 'INTEREST', 'FEE', 'TAX', 'CURRENCY_CONVERSION', 'TRANSFER', 'SPLIT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "TradeSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransactionSource" AS ENUM ('MANUAL', 'HAPI_EMAIL', 'XTB_DOCUMENT', 'OUTLOOK', 'FILE', 'API');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('QUEUED', 'PROCESSING', 'NEEDS_REVIEW', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DUPLICATE', 'ERROR');

-- CreateEnum
CREATE TYPE "ConnectionType" AS ENUM ('FORWARDING', 'MICROSOFT_GRAPH');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'ERROR');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "email_verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "user_id" UUID NOT NULL,
    "full_name" VARCHAR(160) NOT NULL,
    "timezone" VARCHAR(80) NOT NULL DEFAULT 'America/Bogota',
    "locale" VARCHAR(12) NOT NULL DEFAULT 'es-CO',
    "base_currency_code" CHAR(3) NOT NULL DEFAULT 'USD',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" VARCHAR(64) NOT NULL,
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(500),
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" "WorkspaceType" NOT NULL DEFAULT 'PERSONAL',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'VIEWER',
    "invited_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMPTZ(3),

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currencies" (
    "code" CHAR(3) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "symbol" VARCHAR(8) NOT NULL,
    "decimal_places" INTEGER NOT NULL DEFAULT 2,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "brokers" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(40) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brokers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolios" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "objective" VARCHAR(300),
    "base_currency_code" CHAR(3) NOT NULL DEFAULT 'USD',
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "portfolios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broker_accounts" (
    "id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "external_account_number" VARCHAR(100),
    "objective" VARCHAR(300),
    "auto_import_enabled" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "broker_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "ticker" VARCHAR(30) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "type" "AssetType" NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "exchange" VARCHAR(80),
    "sector" VARCHAR(120),
    "isin" VARCHAR(20),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "asset_id" UUID,
    "import_row_id" UUID,
    "type" "TransactionType" NOT NULL,
    "side" "TradeSide",
    "status" "TransactionStatus" NOT NULL DEFAULT 'CONFIRMED',
    "source" "TransactionSource" NOT NULL DEFAULT 'MANUAL',
    "trade_at" TIMESTAMPTZ(3) NOT NULL,
    "quantity" DECIMAL(28,10),
    "unit_price" DECIMAL(28,10),
    "gross_amount" DECIMAL(28,10) NOT NULL,
    "fees" DECIMAL(28,10) NOT NULL DEFAULT 0,
    "taxes" DECIMAL(28,10) NOT NULL DEFAULT 0,
    "exchange_rate" DECIMAL(28,10) NOT NULL DEFAULT 1,
    "currency_code" CHAR(3) NOT NULL,
    "external_id" VARCHAR(160),
    "notes" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_lots" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "purchase_transaction_id" UUID NOT NULL,
    "acquired_at" TIMESTAMPTZ(3) NOT NULL,
    "original_quantity" DECIMAL(28,10) NOT NULL,
    "remaining_quantity" DECIMAL(28,10) NOT NULL,
    "unit_cost" DECIMAL(28,10) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot_allocations" (
    "id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "sale_transaction_id" UUID NOT NULL,
    "quantity" DECIMAL(28,10) NOT NULL,
    "unit_cost" DECIMAL(28,10) NOT NULL,
    "realized_gain" DECIMAL(28,10) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lot_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_connections" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "ConnectionType" NOT NULL,
    "email" VARCHAR(320),
    "forwarding_address" VARCHAR(320),
    "encrypted_secret_ref" VARCHAR(500),
    "last_synced_at" TIMESTAMPTZ(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "email_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broker_credentials" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "kind" VARCHAR(50) NOT NULL,
    "encrypted_secret_ref" VARCHAR(500) NOT NULL,
    "last_validated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "broker_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_messages" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "external_id" VARCHAR(300) NOT NULL,
    "sender" VARCHAR(320),
    "subject" VARCHAR(500),
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "processed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "account_id" UUID,
    "email_message_id" UUID,
    "source" "TransactionSource" NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'QUEUED',
    "file_name" VARCHAR(300),
    "file_hash" VARCHAR(64),
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "imported_rows" INTEGER NOT NULL DEFAULT 0,
    "duplicate_rows" INTEGER NOT NULL DEFAULT 0,
    "review_rows" INTEGER NOT NULL DEFAULT 0,
    "error_message" VARCHAR(1000),
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw_data" JSONB NOT NULL,
    "normalized_data" JSONB,
    "confidence" DECIMAL(5,2),
    "status" "ImportRowStatus" NOT NULL DEFAULT 'PENDING',
    "duplicate_key" VARCHAR(200),
    "validation_errors" JSONB,
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_prices" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "price" DECIMAL(28,10) NOT NULL,
    "price_at" TIMESTAMPTZ(3) NOT NULL,
    "source" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL,
    "base_currency_code" CHAR(3) NOT NULL,
    "quote_currency_code" CHAR(3) NOT NULL,
    "rate" DECIMAL(28,10) NOT NULL,
    "rate_at" TIMESTAMPTZ(3) NOT NULL,
    "source" VARCHAR(80) NOT NULL,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_snapshots" (
    "id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "snapshot_at" TIMESTAMPTZ(3) NOT NULL,
    "contributed" DECIMAL(28,10) NOT NULL,
    "withdrawn" DECIMAL(28,10) NOT NULL,
    "market_value" DECIMAL(28,10) NOT NULL,
    "cash_balance" DECIMAL(28,10) NOT NULL,
    "realized_gain" DECIMAL(28,10) NOT NULL,
    "unrealized_gain" DECIMAL(28,10) NOT NULL,
    "dividends" DECIMAL(28,10) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_analyses" (
    "id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "asset_id" UUID,
    "title" VARCHAR(180) NOT NULL,
    "entry_reason" TEXT,
    "strategy" VARCHAR(100),
    "trading_view_url" VARCHAR(500),
    "target_price" DECIMAL(28,10),
    "stop_loss" DECIMAL(28,10),
    "horizon" VARCHAR(80),
    "risk_level" VARCHAR(40),
    "comments" TEXT,
    "final_result" TEXT,
    "lesson_learned" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "investment_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "file_name" VARCHAR(300) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "entity_type" VARCHAR(80),
    "entity_id" VARCHAR(100),
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(500),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'INFO',
    "title" VARCHAR(180) NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "link" VARCHAR(500),
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_revoked_at_idx" ON "sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_hash_key" ON "email_verification_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "workspaces_owner_user_id_idx" ON "workspaces"("owner_user_id");

-- CreateIndex
CREATE INDEX "workspace_members_user_id_idx" ON "workspace_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspace_id_user_id_key" ON "workspace_members"("workspace_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "brokers_slug_key" ON "brokers"("slug");

-- CreateIndex
CREATE INDEX "portfolios_workspace_id_archived_at_idx" ON "portfolios"("workspace_id", "archived_at");

-- CreateIndex
CREATE INDEX "broker_accounts_portfolio_id_archived_at_idx" ON "broker_accounts"("portfolio_id", "archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "broker_accounts_broker_id_external_account_number_key" ON "broker_accounts"("broker_id", "external_account_number");

-- CreateIndex
CREATE UNIQUE INDEX "assets_isin_key" ON "assets"("isin");

-- CreateIndex
CREATE INDEX "assets_ticker_idx" ON "assets"("ticker");

-- CreateIndex
CREATE UNIQUE INDEX "assets_ticker_currency_code_exchange_key" ON "assets"("ticker", "currency_code", "exchange");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_import_row_id_key" ON "transactions"("import_row_id");

-- CreateIndex
CREATE INDEX "transactions_account_id_trade_at_idx" ON "transactions"("account_id", "trade_at");

-- CreateIndex
CREATE INDEX "transactions_asset_id_trade_at_idx" ON "transactions"("asset_id", "trade_at");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_account_id_external_id_key" ON "transactions"("account_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_lots_purchase_transaction_id_key" ON "transaction_lots"("purchase_transaction_id");

-- CreateIndex
CREATE INDEX "transaction_lots_account_id_asset_id_acquired_at_idx" ON "transaction_lots"("account_id", "asset_id", "acquired_at");

-- CreateIndex
CREATE UNIQUE INDEX "lot_allocations_lot_id_sale_transaction_id_key" ON "lot_allocations"("lot_id", "sale_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_connections_forwarding_address_key" ON "email_connections"("forwarding_address");

-- CreateIndex
CREATE INDEX "email_connections_user_id_idx" ON "email_connections"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "broker_credentials_account_id_kind_key" ON "broker_credentials"("account_id", "kind");

-- CreateIndex
CREATE INDEX "email_messages_content_hash_idx" ON "email_messages"("content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "email_messages_connection_id_external_id_key" ON "email_messages"("connection_id", "external_id");

-- CreateIndex
CREATE INDEX "import_batches_status_created_at_idx" ON "import_batches"("status", "created_at");

-- CreateIndex
CREATE INDEX "import_batches_file_hash_idx" ON "import_batches"("file_hash");

-- CreateIndex
CREATE INDEX "import_rows_status_idx" ON "import_rows"("status");

-- CreateIndex
CREATE UNIQUE INDEX "import_rows_batch_id_row_number_key" ON "import_rows"("batch_id", "row_number");

-- CreateIndex
CREATE INDEX "market_prices_asset_id_price_at_idx" ON "market_prices"("asset_id", "price_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "market_prices_asset_id_price_at_source_key" ON "market_prices"("asset_id", "price_at", "source");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_base_currency_code_quote_currency_code_rate__key" ON "exchange_rates"("base_currency_code", "quote_currency_code", "rate_at", "source");

-- CreateIndex
CREATE INDEX "portfolio_snapshots_portfolio_id_snapshot_at_idx" ON "portfolio_snapshots"("portfolio_id", "snapshot_at");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_snapshots_portfolio_id_snapshot_at_key" ON "portfolio_snapshots"("portfolio_id", "snapshot_at");

-- CreateIndex
CREATE INDEX "investment_analyses_portfolio_id_created_at_idx" ON "investment_analyses"("portfolio_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_storage_key_key" ON "attachments"("storage_key");

-- CreateIndex
CREATE INDEX "attachments_content_hash_idx" ON "attachments"("content_hash");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_base_currency_code_fkey" FOREIGN KEY ("base_currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_base_currency_code_fkey" FOREIGN KEY ("base_currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broker_accounts" ADD CONSTRAINT "broker_accounts_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broker_accounts" ADD CONSTRAINT "broker_accounts_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broker_accounts" ADD CONSTRAINT "broker_accounts_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "broker_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_row_id_fkey" FOREIGN KEY ("import_row_id") REFERENCES "import_rows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_lots" ADD CONSTRAINT "transaction_lots_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "broker_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_lots" ADD CONSTRAINT "transaction_lots_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_lots" ADD CONSTRAINT "transaction_lots_purchase_transaction_id_fkey" FOREIGN KEY ("purchase_transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_allocations" ADD CONSTRAINT "lot_allocations_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "transaction_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_allocations" ADD CONSTRAINT "lot_allocations_sale_transaction_id_fkey" FOREIGN KEY ("sale_transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_connections" ADD CONSTRAINT "email_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broker_credentials" ADD CONSTRAINT "broker_credentials_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "broker_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "email_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "broker_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_email_message_id_fkey" FOREIGN KEY ("email_message_id") REFERENCES "email_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_prices" ADD CONSTRAINT "market_prices_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_prices" ADD CONSTRAINT "market_prices_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_base_currency_code_fkey" FOREIGN KEY ("base_currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_quote_currency_code_fkey" FOREIGN KEY ("quote_currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_snapshots" ADD CONSTRAINT "portfolio_snapshots_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_analyses" ADD CONSTRAINT "investment_analyses_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_analyses" ADD CONSTRAINT "investment_analyses_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reference data required by registration and broker-account setup
INSERT INTO "currencies" ("code", "name", "symbol", "decimal_places") VALUES
  ('USD', 'Dólar estadounidense', '$', 2),
  ('COP', 'Peso colombiano', '$', 2),
  ('EUR', 'Euro', '€', 2),
  ('GBP', 'Libra esterlina', '£', 2)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "brokers" ("id", "slug", "name", "metadata") VALUES
  ('10000000-0000-4000-8000-000000000001', 'hapi', 'Hapi', '{"emailImport": true, "documentPassword": false}'),
  ('10000000-0000-4000-8000-000000000002', 'xtb', 'XTB', '{"emailImport": true, "documentPassword": true}')
ON CONFLICT ("slug") DO NOTHING;
