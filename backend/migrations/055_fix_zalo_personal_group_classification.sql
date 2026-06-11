-- Migration 055: Fix Zalo personal group vs personal conversation classification
-- Problem: conversations with external_id containing 'group_' were incorrectly
-- flagged as zalo_group even when they're personal chats.
-- Solution: only mark as zalo_group when external_id starts with 'group_'.

BEGIN;

-- 1. Fix personal chats (external_id NOT starting with 'group_') with zalo_group source -> zalo_personal
UPDATE zalo_personal_conversations
SET visitor_info = COALESCE(NULLIF(visitor_info::text, '')::jsonb, '{}'::jsonb) || '{"source":"zalo_personal"}'::jsonb
WHERE NOT (external_id LIKE 'group_%')
  AND visitor_info::text LIKE '%zalo_group%';

-- 2. Personal chats with is_group=true should be false
UPDATE zalo_personal_conversations
SET visitor_info = COALESCE(NULLIF(visitor_info::text, '')::jsonb, '{}'::jsonb) || '{"is_group":false}'::jsonb
WHERE NOT (external_id LIKE 'group_%')
  AND visitor_info::text LIKE '%is_group%true%';

-- 3. Group conversations (external_id LIKE 'group_%') should have is_group=true and source=zalo_group
UPDATE zalo_personal_conversations
SET visitor_info = COALESCE(NULLIF(visitor_info::text, '')::jsonb, '{}'::jsonb) || '{"is_group":true,"source":"zalo_group"}'::jsonb
WHERE external_id LIKE 'group_%';

-- 4. Normalize visitor_name for group conversations
-- Note: '||' and '->>' have the same precedence and are left-associative in
-- PostgreSQL, so the second COALESCE branch must be parenthesized — otherwise
-- it parses as ('Nhóm ' || ...::jsonb) ->> 'group_id', which fails casting the
-- literal 'Nhóm ' to jsonb.
UPDATE zalo_personal_conversations
SET visitor_name = COALESCE(
    NULLIF(visitor_info::text, '')::jsonb->>'group_name',
    'Nhóm ' || (NULLIF(visitor_info::text, '')::jsonb->>'group_id')
  )
WHERE external_id LIKE 'group_%'
  AND visitor_name LIKE '%(%)%';

COMMIT;
