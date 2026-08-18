-- 010_finance_reconciliation.sql
--
-- One row per day: the automated finance reconciliation snapshot.
-- Created by the auto-engine (auto-engine.js) so the finance dashboard
-- has a history of wallet, gateway and COD positions and the alert
-- source for fee leakage / remittance due. Safe to run twice.

CREATE TABLE IF NOT EXISTS finance_reconciliation (
  id                        BIGSERIAL PRIMARY KEY,
  period                    TEXT NOT NULL UNIQUE,          -- YYYY-MM-DD
  gateway_gross             NUMERIC(14,2) NOT NULL DEFAULT 0,
  gateway_fees              NUMERIC(14,2) NOT NULL DEFAULT 0,
  gateway_net               NUMERIC(14,2) NOT NULL DEFAULT 0,
  gateway_settlements       INT NOT NULL DEFAULT 0,
  online_paid               NUMERIC(14,2) NOT NULL DEFAULT 0,
  cod_collected             NUMERIC(14,2) NOT NULL DEFAULT 0,
  cod_pending_with_courier  NUMERIC(14,2) NOT NULL DEFAULT 0,
  cod_in_transit            INT NOT NULL DEFAULT 0,
  collected                 NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_realizable            NUMERIC(14,2) NOT NULL DEFAULT 0,
  warnings                  TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_reconciliation_period
  ON finance_reconciliation (period DESC);
