-- Migration 167: backfill `reports_view` cho nhân viên đã có `campaigns_view`.
--
-- PR-5 tách Dashboard/Báo cáo ra thành quyền riêng `reports_view`. Trước đó ai xem được
-- chiến dịch là xem được dashboard, nên nếu để default-deny thì mọi nhân viên đang dùng
-- dashboard **mất quyền ngay khi deploy** — trên production thật là 5/6 nhân viên.
--
-- Đây là ngoại lệ đã ghi sẵn trong PLAN_EMPLOYEE_PERMISSION_GOVERNANCE_2026-08-20.md
-- mục 7: "reports_view <- campaigns_view (để giữ dashboard vận hành hiện có)".
-- Các key khác của PR-5 (integrations_manage, marketplace_manage, marketplace_purchase)
-- CỐ Ý giữ false theo đúng plan — đó là siết quyền có chủ đích, chủ workspace tự bật lại.
--
-- Idempotent: chỉ đụng dòng có campaigns_view=true mà chưa có reports_view=true.
-- Không cấp quyền mới cho ai, chỉ giữ nguyên thứ nhân viên vốn đã dùng được.
-- Không đổi schema nên không cần mirror sang bootstrap.sql.

BEGIN;

UPDATE user_members
SET permissions = COALESCE(permissions, '{}'::jsonb) || '{"reports_view": true}'::jsonb,
    updated_at  = NOW()
WHERE status = 'active'
  AND permissions->>'campaigns_view' = 'true'
  AND COALESCE(permissions->>'reports_view', 'false') <> 'true';

COMMIT;
