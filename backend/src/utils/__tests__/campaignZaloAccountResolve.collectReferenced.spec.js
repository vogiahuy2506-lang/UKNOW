/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G3 — `collectReferencedZaloAccountIds`: mọi id tài khoản Zalo mà node NHẮC TỚI,
 * dùng cho kiểm quyền lúc LƯU chiến dịch của nhân viên. Bảo thủ hơn `resolveZaloAccountEntries` (mô phỏng engine): id sót
 * lại, bỏ cờ pool, `get_all_*` kèm id riêng đều phải bị tính — nếu không nhân viên cài sẵn id chưa giao rồi bật cờ sau.
 */
import { describe, it, expect } from '@jest/globals';
import {
  collectReferencedZaloAccountIds,
  resolveZaloAccountEntries,
} from '../campaignZaloAccountResolve.util.js';

const node = (id, subtype, config = {}) => ({ id, node_subtype: subtype, config });

describe('collectReferencedZaloAccountIds', () => {
  it('lấy id đơn của select_zalo_account / send_zalo_personal / send_zalo_group / send_zalo_friend_request', () => {
    expect(collectReferencedZaloAccountIds([
      node(1, 'select_zalo_account', { zaloAccountId: '5' }),
      node(2, 'send_zalo_personal', { zaloAccountId: 6 }),
      node(3, 'send_zalo_group', { zaloAccountId: '7' }),
      node(4, 'send_zalo_friend_request', { zaloAccountId: 8 }),
    ])).toEqual([5, 6, 7, 8]);
  });

  it('get_all_friends / get_all_groups kèm zaloAccountId riêng CŨNG bị tính (kể cả khi flow có select_zalo_account)', () => {
    const nodes = [
      node(1, 'select_zalo_account', { zaloAccountId: '5' }),
      node(2, 'get_all_friends', { zaloAccountId: '9' }),
      node(3, 'get_all_groups', { zaloAccountId: '10' }),
    ];
    expect(collectReferencedZaloAccountIds(nodes)).toEqual([5, 9, 10]);
    // Bản mô phỏng engine bỏ qua hai id này vì có node chọn tài khoản đứng trước — đó là lý do cần hàm riêng.
    const effective = resolveZaloAccountEntries(nodes).flatMap((entry) => entry.ids.map(String));
    expect(effective).toEqual(['5']);
  });

  it('id trong pool / danh sách nhiều tài khoản được tính dù cờ bật-tắt thế nào (cờ "false" không che id)', () => {
    expect(collectReferencedZaloAccountIds([
      node(1, 'select_zalo_account', { zaloPoolMultiAccountEnabled: false, zaloPoolAccountIds: ['11', 12] }),
      node(2, 'send_zalo_personal', { zaloPersonalMultiAccountEnabled: 'false', zaloPersonalAccountIds: [13] }),
      node(3, 'send_zalo_friend_request', { zaloFriendAccountIds: ['14'] }),
    ])).toEqual([11, 12, 13, 14]);
  });

  it('đọc cùng kiểu parseInt với engine: "5abc" và "05" cũng là 5 (đọc chặt hơn engine là mở lối lách)', () => {
    expect(collectReferencedZaloAccountIds([
      node(1, 'send_zalo_personal', { zaloAccountId: '5abc' }),
      node(2, 'send_zalo_group', { zaloAccountId: '05' }),
      node(3, 'send_zalo_personal', { accountId: 6.9 }),
    ])).toEqual([5, 6]);
  });

  it('khoá accountId (node send_zalo cũ) được tính; giá trị rác / rỗng / 0 / âm bị bỏ', () => {
    expect(collectReferencedZaloAccountIds([
      node(1, 'send_zalo', { accountId: '3' }),
      node(2, 'send_zalo_personal', { zaloAccountId: '' }),
      node(3, 'send_zalo_group', { zaloAccountId: 'abc' }),
      node(4, 'send_zalo_group', { zaloAccountId: 0 }),
      node(5, 'send_zalo_group', { zaloAccountId: -4 }),
      node(6, 'send_zalo_group', {}),
    ])).toEqual([3]);
  });

  it('không trùng, giữ thứ tự xuất hiện; chấp nhận cả node_subtype lẫn nodeSubtype', () => {
    expect(collectReferencedZaloAccountIds([
      { nodeSubtype: 'send_zalo_personal', config: { zaloAccountId: 2 } },
      node(2, 'select_zalo_account', { zaloAccountId: '2', zaloPoolAccountIds: ['1', '2'] }),
    ])).toEqual([2, 1]);
  });

  it('node KHÔNG phải node Zalo (email, trigger, telegram…) không đóng góp id; đầu vào rỗng/rác → []', () => {
    expect(collectReferencedZaloAccountIds([
      node(1, 'send_email', { zaloAccountId: '5' }),
      node(2, 'send_telegram', { telegramAccountId: 9, zaloAccountId: '6' }),
      node(3, 'manual', { zaloAccountId: '7' }),
    ])).toEqual([]);
    expect(collectReferencedZaloAccountIds(undefined)).toEqual([]);
    expect(collectReferencedZaloAccountIds(null)).toEqual([]);
    expect(collectReferencedZaloAccountIds([null, undefined, 'x'])).toEqual([]);
  });

  it('config là CHUỖI JSON → vẫn đọc được (bỏ qua chuỗi là mở lối lách); chuỗi hỏng → bỏ, không ném', () => {
    expect(collectReferencedZaloAccountIds([
      { node_subtype: 'send_zalo_personal', config: JSON.stringify({ zaloAccountId: 9 }) },
      { node_subtype: 'send_zalo_group', config: '{not json' },
    ])).toEqual([9]);
  });

  it('config thiếu / không phải object → không ném', () => {
    expect(collectReferencedZaloAccountIds([
      { node_subtype: 'send_zalo_personal' },
      { node_subtype: 'send_zalo_personal', config: 'oops' },
      { node_subtype: 'select_zalo_account', config: { zaloPoolAccountIds: 'not-array' } },
    ])).toEqual([]);
  });
});
