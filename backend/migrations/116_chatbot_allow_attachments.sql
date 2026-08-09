-- Allow visitors to send file attachments to a chatbot (opt-in, default off).
ALTER TABLE custom_chatbots
  ADD COLUMN IF NOT EXISTS allow_attachments BOOLEAN NOT NULL DEFAULT FALSE;
