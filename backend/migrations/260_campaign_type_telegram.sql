-- PR-E1: Telegram thanh loai chien dich rieng.
-- Production: campaigns.campaign_type la ENUM `campaign_type` (email, zalo, mixed, zalo_group), PostgreSQL 16.13
-- (ALTER TYPE ... ADD VALUE chay duoc trong transaction tu PG 12; runner boc moi file trong transaction).
-- Them luon 'telegram_group' cho PR-E2 de tranh ALTER TYPE lan hai. KHONG dung gia tri moi trong cung file nay.
-- Moi truong test dung VARCHAR + CHECK (bootstrap.sql) — khoi ALTER TYPE se bo qua neu kieu ENUM khong ton tai.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'campaign_type' AND typtype = 'e') THEN
    ALTER TYPE campaign_type ADD VALUE IF NOT EXISTS 'telegram';
    ALTER TYPE campaign_type ADD VALUE IF NOT EXISTS 'telegram_group';
  END IF;
END
$$;
