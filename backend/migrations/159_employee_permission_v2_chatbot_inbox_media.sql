-- PR-4: employee delegation for Chatbot, Inbox and Media.
-- Existing employees remain least-privileged; explicit true values are preserved.

UPDATE user_members
SET permissions = COALESCE(permissions, '{}'::jsonb)
  || jsonb_build_object(
    'chatbots_manage',
      COALESCE(permissions -> 'chatbots_manage' = 'true'::jsonb, false)
      OR COALESCE(permissions -> 'chatbot_channels_manage' = 'true'::jsonb, false),
    'chatbot_channels_manage', COALESCE(permissions -> 'chatbot_channels_manage' = 'true'::jsonb, false),
    'inbox_view',
      COALESCE(permissions -> 'inbox_view' = 'true'::jsonb, false)
      OR COALESCE(permissions -> 'inbox_reply' = 'true'::jsonb, false)
      OR COALESCE(permissions -> 'inbox_manage' = 'true'::jsonb, false),
    'inbox_reply', COALESCE(permissions -> 'inbox_reply' = 'true'::jsonb, false),
    'inbox_manage', COALESCE(permissions -> 'inbox_manage' = 'true'::jsonb, false),
    'media_library_view',
      COALESCE(permissions -> 'media_library_view' = 'true'::jsonb, false)
      OR COALESCE(permissions -> 'media_library_manage' = 'true'::jsonb, false),
    'media_library_manage', COALESCE(permissions -> 'media_library_manage' = 'true'::jsonb, false)
  )
WHERE permissions IS NULL
   OR NOT permissions ?& ARRAY[
     'chatbots_manage',
     'chatbot_channels_manage',
     'inbox_view',
     'inbox_reply',
     'inbox_manage',
     'media_library_view',
     'media_library_manage'
   ];
