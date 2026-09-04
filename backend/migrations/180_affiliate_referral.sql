-- Migration 180: Affiliate Referral Code and Referrer Attribution
-- Thêm mã giới thiệu cá nhân và thông tin người giới thiệu cho bảng users

ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(16);
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users (referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users (referred_by_user_id);

-- Backfill mã giới thiệu duy nhất cho toàn bộ user hiện có (8 ký tự A-Z2-9, bỏ O/0/I/1)
DO $$
DECLARE
  chars text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  rec RECORD;
  new_code text;
  i int;
  done boolean;
BEGIN
  FOR rec IN SELECT id FROM users WHERE referral_code IS NULL ORDER BY id LOOP
    done := false;
    WHILE NOT done LOOP
      new_code := '';
      FOR i IN 1..8 LOOP
        new_code := new_code || substr(chars, floor(random() * 32)::int + 1, 1);
      END LOOP;
      IF NOT EXISTS (SELECT 1 FROM users WHERE referral_code = new_code) THEN
        UPDATE users SET referral_code = new_code WHERE id = rec.id;
        done := true;
      END IF;
    END LOOP;
  END LOOP;
END $$;
