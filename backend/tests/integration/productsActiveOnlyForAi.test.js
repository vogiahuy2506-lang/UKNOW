/**
 * Integration test — sản phẩm ngừng bán không được đưa cho AI (F2.4 / D-06 / A P2-6).
 *
 * Vì sao cần Postgres thật: điều kiện lọc là SQL (`COALESCE(NULLIF(LOWER(BTRIM(status)), ''), 'active') = 'active'`).
 * Test unit mock `db.query` chỉ chứng minh câu SQL có chữ đó, không chứng minh nó chạy đúng trên dữ liệu thật
 * (NULL, chữ hoa, khoảng trắng thừa) — đúng kiểu "SQL sai lọt qua vì mock trọn DB".
 *
 * Bối cảnh: chủ shop đổi sản phẩm sang "không hoạt động" (ngừng bán, đổi giá) nhưng chatbot vẫn giới thiệu và báo giá cũ cho
 * khách thật, vì `findAllByUser` lấy mọi sản phẩm không lọc `status`.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';

const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');
const { default: productRepository } = await import('../../src/repositories/products/product.repository.js');
const { default: businessProfileService } = await import('../../src/services/ai/businessProfile.service.js');

beforeEach(async () => {
  await truncateAll();
});

const insertProduct = async (ownerId, name, status, price = null) => {
  const res = await db.query(
    `INSERT INTO products (id_user, workspace_owner_id, product_name, price, status)
     VALUES ($1::int, $1::bigint, $2, $3, $4) RETURNING id`,
    [ownerId, name, price, status]
  );
  return res.rows[0].id;
};

describe('productRepository.findAllByUser — activeOnly trên Postgres thật', () => {
  it('activeOnly: giữ active, NULL, chữ hoa/khoảng trắng thừa; loại inactive và mọi trạng thái khác', async () => {
    const user = await createUser();
    await insertProduct(user.id, 'Đang bán', 'active');
    await insertProduct(user.id, 'Trạng thái NULL', null);
    await insertProduct(user.id, 'Trạng thái rỗng', '   ');
    await insertProduct(user.id, 'Chữ hoa + khoảng trắng', '  Active ');
    await insertProduct(user.id, 'Ngừng bán', 'inactive');
    await insertProduct(user.id, 'Ngừng bán chữ hoa', 'INACTIVE');
    await insertProduct(user.id, 'Trạng thái lạ', 'draft');

    const rows = await productRepository.findAllByUser(user.id, { activeOnly: true });

    expect(rows.map((r) => r.product_name).sort()).toEqual(
      ['Chữ hoa + khoảng trắng', 'Trạng thái NULL', 'Trạng thái rỗng', 'Đang bán'].sort()
    );
  });

  it('không có activeOnly: trang quản lý/đường cũ vẫn thấy TẤT CẢ kể cả ngừng bán', async () => {
    const user = await createUser();
    await insertProduct(user.id, 'Đang bán', 'active');
    await insertProduct(user.id, 'Ngừng bán', 'inactive');

    const rows = await productRepository.findAllByUser(user.id);

    expect(rows.map((r) => r.product_name).sort()).toEqual(['Ngừng bán', 'Đang bán']);
  });

  it('không lấy sản phẩm của workspace khác khi activeOnly', async () => {
    const owner = await createUser();
    const other = await createUser();
    await insertProduct(owner.id, 'Của tôi', 'active');
    await insertProduct(other.id, 'Của người khác', 'active');

    const rows = await productRepository.findAllByUser(owner.id, { activeOnly: true });

    expect(rows.map((r) => r.product_name)).toEqual(['Của tôi']);
  });
});

describe('businessProfileService.getFormattedProfileForPrompt — prompt không có sản phẩm ngừng bán', () => {
  it('sản phẩm inactive (và giá cũ của nó) không xuất hiện; sản phẩm đang bán thì có', async () => {
    const user = await createUser();
    await insertProduct(user.id, 'Khoá Excel đang bán', 'active', '990k');
    await insertProduct(user.id, 'Khoá Photoshop đã ngừng bán', 'inactive', '1.234.567đ');

    const text = await businessProfileService.getFormattedProfileForPrompt(user.id);

    expect(text).toContain('Khoá Excel đang bán');
    expect(text).toContain('990k');
    expect(text).not.toContain('Khoá Photoshop đã ngừng bán');
    expect(text).not.toContain('1.234.567đ');
  });

  it('chuyển sản phẩm đang bán sang inactive rồi hỏi lại: biến mất khỏi prompt (không cache cũ)', async () => {
    const user = await createUser();
    const id = await insertProduct(user.id, 'Khoá sắp ngừng', 'active', '777k');
    expect(await businessProfileService.getFormattedProfileForPrompt(user.id)).toContain('Khoá sắp ngừng');

    await db.query(`UPDATE products SET status = 'inactive' WHERE id = $1`, [id]);

    expect(await businessProfileService.getFormattedProfileForPrompt(user.id)).not.toContain('Khoá sắp ngừng');
  });
});
