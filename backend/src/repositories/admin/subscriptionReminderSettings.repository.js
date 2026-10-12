import db from '../../config/database.js';

// PLAN_CAU_HINH_LICH_NHAC_HAN_2026-09-13.md, mục 3.1/3.3 — bảng một-dòng (id BOOLEAN PRIMARY KEY
// CHECK (id)) chứa danh sách mốc nhắc hạn (days_before + days_before_yearly). Luật hợp lệ (1-365, không trùng, tối đa
// 5 mốc) nằm ở service, không ở đây — repository chỉ đọc/ghi thẳng.
export async function findSettings(queryable = db) {
  const { rows } = await queryable.query(
    `SELECT days_before, days_before_yearly, updated_by, updated_at
     FROM subscription_reminder_settings
     WHERE id
     LIMIT 1`
  );
  return rows[0] || null;
}

// INSERT ... ON CONFLICT thay vì UPDATE thuần: bảng này có FK tới users(id) nên
// `TRUNCATE TABLE users ... CASCADE` (tests/integration/helpers/db.js, truncateAll) xoá luôn
// dòng seed của bootstrap.sql mà không có bước tự gieo lại — UPDATE thuần sẽ ảnh hưởng 0 dòng
// và RETURNING rỗng trong mọi test integration chạy sau lượt truncate đầu tiên. UPSERT tự chữa
// trong cả hai trường hợp (còn dòng hay bị xoá mất), không cần biết trạng thái trước đó.
//
// PLAN_MOC_NHAC_HAN_THEO_KY_2026-10-12.md, B2 — days_before = mốc gói tháng, days_before_yearly = mốc gói năm.
// `daysBeforeYearly` undefined/null = KHÔNG ĐỤNG tới cột năm (client cũ chỉ gửi daysBefore): nhánh UPDATE giữ giá trị
// hiện có, nhánh INSERT (dòng đã bị truncate) rơi về mặc định của cột — ARRAY[30,7,3] phải khớp DEFAULT ở migration 299.
export async function saveSettings({ daysBefore, daysBeforeYearly = null, updatedBy }, queryable = db) {
  const { rows } = await queryable.query(
    `INSERT INTO subscription_reminder_settings (id, days_before, days_before_yearly, updated_by)
     VALUES (TRUE, $1, COALESCE($3::int[], ARRAY[30,7,3]), $2)
     ON CONFLICT (id) DO UPDATE SET
       days_before = EXCLUDED.days_before,
       days_before_yearly = COALESCE($3::int[], subscription_reminder_settings.days_before_yearly),
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING days_before, days_before_yearly, updated_by, updated_at`,
    [daysBefore, updatedBy, daysBeforeYearly]
  );
  return rows[0];
}
