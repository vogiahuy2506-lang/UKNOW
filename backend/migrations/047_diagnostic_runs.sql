-- Diagnostic tool: test gửi tin thực tế với visibility cấp độ từng tin nhắn
CREATE TABLE diagnostic_runs (
  id                     BIGSERIAL    PRIMARY KEY,
  channel                VARCHAR(30)  NOT NULL,                          -- 'zalo_personal' | 'zalo_group' | 'email'
  account_id             BIGINT       REFERENCES zalo_settings(id) ON DELETE SET NULL,
  message_text           TEXT         NOT NULL,
  inter_message_delay_ms INT          NOT NULL DEFAULT 5000,
  status                 VARCHAR(20)  NOT NULL DEFAULT 'running',        -- 'running' | 'completed' | 'failed'
  total_count            INT          NOT NULL DEFAULT 0,
  sent_count             INT          NOT NULL DEFAULT 0,
  failed_count           INT          NOT NULL DEFAULT 0,
  created_by             BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at           TIMESTAMPTZ
);

CREATE TABLE diagnostic_messages (
  id            BIGSERIAL    PRIMARY KEY,
  run_id        BIGINT       NOT NULL REFERENCES diagnostic_runs(id) ON DELETE CASCADE,
  seq           INT          NOT NULL,
  recipient     VARCHAR(100) NOT NULL,
  status        VARCHAR(20)  NOT NULL DEFAULT 'pending',  -- 'pending' | 'sending' | 'sent' | 'failed'
  sent_at       TIMESTAMPTZ,
  delay_ms      INT,          -- khoảng cách thực tế từ tin trước (null cho tin đầu)
  error_code    VARCHAR(100),
  error_message TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_diagnostic_messages_run ON diagnostic_messages(run_id, seq);
