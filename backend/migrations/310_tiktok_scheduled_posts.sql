-- Migration 310: bảng tiktok_scheduled_posts — lịch đăng bài TikTok (video / ảnh) cho tài khoản Business đã liên kết.
-- Tách khỏi campaign engine: 1 nội dung -> 1 tài khoản -> 1 thời điểm (campaign là 1 nội dung -> nhiều người nhận).
--
-- Vòng đời status:
--   scheduled  -> chờ tới scheduled_at
--   publishing -> worker đã claim và đang gọi /business/video|photo/publish/ (CHƯA có share_id)
--   processing -> đã có share_id, đang poll /business/publish/status/
--   published | failed | cancelled -> trạng thái cuối
--
-- Lưu ý idempotency: dòng kẹt ở 'publishing' quá lease KHÔNG được tự retry (không biết TikTok đã nhận lệnh
-- hay chưa -> retry có thể đăng đôi). Worker chuyển sang 'failed' với error_code = 'publish_state_unknown'.

CREATE TABLE IF NOT EXISTS tiktok_scheduled_posts (
  id BIGSERIAL PRIMARY KEY,
  id_user BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id BIGINT NOT NULL REFERENCES tiktok_business_accounts(id) ON DELETE CASCADE,
  post_type TEXT NOT NULL CHECK (post_type IN ('video', 'photo')),
  caption TEXT NOT NULL DEFAULT '',
  video_url TEXT,                                   -- HTTPS công khai, domain đã verify trên TikTok
  photo_urls JSONB NOT NULL DEFAULT '[]'::jsonb,    -- tối đa 35 URL HTTPS
  privacy_level TEXT NOT NULL DEFAULT 'PUBLIC_TO_EVERYONE',
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'publishing', 'processing', 'published', 'failed', 'cancelled')),
  share_id TEXT,                                    -- publish_id khi poll trạng thái
  tiktok_post_ids JSONB,                            -- post_ids khi PUBLISH_COMPLETE
  poll_count INTEGER NOT NULL DEFAULT 0,
  next_poll_at TIMESTAMPTZ,
  processing_started_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tiktok_scheduled_posts_due
  ON tiktok_scheduled_posts (scheduled_at)
  WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_tiktok_scheduled_posts_polling
  ON tiktok_scheduled_posts (next_poll_at)
  WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS idx_tiktok_scheduled_posts_user_time
  ON tiktok_scheduled_posts (id_user, scheduled_at DESC);
