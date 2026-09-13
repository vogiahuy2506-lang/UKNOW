-- allow-destructive-ddl: metadata-only SUPERSET CHECK (DROP+ADD trong cùng transaction, không
-- table rewrite, không data scan; giá trị mới bao trùm giá trị cũ nên mọi row hiện có vẫn hợp lệ).
ALTER TABLE system_email_templates
  DROP CONSTRAINT IF EXISTS system_email_templates_key_check,
  ADD CONSTRAINT system_email_templates_key_check
    CHECK (template_key IN ('welcome', 'plan_expiring', 'plan_expired'));
