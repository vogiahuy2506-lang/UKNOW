-- Migration 028: thêm logo_url vào business_profiles
DO $$ BEGIN
  ALTER TABLE business_profiles ADD COLUMN logo_url TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
