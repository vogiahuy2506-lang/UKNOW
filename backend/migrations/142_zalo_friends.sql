-- Migration 142: Tạo bảng zalo_friends lưu danh bạ Zalo cá nhân đã đồng bộ
CREATE TABLE IF NOT EXISTS zalo_friends (
  id               BIGSERIAL PRIMARY KEY,
  id_zalo_setting  BIGINT NOT NULL REFERENCES zalo_settings(id) ON DELETE CASCADE,
  friend_id        VARCHAR(100) NOT NULL,
  display_name     VARCHAR(255),
  phone            VARCHAR(32),
  avatar_url       TEXT,
  synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT zalo_friends_setting_friend_key UNIQUE (id_zalo_setting, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_zalo_friends_setting ON zalo_friends(id_zalo_setting);
CREATE INDEX IF NOT EXISTS idx_zalo_friends_search ON zalo_friends(id_zalo_setting, display_name);
