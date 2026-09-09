import { describe, it, expect } from 'vitest';
import {
  FLOW_BOUNDARY_TYPES,
  deriveWizardContext,
  applyWizardSelectionsToScript,
  findLatestInteractiveIndex,
} from '../wizardContext.js';

/**
 * PLAN_WIZARD_VONG_DOI_2026-09-07 PR-1 — mục 11.
 *
 * Gốc bug: hai chiến dịch tạo trong CÙNG một hội thoại — chiến dịch B kế thừa
 * sender/nhóm Zalo của chiến dịch A vì deriveWizardContext không có tín hiệu
 * "chiến dịch A đã tạo xong", chỉ cộng dồn marker theo thứ tự lịch sử.
 * Mirror kịch bản backend aiCampaignWizard.service.spec.js mục 9.
 */
const marker = (payload) => `[wizard]${JSON.stringify(payload)}`;

const historyAfterCampaignA = [
  { role: 'user', content: 'tạo thêm chiến dịch Zalo nhóm nữa' },
  { role: 'assistant', type: 'ask_sender_account', content: 'Dùng tài khoản Zalo nào?' },
  { role: 'user', content: marker({ gate: 'channel', channel: 'zalo_group' }) },
  { role: 'assistant', type: 'ask_sender_account', content: 'Dùng tài khoản Zalo nào?' },
  { role: 'user', content: marker({ gate: 'senderAccount', channel: 'zalo_group', accountId: 8, accountName: 'TK 8' }) },
  { role: 'assistant', type: 'zalo_group_picker', content: 'Chọn nhóm' },
  { role: 'user', content: marker({ gate: 'zaloGroups', accountId: 8, groupIds: ['g1'] }) },
  { role: 'assistant', type: 'confirm_create', content: 'Xác nhận tạo chiến dịch?' },
  { role: 'assistant', type: 'campaign_created', content: '🎉 Chiến dịch đã được tạo.', data: { campaignId: 123 } },
];

describe('wizardContext — ranh giới campaign_created reset trong CÙNG hội thoại', () => {
  it('FLOW_BOUNDARY_TYPES khớp đúng backend (aiCampaignWizard.service.js) — so tay, KHÔNG tự động (2 dự án, 2 test runner khác nhau)', () => {
    expect([...FLOW_BOUNDARY_TYPES].sort()).toEqual(['auto_created_success', 'campaign_abandoned', 'campaign_created']);
  });

  it('deriveWizardContext: ngay sau tin ranh giới, context rỗng — không còn TK 8 / nhóm g1', () => {
    const context = deriveWizardContext(historyAfterCampaignA);
    expect(context.channel).toBeNull();
    expect(context.senderAccountId).toBeNull();
    expect(context.senderAccountName).toBeNull();
    expect(context.zaloGroupIds).toEqual([]);
    expect(context.planApproved).toBe(false);
  });

  it('deriveWizardContext: chiến dịch B chỉ mang dữ liệu marker sau ranh giới, không cộng dồn A', () => {
    const historyWithCampaignB = [
      ...historyAfterCampaignA,
      { role: 'user', content: marker({ gate: 'senderAccount', channel: 'zalo_group', accountId: 9, accountName: 'TK 9' }) },
    ];
    const context = deriveWizardContext(historyWithCampaignB);
    expect(context.senderAccountId).toBe(9);
    expect(context.senderAccountName).toBe('TK 9');
    // Nhóm g1 của chiến dịch A KHÔNG được rò sang — chiến dịch B chưa chọn nhóm.
    expect(context.zaloGroupIds).toEqual([]);
  });

  it('applyWizardSelectionsToScript: context rỗng (zaloGroupIds:[]) KHÔNG ghi đè zaloSelectedGroupIds đã có sẵn trong script', () => {
    const context = deriveWizardContext(historyAfterCampaignA);
    const script = {
      campaignType: 'zalo_group',
      nodes: [
        {
          nodeSubtype: 'get_all_groups',
          config: { zaloSelectedGroupIds: ['gExisting'] },
        },
      ],
    };
    // senderAccountId null + zaloGroupIds [] + không dataSource/sheetUrl → hàm trả nguyên script
    const next = applyWizardSelectionsToScript(script, context);
    expect(next).toBe(script);
    expect(next.nodes[0].config.zaloSelectedGroupIds).toEqual(['gExisting']);
  });
});

/**
 * PLAN_WIZARD_VONG_DOI_2026-09-07 PR-2 — mục 6. Mirror kịch bản backend
 * aiCampaignWizard.service.spec.js mục 5 (lượt thứ hai sau abandon).
 */
