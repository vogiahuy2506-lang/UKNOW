import { describe, it, expect } from 'vitest';
import {
  FLOW_BOUNDARY_TYPES,
  deriveWizardContext,
  applyWizardSelectionsToScript,
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
  it('FLOW_BOUNDARY_TYPES khớp đúng backend (aiCampaignWizard.service.js)', () => {
    expect([...FLOW_BOUNDARY_TYPES].sort()).toEqual(['auto_created_success', 'campaign_created']);
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
