import { describe, it, expect } from '@jest/globals';
import { getNodeOwnZaloAccountSpec, resolveZaloAccountEntries } from '../campaignZaloAccountResolve.util.js';

const node = (id, subtype, config = {}) => ({ id, node_subtype: subtype, config });

describe('getNodeOwnZaloAccountSpec', () => {
  it('select_zalo_account: pool bật + có id → multi theo pool, bỏ qua zaloAccountId sót lại', () => {
    expect(getNodeOwnZaloAccountSpec(node(1, 'select_zalo_account', {
      zaloPoolMultiAccountEnabled: 'true', zaloPoolAccountIds: ['5', 5, ' 6 '], zaloAccountId: '9',
    }))).toEqual({ multi: true, ids: ['5', '6'] });
  });

  it('select_zalo_account: cờ pool dạng chuỗi "false" KHÔNG được hiểu là bật', () => {
    expect(getNodeOwnZaloAccountSpec(node(1, 'select_zalo_account', {
      zaloPoolMultiAccountEnabled: 'false', zaloPoolAccountIds: ['5', '6'], zaloAccountId: '9',
    }))).toEqual({ multi: false, ids: ['9'] });
  });

  it('send_zalo_personal: nhiều tài khoản chỉ khi có id VÀ cờ bật; ngược lại dùng zaloAccountId', () => {
    expect(getNodeOwnZaloAccountSpec(node(2, 'send_zalo_personal', {
      zaloPersonalMultiAccountEnabled: true, zaloPersonalAccountIds: ['7', '8'],
    }))).toEqual({ multi: true, ids: ['7', '8'] });
    expect(getNodeOwnZaloAccountSpec(node(2, 'send_zalo_personal', {
      zaloPersonalMultiAccountEnabled: false, zaloPersonalAccountIds: ['7', '8'], zaloAccountId: '4',
    }))).toEqual({ multi: false, ids: ['4'] });
  });

  it('send_zalo_friend_request đọc zaloFriendAccountIds; send_zalo_group luôn đơn', () => {
    expect(getNodeOwnZaloAccountSpec(node(3, 'send_zalo_friend_request', {
      zaloFriendMultiAccountEnabled: true, zaloFriendAccountIds: ['1', '2'],
    }))).toEqual({ multi: true, ids: ['1', '2'] });
    expect(getNodeOwnZaloAccountSpec(node(4, 'send_zalo_group', { zaloAccountId: '3', zaloPersonalAccountIds: ['1', '2'] })))
      .toEqual({ multi: false, ids: ['3'] });
  });

  it('subtype không phải node Zalo gửi → null', () => {
    expect(getNodeOwnZaloAccountSpec(node(5, 'send_email'))).toBeNull();
  });
});

describe('resolveZaloAccountEntries (luật preflight)', () => {
  it('flow có select_zalo_account: id riêng của node gửi KHÔNG vào danh sách', () => {
    const entries = resolveZaloAccountEntries([
      node(1, 'select_zalo_account', { zaloAccountId: '10' }),
      node(2, 'send_zalo_personal', { zaloAccountId: '99' }),
      node(3, 'send_zalo_group', { zaloAccountId: '98' }),
    ]);
    expect(entries).toEqual([{ nodeId: 1, subtype: 'select_zalo_account', kind: 'single', ids: ['10'] }]);
  });

  it('không có select: node gửi đơn → single, nhiều tài khoản → group', () => {
    const entries = resolveZaloAccountEntries([
      node(2, 'send_zalo_personal', { zaloPersonalMultiAccountEnabled: true, zaloPersonalAccountIds: ['1', '2'] }),
      node(3, 'send_zalo_friend_request', { zaloAccountId: '4' }),
    ]);
    expect(entries.map((e) => [e.nodeId, e.kind, e.ids])).toEqual([[2, 'group', ['1', '2']], [3, 'single', ['4']]]);
  });

  it('get_all_friends có nguồn tài khoản riêng qua node khác → bỏ qua; không có → single', () => {
    expect(resolveZaloAccountEntries([node(1, 'get_all_friends', { zaloFriendAccountNodeId: '7', zaloAccountId: '3' })])).toEqual([]);
    expect(resolveZaloAccountEntries([node(1, 'get_all_groups', { zaloAccountId: '3' })]))
      .toEqual([{ nodeId: 1, subtype: 'get_all_groups', kind: 'single', ids: ['3'] }]);
  });

  it('subtype send_zalo cũ → fallback zaloAccountId ?? accountId', () => {
    expect(resolveZaloAccountEntries([node(1, 'send_zalo', { accountId: '12' })]))
      .toEqual([{ nodeId: 1, subtype: 'send_zalo', kind: 'single', ids: ['12'] }]);
  });
});
