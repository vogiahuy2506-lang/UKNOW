-- Fix chatbot_studio_conversations column types to match BIGINT convention
ALTER TABLE chatbot_studio_conversations
  ALTER COLUMN id_user TYPE BIGINT USING id_user::BIGINT,
  ALTER COLUMN id_chatbot TYPE BIGINT USING id_chatbot::BIGINT;
