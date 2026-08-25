/**
 * Integration test — danh sách sản phẩm mà trợ lý AI đưa ra cho người dùng chọn.
 *
 * Vì sao cần chạm DB thật: `getCourses` là SQL thuần. Test unit mock `db.query` sẽ xanh kể cả khi
 * câu SQL sai tên cột hoặc lọc sai — đúng kiểu bug đã dính ngày 24/08 (danh bạ Zalo query hai cột
 * không tồn tại, unit test vẫn xanh, production 500).
 *
 * Bối cảnh: bảng `courses` đồng bộ nguyên trạng thái từ WooCommerce (`publish`, `draft`,
 * `pending`, `private`). Trước 25/08/2026 `getCourses` không lọc gì, nên thẻ "Chiến dịch này nói
 * về gì?" mời người dùng chạy quảng bá cho khoá NHÁP và khoá RIÊNG TƯ.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';

const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');
const { default: aiPromptResources } = await import('../../src/services/ai/aiPromptResources.service.js');

beforeEach(async () => {
  await truncateAll();
});

const insertCourse = async (userId, courseName, status, courseCode = null) => {
  const res = await db.query(
    `INSERT INTO courses (id_user, workspace_owner_id, course_name, course_code, status, created_at, updated_at)
     VALUES ($1, $1, $2, $3, $4, NOW(), NOW()) RETURNING id`,
    [userId, courseName, courseCode, status]
  );
  return res.rows[0].id;
};

describe('aiPromptResources.getCourses — chỉ đưa sản phẩm đã publish', () => {
  it('bỏ draft / pending / private, giữ publish', async () => {
    const user = await createUser();
    await insertCourse(user.id, 'Khoá đang bán', 'publish', '1001');
    await insertCourse(user.id, 'Khoá nháp', 'draft', '1002');
    await insertCourse(user.id, 'Khoá chờ duyệt', 'pending', '1003');
    await insertCourse(user.id, 'Wallet Topup', 'private', '1004');

    const courses = await aiPromptResources.getCourses(user.id);

    expect(courses.map((c) => c.name)).toEqual(['Khoá đang bán']);
  });

  it('không lấy sản phẩm của người khác', async () => {
    const owner = await createUser();
    const other = await createUser();
    await insertCourse(owner.id, 'Của tôi', 'publish', '2001');
    await insertCourse(other.id, 'Của người khác', 'publish', '2002');

    const courses = await aiPromptResources.getCourses(owner.id);

    expect(courses.map((c) => c.name)).toEqual(['Của tôi']);
  });

  it('vẫn giải mã HTML entity trong tên (dữ liệu WooCommerce thật có &#038;, &#8211;)', async () => {
    const user = await createUser();
    await insertCourse(user.id, 'AI AGENTS &#8211; SALES &#038; MARKETING', 'publish', '3001');

    const courses = await aiPromptResources.getCourses(user.id);

    expect(courses[0].name).toBe('AI AGENTS – SALES & MARKETING');
  });

  it('không có sản phẩm publish nào thì trả mảng rỗng, không ném lỗi', async () => {
    const user = await createUser();
    await insertCourse(user.id, 'Chỉ có khoá nháp', 'draft', '4001');

    await expect(aiPromptResources.getCourses(user.id)).resolves.toEqual([]);
  });

  it('chặn chèn trùng course_code cho cùng workspace qua unique index', async () => {
    const user = await createUser();
    await insertCourse(user.id, 'Khoá gốc', 'publish', 'UNIQUE_001');

    await expect(insertCourse(user.id, 'Khoá trùng', 'publish', 'UNIQUE_001')).rejects.toThrow();
  });
});
