/**
 * Rà soát C P3-4 (04/10/2026) — marker chọn bạn bè Zalo chỉ mang SỐ LƯỢNG; danh sách UID giữ ở `wizard_state` trên server.
 *
 * Trước đây FE gửi `{ gate:'zaloFriends', friendIds:[…UID…] }` + câu "Tôi chọn N bạn bè: <≤5 tên>" nên UID + tên đi vào prompt Gemini MỌI lượt sau đó
 * (tới 50.000 UID mỗi lượt). Nay FE ghi UID bằng action PATCH `set_zalo_friends` rồi mới gửi marker `{ gate:'zaloFriends', friendCount }`.
 */
import { describe, expect, it } from '@jest/globals';
import {
  WIZARD_STATE_ACTIONS,
  applyWizardStateAction,
  createEmptyWizardState,
  evaluateNextGate,
  extractWizardState,
  mergeWizardState,
} from '../aiCampaignWizard.service.js';

const user = (content) => ({ role: 'user', content });
const marker = (payload, text = 'x') => user(`[wizard]${JSON.stringify(payload)}\n${text}`);

const UIDS = ['100000000000001', '100000000000002', '100000000000003'];
const ZALO_ACCOUNTS = [{ id: 5, displayName: 'Shop', status: 'connected', isActive: true }];

const historyToFriends = (...extra) => [
  user('Tạo chiến dịch Zalo gửi cho bạn bè Zalo'),
  marker({ gate: 'channel', channel: 'zalo' }, 'Zalo cá nhân'),
  marker({ gate: 'senderAccount', channel: 'zalo', accountId: 5, accountName: 'Shop' }, 'Shop'),
  marker({ gate: 'dataSource', value: 'zalo_contacts' }, 'Danh bạ Zalo'),
  ...extra,
];

const persistedWith = (zaloFriendIds, extra = {}) => ({
  ...createEmptyWizardState().gates,
  channel: 'zalo',
  senderAccountId: 5,
  dataSource: 'zalo_contacts',
  isCampaignFlow: true,
  zaloFriendIds,
  ...extra,
});

describe('action PATCH set_zalo_friends', () => {
  it('là một action hợp lệ và ghi UID vào gates.zaloFriendIds (bỏ trùng, cắt khoảng trắng)', () => {
    expect(WIZARD_STATE_ACTIONS).toContain('set_zalo_friends');
    const { state, changed } = applyWizardStateAction(createEmptyWizardState(), 'set_zalo_friends', { friendIds: [...UIDS, ` ${UIDS[0]} `] });

    expect(changed).toBe(true);
    expect(state.gates.zaloFriendIds).toEqual(UIDS);
  });

  it('chọn lại danh sách khác → thay hẳn danh sách cũ (không cộng dồn)', () => {
    const first = applyWizardStateAction(createEmptyWizardState(), 'set_zalo_friends', { friendIds: UIDS }).state;
    const second = applyWizardStateAction(first, 'set_zalo_friends', { friendIds: [UIDS[0]] }).state;
    expect(second.gates.zaloFriendIds).toEqual([UIDS[0]]);
  });

  it('rỗng / UID không hợp lệ → 400, không ghi', () => {
    const empty = createEmptyWizardState();
    expect(() => applyWizardStateAction(empty, 'set_zalo_friends', { friendIds: [] })).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => applyWizardStateAction(empty, 'set_zalo_friends', {})).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => applyWizardStateAction(empty, 'set_zalo_friends', { friendIds: ['abc'] })).toThrow(/UID Zalo không hợp lệ/);
    expect(() => applyWizardStateAction(empty, 'set_zalo_friends', { friendIds: ['123'] })).toThrow(/UID Zalo không hợp lệ/);
  });

  it('không đụng các gate khác', () => {
    const base = { ...createEmptyWizardState(), gates: { ...createEmptyWizardState().gates, channel: 'zalo', senderAccountId: 5 } };
    const { state } = applyWizardStateAction(base, 'set_zalo_friends', { friendIds: UIDS });
    expect(state.gates).toMatchObject({ channel: 'zalo', senderAccountId: 5, zaloFriendIds: UIDS });
  });
});

