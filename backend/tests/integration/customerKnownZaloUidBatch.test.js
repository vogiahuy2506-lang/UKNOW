/**
 * PLAN_THAM_CHIEU_KHOI_VA_RUN_BO_CHAM_2026-10-19, PR-4 Việc 4.1 — `customerMutationRepository.findPhonesWithKnownZaloUid`.
 *
 * Chạy trên DB thật (5433). Hàm tra uid hàng loạt: số nào đã có khách `zalo_id` khác rỗng trong workspace (khớp `phone`
 * HOẶC `zalo_phone`), MỘT truy vấn — dùng để cho người đã biết uid nhận bước sau trước khi tra số người mới.
 * Phải khớp đúng điều kiện của `findKnownZaloUidByPhone` (cặp đối chiếu dưới cùng).
 */
import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import db from '../../src/config/database.js';
import * as dbHelpers from './helpers/db.js';
import customerMutationRepository from '../../src/repositories/customer/customerMutation.repository.js';

beforeEach(async () => {
  await dbHelpers.truncateAll();
});

afterAll(async () => {
  await db.pool.end();
});

let phoneSequence = 30000000;

async function createOwner(label) {
  phoneSequence += 1;
  const user = await dbHelpers.createUser({ username: `kz_${label}`, phone: `09${phoneSequence}` });
  return Number(user.id);
}

async function insertCustomer({ idUser, workspaceOwnerId = null, phone = null, zaloPhone = null, zaloId = null }) {
  await db.query(
    `INSERT INTO customers (id_user, workspace_owner_id, phone, zalo_phone, zalo_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [idUser, workspaceOwnerId, phone, zaloPhone, zaloId]
  );
}

describe('customerMutation.repository — findPhonesWithKnownZaloUid (CSDL thật)', () => {
  it('khớp cả phone lẫn zalo_phone, bỏ zalo_id rỗng/NULL, đúng workspace (cả chủ lẫn nhân viên), số lạ không có trong kết quả', async () => {
    const owner = await createOwner('owner');
    const other = await createOwner('other');
    const staff = await createOwner('staff');

    await insertCustomer({ idUser: owner, phone: '0901', zaloId: 'U1' }); // khớp bằng phone
    await insertCustomer({ idUser: owner, phone: '0902x', zaloPhone: '0902', zaloId: 'U2' }); // khớp bằng zalo_phone
    await insertCustomer({ idUser: owner, phone: '0903', zaloId: '' }); // zalo_id rỗng
    await insertCustomer({ idUser: owner, phone: '0904', zaloId: null }); // zalo_id NULL
    await insertCustomer({ idUser: other, phone: '0905', zaloId: 'U5' }); // workspace khác
    await insertCustomer({ idUser: staff, workspaceOwnerId: owner, phone: '0906', zaloId: 'U6' }); // nhân viên của owner

    const phones = ['0901', '0902', '0903', '0904', '0905', '0906', '0907'];
    const result = await customerMutationRepository.findPhonesWithKnownZaloUid(owner, phones);

    expect(result).toBeInstanceOf(Set);
    expect([...result].sort()).toEqual(['0901', '0902', '0906']);
  });

  it('khớp với findKnownZaloUidByPhone: số nào hàm đơn trả uid thì hàm hàng loạt có số đó, và ngược lại', async () => {
    const owner = await createOwner('owner2');
    await insertCustomer({ idUser: owner, phone: '0911', zaloId: 'A' });
    await insertCustomer({ idUser: owner, phone: '0912', zaloPhone: '0913', zaloId: 'B' });
    await insertCustomer({ idUser: owner, phone: '0914', zaloId: '' });

    const phones = ['0911', '0912', '0913', '0914', '0915'];
    const batch = await customerMutationRepository.findPhonesWithKnownZaloUid(owner, phones);
    for (const phone of phones) {
      // eslint-disable-next-line no-await-in-loop
      const single = await customerMutationRepository.findKnownZaloUidByPhone(owner, phone);
      expect(batch.has(phone)).toBe(Boolean(single));
    }
  });

  it('danh sách rỗng → Set rỗng', async () => {
    const owner = await createOwner('owner3');
    expect(await customerMutationRepository.findPhonesWithKnownZaloUid(owner, [])).toEqual(new Set());
  });
});
