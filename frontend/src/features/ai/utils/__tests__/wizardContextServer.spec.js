/**
 * PR-C2 (C-NO-GOC1) — wizardContext dựng từ gates server; rơi về suy từ lịch sử khi thiếu.
 */
import { describe, it, expect } from 'vitest';
import {
  acceptServerWizardState,
  contextFromServerGates,
  countUserMessages,
  deriveWizardContext,
  extractServerWizardState,
  resolveWizardContext,
} from '../wizardContext';

const marker = (obj, label = 'x') => ({ role: 'user', content: `[wizard]${JSON.stringify(obj)}\n${label}`, silent: true });
const serverState = (gates, updatedAt = '2026-10-10T10:00:00.000Z') => ({ v: 1, gates, plan: { status: null, campaignId: null }, meta: { updatedAt } });

describe('resolveWizardContext — lấy từ server', () => {
  const messages = [
    { role: 'assistant', content: 'welcome' },
    { role: 'user', content: 'Tạo chiến dịch zalo' },
    marker({ gate: 'channel', channel: 'zalo' }),
    marker({ gate: 'senderAccount', channel: 'zalo', accountId: 8 }),
  ];

  it('có turnMark khớp số tin user → context CHÍNH LÀ gates server (không phải thứ suy ra từ lịch sử)', () => {
    const gates = { channel: 'email', senderAccountId: 7, senderAccountName: 'Sales', dataSource: 'db', schedule: { mode: 'once' }, planApproved: true };
    // Lịch sử nói zalo/TK 8; server nói email/TK 7 → phải thấy server.
    expect(deriveWizardContext(messages).senderAccountId).toBe(8);
    const ctx = resolveWizardContext({ messages, serverGates: gates, turnMark: { gates, userCount: countUserMessages(messages) } });
    expect(ctx).toEqual(contextFromServerGates(gates));
    expect(ctx).toMatchObject({ channel: 'email', senderAccountId: 7, senderAccountName: 'Sales', dataSource: 'db', planApproved: true });
  });

  it('có tin user mới sau phản hồi (vừa bấm nút) → dùng đường suy từ lịch sử để lựa chọn hiện ngay', () => {
    const gates = { channel: 'zalo', senderAccountId: 8 };
    const turnMark = { gates, userCount: countUserMessages(messages) };
    const next = [...messages, marker({ gate: 'dataSource', value: 'sheet' })];
    const ctx = resolveWizardContext({ messages: next, serverGates: gates, turnMark });
    expect(ctx.dataSource).toBe('sheet');
    expect(ctx.senderAccountId).toBe(8);
  });
});

describe('resolveWizardContext — BE cũ / phản hồi thiếu wizardState (fallback)', () => {
  const messages = [
    { role: 'user', content: 'Tạo chiến dịch zalo' },
    marker({ gate: 'channel', channel: 'zalo' }),
    marker({ gate: 'senderAccount', channel: 'zalo', accountId: 8 }),
  ];

  it('không có turnMark và không có gates → deriveWizardContext như cũ', () => {
    expect(resolveWizardContext({ messages })).toEqual(deriveWizardContext(messages));
  });

  it('không có turnMark nhưng có gates tải lúc mở phiên → derive + lấp chỗ trống bằng gates (như cũ)', () => {
    const ctx = resolveWizardContext({ messages: [{ role: 'user', content: 'tiếp tục' }], serverGates: { channel: 'email', senderAccountId: 7 } });
    expect(ctx).toMatchObject({ channel: 'email', senderAccountId: 7 });
  });

  it('phản hồi không có wizardState → extract/accept trả null để FE KHÔNG tạo turnMark', () => {
    expect(extractServerWizardState(undefined)).toBeNull();
    expect(acceptServerWizardState({ v: 2, gates: {} })).toBeNull();
    expect(acceptServerWizardState({ v: 1 })).toBeNull();
  });
});

describe('phản hồi PATCH cập nhật gates', () => {
  it('nhận PATCH mới hơn; bỏ PATCH/chat cũ về muộn', () => {
    const chat = acceptServerWizardState(serverState({ channel: 'email' }, '2026-10-10T10:00:05.000Z'));
    expect(chat.gates.channel).toBe('email');
    expect(acceptServerWizardState(serverState({ channel: 'zalo' }, '2026-10-10T10:00:01.000Z'), chat.updatedAt)).toBeNull();
    expect(acceptServerWizardState(serverState({ planApproved: true }, '2026-10-10T10:00:09.000Z'), chat.updatedAt).gates.planApproved).toBe(true);
  });

  it('approve_plan: gates mới của PATCH thay context cho tới khi có tin user kế tiếp', () => {
    const messages = [{ role: 'user', content: 'Tạo chiến dịch' }];
    const patched = acceptServerWizardState(serverState({ channel: 'email', planApproved: true }));
    const ctx = resolveWizardContext({ messages, turnMark: { gates: patched.gates, userCount: countUserMessages(messages) } });
    expect(ctx.planApproved).toBe(true);
  });
});

describe('hai chiến dịch trong cùng một chat', () => {
  it('sau mark_campaign_created: PATCH trả gates rỗng → context rỗng dù lịch sử còn marker của chiến dịch A; chiến dịch B hỏi lại từ đầu', () => {
    const campaignA = [
      { role: 'user', content: 'Tạo chiến dịch zalo nhóm' },
      marker({ gate: 'channel', channel: 'zalo_group' }),
      marker({ gate: 'senderAccount', channel: 'zalo_group', accountId: 8 }),
      marker({ gate: 'zaloGroups', accountId: 8, groupIds: ['g1'] }),
    ];
    const afterA = [...campaignA, { role: 'assistant', type: 'campaign_created', content: 'xong', data: { campaignId: 1 } }];
    // PATCH mark_campaign_created trả gates rỗng.
    const emptied = acceptServerWizardState(serverState({ channel: null, senderAccountId: null, zaloGroupIds: [], dataSource: null }));
    const ctx = resolveWizardContext({ messages: afterA, turnMark: { gates: emptied.gates, userCount: countUserMessages(afterA) } });
    expect(ctx).toMatchObject({ channel: null, senderAccountId: null, zaloGroupIds: [], dataSource: null, planApproved: false });

    // Chiến dịch B: người dùng gõ tiếp, BE cũ không trả wizardState → đường suy từ lịch sử vẫn dừng ở ranh giới.
    const afterB = [...afterA, { role: 'user', content: 'Tạo thêm chiến dịch nữa' }, marker({ gate: 'senderAccount', channel: 'zalo_group', accountId: 9 })];
    const fallback = resolveWizardContext({ messages: afterB, serverGates: emptied.gates, turnMark: { gates: emptied.gates, userCount: countUserMessages(afterA) } });
    expect(fallback.senderAccountId).toBe(9);
    expect(fallback.zaloGroupIds).toEqual([]);
  });
});