describe('marker zaloFriends chỉ mang số lượng', () => {
  it('extractWizardState: marker mới → zaloFriendCount = N, zaloFriendIds rỗng (UID không nằm trong lịch sử)', () => {
    const state = extractWizardState(historyToFriends(marker({ gate: 'zaloFriends', accountId: 5, friendCount: 3 }, 'Tôi chọn 3 bạn bè từ danh bạ Zalo.')));

    expect(state.zaloFriendCount).toBe(3);
    expect(state.zaloFriendIds).toEqual([]);
  });

  it('marker KIỂU CŨ còn mang friendIds vẫn đọc được (phiên đang dở lúc triển khai)', () => {
    const state = extractWizardState(historyToFriends(marker({ gate: 'zaloFriends', accountId: 5, friendIds: UIDS })));
    expect(state.zaloFriendIds).toEqual(UIDS);
  });

  it('friendCount không phải số nguyên dương → null', () => {
    const state = extractWizardState(historyToFriends(marker({ gate: 'zaloFriends', friendCount: 'nhieu' })));
    expect(state.zaloFriendCount).toBeNull();
  });

  it('đổi kênh / ranh giới chiến dịch xoá số lượng', () => {
    const switched = extractWizardState([
      ...historyToFriends(marker({ gate: 'zaloFriends', friendCount: 3 })),
      marker({ gate: 'channel', channel: 'email' }),
    ]);
    expect(switched.zaloFriendCount).toBeNull();
  });
});

describe('mergeWizardState — UID đã lưu ở server khớp với marker số lượng', () => {
  it('marker số lượng KHỚP bản đã lưu → dùng UID đã lưu; cổng zaloFriends thông qua, wizard đi tiếp', () => {
    const derived = extractWizardState(historyToFriends(marker({ gate: 'zaloFriends', accountId: 5, friendCount: 3 })));
    const merged = mergeWizardState(persistedWith(UIDS), derived, {});

    expect(merged.zaloFriendIds).toEqual(UIDS);
    const next = evaluateNextGate({ ...merged, isCampaignFlow: true, hasAttachedFile: false }, { zaloAccounts: ZALO_ACCOUNTS, courses: [] }, 'vi');
    expect(next?.gate).not.toBe('zaloFriends');
  });

  it('số lượng LỆCH bản đã lưu (danh sách đã lưu không thuộc lần chọn này) → coi như chưa chọn, cổng hỏi lại thẻ bạn bè', () => {
    const derived = extractWizardState(historyToFriends(marker({ gate: 'zaloFriends', accountId: 5, friendCount: 2 })));
    const merged = mergeWizardState(persistedWith(UIDS), derived, {});

    expect(merged.zaloFriendIds).toEqual([]);
    const next = evaluateNextGate({ ...merged, isCampaignFlow: true }, { zaloAccounts: ZALO_ACCOUNTS, courses: [] }, 'vi');
    expect(next.gate).toBe('zaloFriends');
    expect(next.response.type).toBe('zalo_friend_picker');
  });

  it('marker số lượng nhưng server CHƯA có danh sách (ghi lỗi) → cổng hỏi lại, không đi tiếp với danh sách rỗng', () => {
    const derived = extractWizardState(historyToFriends(marker({ gate: 'zaloFriends', accountId: 5, friendCount: 3 })));
    const merged = mergeWizardState(persistedWith([]), derived, {});

    expect(merged.zaloFriendIds).toEqual([]);
    expect(evaluateNextGate({ ...merged, isCampaignFlow: true }, { zaloAccounts: ZALO_ACCOUNTS }, 'vi').gate).toBe('zaloFriends');
  });

  it('marker KIỂU CŨ mang UID → derived thắng bản đã lưu', () => {
    const derived = extractWizardState(historyToFriends(marker({ gate: 'zaloFriends', accountId: 5, friendIds: [UIDS[0]] })));
    expect(mergeWizardState(persistedWith(UIDS), derived, {}).zaloFriendIds).toEqual([UIDS[0]]);
  });

  it('không có marker zaloFriends trong lượt này (F5, lượt sau) → giữ bản đã lưu', () => {
    const derived = extractWizardState([user('tiếp tục')]);
    expect(mergeWizardState(persistedWith(UIDS), derived, {}).zaloFriendIds).toEqual(UIDS);
  });

  it('đổi kênh → danh sách đã lưu KHÔNG sống sót', () => {
    const derived = extractWizardState([
      ...historyToFriends(marker({ gate: 'zaloFriends', friendCount: 3 })),
      marker({ gate: 'channel', channel: 'email' }),
    ]);
    expect(mergeWizardState(persistedWith(UIDS), derived, {}).zaloFriendIds).toEqual([]);
  });
});
