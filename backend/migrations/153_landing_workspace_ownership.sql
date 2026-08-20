-- PR-2A: tách workspace owner và actor cho Landing Page.
--
-- Dữ liệu lịch sử không lưu active employee context tại thời điểm tạo. Vì vậy migration
-- chỉ backfill chắc chắn theo owner cũ (id_user), KHÔNG đoán owner từ membership hiện tại.
-- Những row từng do employee tạo sẽ tiếp tục nằm trong self workspace của họ và có thể được
-- đối chiếu thủ công từ audit/backup nếu cần chuyển ownership sau này.

BEGIN;

ALTER TABLE landing_pages
  ADD COLUMN IF NOT EXISTS workspace_owner_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

UPDATE landing_pages
SET workspace_owner_id = COALESCE(workspace_owner_id, id_user),
    created_by = COALESCE(created_by, id_user)
WHERE workspace_owner_id IS NULL
   OR created_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_landing_pages_workspace_owner
  ON landing_pages (workspace_owner_id);

CREATE INDEX IF NOT EXISTS idx_landing_pages_effective_workspace_owner
  ON landing_pages ((COALESCE(workspace_owner_id, id_user)));

CREATE INDEX IF NOT EXISTS idx_landing_pages_created_by
  ON landing_pages (created_by)
  WHERE created_by IS NOT NULL;

ALTER TABLE landing_page_versions
  ADD COLUMN IF NOT EXISTS workspace_owner_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

UPDATE landing_page_versions lpv
SET workspace_owner_id = COALESCE(
      lpv.workspace_owner_id,
      lp.workspace_owner_id,
      lp.id_user,
      lpv.id_user
    ),
    created_by = COALESCE(lpv.created_by, lpv.id_user)
FROM landing_pages lp
WHERE lp.id = lpv.id_landing_page
  AND (lpv.workspace_owner_id IS NULL OR lpv.created_by IS NULL);

UPDATE landing_page_versions
SET workspace_owner_id = COALESCE(workspace_owner_id, id_user),
    created_by = COALESCE(created_by, id_user)
WHERE workspace_owner_id IS NULL
   OR created_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_landing_page_versions_workspace_owner
  ON landing_page_versions (workspace_owner_id);

CREATE INDEX IF NOT EXISTS idx_landing_page_versions_created_by
  ON landing_page_versions (created_by)
  WHERE created_by IS NOT NULL;

-- Dry-run/report: chỉ hiển thị candidate, tuyệt đối không tự chuyển ownership.
DO $$
DECLARE
  total_rows BIGINT;
  single_owner_candidates BIGINT;
  ambiguous_owner_candidates BIGINT;
BEGIN
  SELECT COUNT(*) INTO total_rows FROM landing_pages;

  SELECT COUNT(*) INTO single_owner_candidates
  FROM landing_pages lp
  WHERE (
    SELECT COUNT(*)
    FROM user_members um
    WHERE um.employee_id = lp.created_by
      AND um.status = 'active'
  ) = 1;

  SELECT COUNT(*) INTO ambiguous_owner_candidates
  FROM landing_pages lp
  WHERE (
    SELECT COUNT(*)
    FROM user_members um
    WHERE um.employee_id = lp.created_by
      AND um.status = 'active'
  ) > 1;

  RAISE NOTICE 'Landing ownership report: total=%, one-current-owner-candidate=%, multiple-current-owner-candidates=%. Historical rows remain self-scoped.',
    total_rows, single_owner_candidates, ambiguous_owner_candidates;
END $$;

COMMIT;
