-- Migration 223: Nguồn landing + UTM cho bài nộp Biểu mẫu (PR-7a), kèm token rút đồng ý (PR-7b dùng sau)

-- 1. Nguồn landing + UTM (PR-7a)
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS landing_page_slug VARCHAR(255);
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS utm_source        VARCHAR(255);
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS utm_medium        VARCHAR(255);
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS utm_campaign      VARCHAR(255);
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS utm_content       VARCHAR(255);
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS utm_term          VARCHAR(255);

-- 2. Rút lại đồng ý cho bài nộp (PR-7b dùng, thêm sẵn ở đây để tránh ALTER TABLE thiếu an toàn sau)
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'form_submissions_unsubscribe_token_unique'
  ) THEN
    ALTER TABLE form_submissions ADD CONSTRAINT form_submissions_unsubscribe_token_unique UNIQUE (unsubscribe_token);
  END IF;
END $$;

ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS consent_withdrawn_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_form_submissions_owner_landing ON form_submissions (workspace_owner_id, landing_page_slug)
  WHERE landing_page_slug IS NOT NULL;
