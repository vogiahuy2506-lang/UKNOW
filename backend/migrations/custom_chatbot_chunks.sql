-- Custom AI Chatbot Chunks Table
CREATE TABLE IF NOT EXISTS custom_chatbot_chunks (
  id SERIAL PRIMARY KEY,
  chatbot_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding JSONB,
  chunk_index INTEGER NOT NULL,
  source VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_custom_chatbot_chunks_chatbot ON custom_chatbot_chunks(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_custom_chatbot_chunks_user ON custom_chatbot_chunks(user_id);

-- Chạy migration này để đổi sang vector type
ALTER TABLE custom_chatbot_chunks 
ALTER COLUMN embedding TYPE jsonb USING embedding::jsonb;

-- Hoặc tạo bảng mới với vector type