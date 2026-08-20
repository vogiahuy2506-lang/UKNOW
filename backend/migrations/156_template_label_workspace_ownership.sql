-- Migration 156: template labels belong to a workspace while retaining their creator.

ALTER TABLE template_labels
  ADD COLUMN IF NOT EXISTS workspace_owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

UPDATE template_labels
SET workspace_owner_id = created_by
WHERE workspace_owner_id IS NULL
  AND created_by IS NOT NULL;

ALTER TABLE template_labels
  DROP CONSTRAINT IF EXISTS template_labels_name_created_by_key;

ALTER TABLE template_labels
  DROP CONSTRAINT IF EXISTS template_labels_name_workspace_owner_key;

ALTER TABLE template_labels
  ADD CONSTRAINT template_labels_name_workspace_owner_key
  UNIQUE (name, workspace_owner_id);

CREATE INDEX IF NOT EXISTS idx_template_labels_workspace_owner
  ON template_labels(workspace_owner_id);
