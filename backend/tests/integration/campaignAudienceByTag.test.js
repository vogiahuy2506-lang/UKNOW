/**
 * PR-T3 (PLAN_TAG_KHACH_HANG) — khối "khách đã lưu" lọc theo tag: SQL thật trên Postgres (mock DB từng làm lọt SQL sai cột).
 * Đi qua `getCustomersFromDataNode` — cùng hàm chạy thật, ước tính và chạy thử dùng — nên một bộ lọc dùng chung được kiểm ở một nơi.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import db from '../../src/config/database.js';
import campaignNodeDataService from '../../src/services/campaign/campaignNodeData.service.js';
import customerReadRepository from '../../src/repositories/customer/customerRead.repository.js';
import { truncateAll, createUser } from './helpers/db.js';

beforeEach(async () => {
  await truncateAll();
});

const addCustomer = async (userId, email) => {
  const { rows } = await db.query('INSERT INTO customers (id_user, email, full_name) VALUES ($1, $2, $2) RETURNING id', [userId, email]);
  return Number(rows[0].id);
};
const addTag = async (ownerId, name) => {
  const { rows } = await db.query('INSERT INTO customer_tags (workspace_owner_id, name) VALUES ($1, $2) RETURNING id', [ownerId, name]);
  return Number(rows[0].id);
};
const assign = (customerId, tagId) => db.query('INSERT INTO customer_tag_assignments (customer_id, tag_id) VALUES ($1, $2)', [customerId, tagId]);
const addPurchase = (customerId, productType = 'course') => db.query(
  'INSERT INTO customer_purchases (id_customer, product_name, product_type, purchase_date) VALUES ($1, $2, $3, NOW())',
  [customerId, 'Khoá A', productType],
);

const read = async (ownerId, config) => {
  const pack = await campaignNodeDataService.getCustomersFromDataNode(
    { id: 1, node_subtype: 'interested_customers', config },
    ownerId,
    [],
  );
  return pack.items.map((item) => Number(item.customerId)).sort((a, b) => a - b);
};

async function seed() {
  const a = await createUser();
  const b = await createUser();
  const [a1, a2, a3] = [await addCustomer(a.id, 'a1@x.vn'), await addCustomer(a.id, 'a2@x.vn'), await addCustomer(a.id, 'a3@x.vn')];
  const b1 = await addCustomer(b.id, 'b1@x.vn');
  const vipA = await addTag(a.id, 'VIP');
  const hotA = await addTag(a.id, 'Nóng');
  const vipB = await addTag(b.id, 'VIP');
  await assign(a1, vipA);
  await assign(a2, vipA);
  await assign(a2, hotA);
  await assign(a3, hotA);
  await assign(b1, vipB);
  return { a, b, a1, a2, a3, b1, vipA, hotA, vipB };
}

describe('interested_customers loại all + interestedTagIds', () => {
  it('không có tag -> mọi khách của workspace như cũ', async () => {
    const s = await seed();
    expect(await read(s.a.id, { interestedCustomerType: 'all' })).toEqual([s.a1, s.a2, s.a3]);
  });

  it('một tag -> chỉ khách mang tag; nhiều tag -> BẤT KỲ (hợp), mỗi khách một lần', async () => {
    const s = await seed();
    expect(await read(s.a.id, { interestedCustomerType: 'all', interestedTagIds: [s.vipA] })).toEqual([s.a1, s.a2]);
    expect(await read(s.a.id, { interestedCustomerType: 'all', interestedTagIds: [s.vipA, s.hotA] })).toEqual([s.a1, s.a2, s.a3]);
  });

  it('id tag của workspace KHÁC không lọt vào: ra 0 người, không rò khách của chủ kia', async () => {
    const s = await seed();
    expect(await read(s.a.id, { interestedCustomerType: 'all', interestedTagIds: [s.vipB] })).toEqual([]);
    expect(await read(s.a.id, { interestedCustomerType: 'all', interestedTagIds: [s.vipB, s.hotA] })).toEqual([s.a2, s.a3]);
    expect(await read(s.b.id, { interestedCustomerType: 'all', interestedTagIds: [s.vipA] })).toEqual([]);
  });

  it('đếm của trình từng bước (countWorkspaceCustomers) khớp số khách khối đọc', async () => {
    const s = await seed();
    expect(await customerReadRepository.countWorkspaceCustomers({ userId: s.a.id, tagIds: [s.vipA] })).toBe(2);
    expect(await customerReadRepository.countWorkspaceCustomers({ userId: s.a.id, tagIds: [s.vipA, s.hotA] })).toBe(3);
    expect(await customerReadRepository.countWorkspaceCustomers({ userId: s.a.id, tagIds: [s.vipB] })).toBe(0);
    expect(await customerReadRepository.countWorkspaceCustomers({ userId: s.a.id })).toBe(3);
  });
});

describe('interested_customers loại đã mua / quan tâm + interestedTagIds', () => {
  it('loại both: chỉ khách có dòng mua/quan tâm VÀ mang tag; tag lạ -> 0', async () => {
    const s = await seed();
    await addPurchase(s.a1);
    await addPurchase(s.a3);
    expect(await read(s.a.id, { interestedCustomerType: 'both' })).toEqual([s.a1, s.a3]);
    expect(await read(s.a.id, { interestedCustomerType: 'both', interestedTagIds: [s.vipA] })).toEqual([s.a1]);
    expect(await read(s.a.id, { interestedCustomerType: 'both', interestedTagIds: [s.hotA] })).toEqual([s.a3]);
    expect(await read(s.a.id, { interestedCustomerType: 'both', interestedTagIds: [s.vipB] })).toEqual([]);
  });
});