describe('wizardContext — ranh giới campaign_abandoned reset trong CÙNG hội thoại', () => {
  const historyAfterAbandonA = [
    { role: 'user', content: marker({ gate: 'channel', channel: 'email' }) },
    { role: 'user', content: marker({ gate: 'senderAccount', channel: 'email', accountId: 7, accountName: 'TK 7' }) },
    { role: 'user', content: marker({ gate: 'dataSource', value: 'db' }) },
    { role: 'user', content: 'thôi' },
    { role: 'assistant', type: 'campaign_abandoned', content: 'Đã dừng.' },
  ];

  it('deriveWizardContext: lượt thứ hai (marker senderAccount 9) không còn sender 7/nguồn db của A', () => {
    const history = [
      ...historyAfterAbandonA,
      { role: 'user', content: 'tạo chiến dịch Zalo mới' },
      { role: 'user', content: marker({ gate: 'senderAccount', channel: 'zalo_group', accountId: 9, accountName: 'TK 9' }) },
    ];
    const context = deriveWizardContext(history);
    expect(context.senderAccountId).toBe(9);
    expect(context.senderAccountName).toBe('TK 9');
    expect(context.dataSource).toBeNull();
    expect(context.channel).not.toBe('email');
  });
});

/**
 * Nghiệm thu thật 09/09: gõ "huỷ" → "Đã dừng" nhưng thẻ cổng cũ vẫn bấm được và wizard chạy
 * tiếp; F5 thì thẻ mất. latestInteractiveIndex phải tắt thẻ đứng trước ranh giới ngay tại chỗ.
 */
describe('findLatestInteractiveIndex — thẻ trước ranh giới không còn sống', () => {
  const INTERACTIVE = ['ask_campaign_details', 'ask_sender_account', 'ask_audience', 'confirm_create', 'zalo_group_picker'];

  it('không có ranh giới → chỉ số thẻ tương tác cuối cùng', () => {
    const history = [
      { role: 'assistant', type: 'ask_sender_account', content: 'Dùng tài khoản nào?' },
      { role: 'user', content: marker({ gate: 'senderAccount', accountId: 7 }) },
      { role: 'assistant', type: 'ask_audience', content: 'Danh sách người nhận lấy từ đâu?' },
    ];
    expect(findLatestInteractiveIndex(history, INTERACTIVE)).toBe(2);
  });

  it('ca production: thẻ dataSource rồi user gõ "huỷ" + tin campaign_abandoned → -1, thẻ cũ tắt', () => {
    const history = [
      { role: 'assistant', type: 'ask_audience', content: 'Danh sách người nhận lấy từ đâu?' },
      { role: 'user', content: 'huỷ' },
      { role: 'assistant', type: 'campaign_abandoned', content: 'Đã dừng.' },
    ];
    expect(findLatestInteractiveIndex(history, INTERACTIVE)).toBe(-1);
  });

  it('sau ranh giới có thẻ mới → chỉ thẻ mới sống', () => {
    const history = [
      { role: 'assistant', type: 'ask_audience', content: 'cũ' },
      { role: 'assistant', type: 'campaign_abandoned', content: 'Đã dừng.' },
      { role: 'user', content: 'tạo chiến dịch email' },
      { role: 'assistant', type: 'ask_sender_account', content: 'mới' },
    ];
    expect(findLatestInteractiveIndex(history, INTERACTIVE)).toBe(3);
  });

  it('campaign_created cũng là ranh giới: thẻ confirm_create trước nó tắt', () => {
    const history = [
      { role: 'assistant', type: 'confirm_create', content: 'Xác nhận?' },
      { role: 'assistant', type: 'campaign_created', content: '🎉', data: { campaignId: 1 } },
    ];
    expect(findLatestInteractiveIndex(history, INTERACTIVE)).toBe(-1);
  });

  it('tin ranh giới do user gửi (không phải assistant) không được tính là ranh giới', () => {
    const history = [
      { role: 'assistant', type: 'ask_audience', content: 'thẻ' },
      { role: 'user', type: 'campaign_abandoned', content: 'giả' },
    ];
    expect(findLatestInteractiveIndex(history, INTERACTIVE)).toBe(0);
  });

  it('nhận Set lẫn mảng cho interactiveTypes; messages không phải mảng → -1', () => {
    const history = [{ role: 'assistant', type: 'ask_audience', content: 'thẻ' }];
    expect(findLatestInteractiveIndex(history, new Set(INTERACTIVE))).toBe(0);
    expect(findLatestInteractiveIndex(null, INTERACTIVE)).toBe(-1);
  });
});
