-- Migration: Tag khách hàng (PLAN_TAG_KHACH_HANG_2026-10-18, PR-T1).
--
-- Chỉ THÊM bảng mới (Expand): không đụng bảng cũ nên backend cũ chạy tiếp bình thường.
-- Phạm vi workspace = COALESCE(customers.workspace_owner_id, customers.id_user), cùng quy ước với danh sách khách;
-- `customer_tags.workspace_owner_id` luôn là chủ không gian (không phải nhân viên thao tác).

CREATE TABLE IF NOT EXISTS customer_tags (
  id                 BIGSERIAL PRIMARY KEY,
  workspace_owner_id BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name               VARCHAR(60)  NOT NULL,
  color              VARCHAR(16),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Không phân biệt hoa/thường trong cùng một không gian ("VIP" và "vip" là một tag).
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_tags_ws_lower_name
  ON customer_tags (workspace_owner_id, (LOWER(name)));

CREATE TABLE IF NOT EXISTS customer_tag_assignments (
  customer_id BIGINT      NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tag_id      BIGINT      NOT NULL REFERENCES customer_tags(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  source      VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'campaign')),
  campaign_id BIGINT,
  run_id      BIGINT,
  PRIMARY KEY (customer_id, tag_id)
);

-- Tra "khách nào mang tag này" (lọc danh sách, đếm số khách của tag).
CREATE INDEX IF NOT EXISTS idx_customer_tag_assignments_tag
  ON customer_tag_assignments (tag_id);

COMMENT ON TABLE customer_tags IS
  'Tag khach hang theo khong gian lam viec (workspace_owner_id). Ten duy nhat khong phan biet hoa/thuong.';
COMMENT ON TABLE customer_tag_assignments IS
  'Khach nao mang tag nao. source=manual (nguoi dung gan) hoac campaign (khoi Gan tag trong chien dich; campaign_id/run_id chi de truy vet, khong FK).';
