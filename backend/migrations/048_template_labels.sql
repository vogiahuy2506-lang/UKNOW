CREATE TABLE IF NOT EXISTS template_labels (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  color      VARCHAR(20)  NOT NULL DEFAULT '#6366f1',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(name)
);

-- Seed 2 nhãn mặc định để không mất data cũ
INSERT INTO template_labels (name, color) VALUES
  ('marketing',    '#3b82f6'),
  ('notification', '#f59e0b')
ON CONFLICT (name) DO NOTHING;
