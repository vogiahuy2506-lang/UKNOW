-- Migration 162: Kéo dài gói "Dùng thử" từ 10 ngày → 14 ngày cho user mới đăng ký.
--
-- Idempotent: chỉ UPDATE row có code='trial'. An toàn chạy nhiều lần.
-- KHÔNG update subscription_expires_at của user đã được cấp trial trước thời điểm
-- migration này — duration_days chỉ ảnh hưởng tới những user tạo SAU thời điểm này
-- (vì activateFreePlan/users.active_plan_id join plans.duration_days để set expires_at).
-- Nếu sau này muốn gia hạn user cũ, sẽ là một quyết định product riêng.

BEGIN;

UPDATE plans
SET duration_days = 14,
    description = 'Trải nghiệm đầy đủ tính năng trong 14 ngày. Không cần thẻ tín dụng.',
    updated_at = NOW()
WHERE code = 'trial'
  AND is_custom = FALSE;

COMMIT;
