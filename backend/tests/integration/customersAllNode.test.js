/**
 * Integration (Postgres thật): khối "Lấy dữ liệu khách" loại `all` đọc TOÀN BỘ khách của workspace
 * (PLAN_TAO_CHIEN_DICH_TUNG_BUOC PR-5).
 *
 * Gốc sự cố: loại cũ (`both`) đọc `FROM customer_purchases JOIN customers` nên khách không có dòng mua/quan tâm bị loại
 * (prod: 96.940 khách, chỉ 3 có dòng) → "gửi cho khách đã lưu" ra ~0 người. Test mock toàn bộ DB sẽ không bắt được lỗi SQL
 * này nên chạy trên DB thật, đi qua đúng đường node chiến dịch dùng (`getCustomersFromDataNode`).
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import campaignNodeDataService from '../../src/services/campaign/campaignNodeData.service.js';

const nodeOf = (config) => ({ id: 1, node_subtype: 'interested_customers', config });

async function insertCustomer({ ownerId, idUser = ownerId, email, name }) {
  const { rows } = await db.query(
    `INSERT INTO customers (id_user, workspace_owner_id, email, full_name)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [idUser, ownerId, email, name]
  );
  return rows[0].id;
}

describe('node read_interested_customers loại all (DB thật)', () => {
  let owner;
  let employee;
  let otherOwner;

  beforeEach(async () => {
    await truncateAll();
    owner = await createUser({ username: 'chu_workspace' });
    employee = await createUser({ username: 'nhan_vien_ws' });
    otherOwner = await createUser({ username: 'chu_khac' });

    // 3 khách của workspace, KHÔNG có dòng customer_purchases. Một khách do nhân viên tạo (id_user khác, cùng workspace).
    await insertCustomer({ ownerId: owner.id, email: 'a@example.com', name: 'Khách A' });
    await insertCustomer({ ownerId: owner.id, email: 'b@example.com', name: 'Khách B' });
    await insertCustomer({ ownerId: owner.id, idUser: employee.id, email: 'c@example.com', name: 'Khách C' });

    // Khách của workspace KHÁC (có cả dòng mua) — không được lọt vào kết quả của owner.
    const otherId = await insertCustomer({ ownerId: otherOwner.id, email: 'x@example.com', name: 'Khách ngoài' });
    await db.query(
      `INSERT INTO customer_purchases (id_customer, product_name, product_type, amount, currency)
       VALUES ($1, 'Khoá X', 'interested', 0, 'VND')`,
      [otherId]
    );
  });

  it("'all' trả đủ 3 khách chưa từng mua, còn 'both' (loại cũ) trả 0", async () => {
    const all = await campaignNodeDataService.getCustomersFromDataNode(
      nodeOf({ interestedCustomerType: 'all' }),
      owner.id,
      []
    );
    expect(all.items).toHaveLength(3);
    expect(all.items.map((i) => i.email).sort()).toEqual(['a@example.com', 'b@example.com', 'c@example.com']);
    expect(all.items[0]).toEqual(expect.objectContaining({
      // BIGINT ra string, y hệt nhánh interested (người dùng parseInt khi so khớp).
      customerId: expect.stringMatching(/^\d+$/),
      fullName: expect.any(String),
      email: expect.any(String),
    }));
    // Hình dạng item: đủ khoá như nhánh interested để khối gửi/ánh xạ cột chạy không đổi.
    for (const key of ['phone', 'zaloId', 'zaloPhone', 'customerSource', 'courseName', 'orderStatus']) {
      expect(all.items[0]).toHaveProperty(key);
    }

    const both = await campaignNodeDataService.getCustomersFromDataNode(
      nodeOf({ interestedCustomerType: 'both' }),
      owner.id,
      []
    );
    expect(both.items).toHaveLength(0);
  });

  it("'all' không lọt khách của workspace khác (và ngược lại)", async () => {
    const all = await campaignNodeDataService.getCustomersFromDataNode(
      nodeOf({ interestedCustomerType: 'all' }),
      owner.id,
      []
    );
    expect(all.items.map((i) => i.email)).not.toContain('x@example.com');

    const other = await campaignNodeDataService.getCustomersFromDataNode(
      nodeOf({ interestedCustomerType: 'all' }),
      otherOwner.id,
      []
    );
    expect(other.items.map((i) => i.email)).toEqual(['x@example.com']);
  });

  it("'all' giữ nguyên chế độ chọn cố định / loại trừ", async () => {
    const all = await campaignNodeDataService.getCustomersFromDataNode(
      nodeOf({ interestedCustomerType: 'all' }),
      owner.id,
      []
    );
    const firstId = all.items[0].customerId;
    const excluded = await campaignNodeDataService.getCustomersFromDataNode(
      nodeOf({ interestedCustomerType: 'all', interestedSelectionMode: 'all_exclude', interestedExcludedCustomerIds: [firstId] }),
      owner.id,
      []
    );
    expect(excluded.items).toHaveLength(2);
    expect(excluded.items.map((i) => i.customerId)).not.toContain(firstId);
  });
});
