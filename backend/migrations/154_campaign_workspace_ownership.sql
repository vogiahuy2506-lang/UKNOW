-- PR-2B: tách workspace owner và actor cho Campaign / Schedule / Run.
--
-- Dữ liệu lịch sử không lưu active employee context tại thời điểm tạo. Migration chỉ
-- backfill chắc chắn theo campaigns.id_user, KHÔNG đoán owner từ membership hiện tại.

BEGIN;

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS workspace_owner_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

UPDATE campaigns
SET workspace_owner_id = COALESCE(workspace_owner_id, id_user),
    created_by = COALESCE(created_by, id_user)
WHERE workspace_owner_id IS NULL
   OR created_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_workspace_owner
  ON campaigns (workspace_owner_id);

CREATE INDEX IF NOT EXISTS idx_campaigns_effective_workspace_owner
  ON campaigns ((COALESCE(workspace_owner_id, id_user)));

CREATE INDEX IF NOT EXISTS idx_campaigns_created_by
  ON campaigns (created_by)
  WHERE created_by IS NOT NULL;

ALTER TABLE campaign_schedules
  ADD COLUMN IF NOT EXISTS workspace_owner_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

UPDATE campaign_schedules cs
SET workspace_owner_id = COALESCE(cs.workspace_owner_id, c.workspace_owner_id, c.id_user),
    created_by = COALESCE(cs.created_by, c.created_by, c.id_user)
FROM campaigns c
WHERE c.id = cs.id_campaign
  AND (cs.workspace_owner_id IS NULL OR cs.created_by IS NULL);

CREATE INDEX IF NOT EXISTS idx_campaign_schedules_workspace_owner
  ON campaign_schedules (workspace_owner_id);

CREATE INDEX IF NOT EXISTS idx_campaign_schedules_created_by
  ON campaign_schedules (created_by)
  WHERE created_by IS NOT NULL;

ALTER TABLE campaign_runs
  ADD COLUMN IF NOT EXISTS workspace_owner_id BIGINT REFERENCES users(id) ON DELETE CASCADE;

UPDATE campaign_runs cr
SET workspace_owner_id = COALESCE(cr.workspace_owner_id, c.workspace_owner_id, c.id_user)
FROM campaigns c
WHERE c.id = cr.id_campaign
  AND cr.workspace_owner_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_runs_workspace_owner
  ON campaign_runs (workspace_owner_id);

-- Dry-run/report: chỉ hiển thị candidate, tuyệt đối không tự chuyển ownership lịch sử.
DO $$
DECLARE
  total_rows BIGINT;
  single_owner_candidates BIGINT;
  ambiguous_owner_candidates BIGINT;
BEGIN
  SELECT COUNT(*) INTO total_rows FROM campaigns;

  SELECT COUNT(*) INTO single_owner_candidates
  FROM campaigns c
  WHERE (
    SELECT COUNT(*)
    FROM user_members um
    WHERE um.employee_id = c.created_by
      AND um.status = 'active'
  ) = 1;

  SELECT COUNT(*) INTO ambiguous_owner_candidates
  FROM campaigns c
  WHERE (
    SELECT COUNT(*)
    FROM user_members um
    WHERE um.employee_id = c.created_by
      AND um.status = 'active'
  ) > 1;

  RAISE NOTICE 'Campaign ownership report: total=%, one-current-owner-candidate=%, multiple-current-owner-candidates=%. Historical rows remain self-scoped.',
    total_rows, single_owner_candidates, ambiguous_owner_candidates;
END $$;

COMMIT;
