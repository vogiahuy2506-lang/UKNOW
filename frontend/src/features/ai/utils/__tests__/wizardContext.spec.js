import { describe, it, expect } from 'vitest';
import {
  FLOW_BOUNDARY_TYPES,
  deriveWizardContext,
  contextFromServerGates,
  normalizeFormId,
  mergeClientWizardContext,
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

describe('PR-6c: applyWizardSelectionsToScript — dataSource "form" đổi node interested_customers thành read_form_submissions', () => {
  it('dataSource=form + context.formId → node đổi subtype và điền config.formId', () => {
    const script = {
      campaignType: 'email',
      nodes: [
        { nodeSubtype: 'interested_customers', config: {} },
      ],
    };
    const next = applyWizardSelectionsToScript(script, { dataSource: 'form', formId: 12 });
    expect(next.nodes[0].nodeSubtype).toBe('read_form_submissions');
    expect(next.nodes[0].config.formId).toBe(12);
  });

  it('dataSource=form không có context.formId → config.formId rỗng, chờ chọn trong builder', () => {
    const script = {
      campaignType: 'email',
      nodes: [
        { nodeSubtype: 'interested_customers', config: {} },
      ],
    };
    const next = applyWizardSelectionsToScript(script, { dataSource: 'form', senderAccountId: 7 });
    expect(next.nodes[0].nodeSubtype).toBe('read_form_submissions');
    expect(next.nodes[0].config.formId).toBe('');
  });
});

/**
 * Rà soát C P2-7 — nguồn "Đăng ký từ Landing Page". Trước đây FE vá cứng node khách DB thành `read_landing_leads` với
 * `landingLeadsSlugs: []` = MỌI lead của MỌI landing → gửi nhầm người. Nay chỉ vá theo lựa chọn người dùng ĐÃ làm ở cổng landingLeads;
 * chưa chọn thì KHÔNG vá và đánh dấu để nơi tạo chiến dịch từ chối.
 */
describe('C P2-7: nguồn landing — deriveWizardContext + applyWizardSelectionsToScript', () => {
  const landingHistory = (...extra) => [
    { role: 'user', content: marker({ gate: 'channel', channel: 'email' }) },
    { role: 'user', content: marker({ gate: 'dataSource', value: 'landing' }) },
    ...extra,
  ];
  const scriptWithDbNode = () => ({
    campaignType: 'email',
    nodes: [{ tempId: 'n2', nodeType: 'data', nodeSubtype: 'interested_customers', config: { interestedCustomerType: 'both' } }],
  });

  it('deriveWizardContext đọc marker landingLeads: slug chuẩn hoá hoặc all:true tường minh', () => {
    const picked = deriveWizardContext(landingHistory({ role: 'user', content: marker({ gate: 'landingLeads', slugs: [' /Khoa-IELTS/ ', 'khoa-toeic', 'khoa-ielts'] }) }));
    expect(picked.landingLeadsSlugs).toEqual(['khoa-ielts', 'khoa-toeic']);
    expect(picked.landingLeadsAll).toBe(false);

    const all = deriveWizardContext(landingHistory({ role: 'user', content: marker({ gate: 'landingLeads', all: true }) }));
    expect(all.landingLeadsAll).toBe(true);
    expect(all.landingLeadsSlugs).toEqual([]);
  });

  it('marker rỗng / all không phải boolean true KHÔNG được hiểu là "tất cả"', () => {
    expect(deriveWizardContext(landingHistory({ role: 'user', content: marker({ gate: 'landingLeads', slugs: [] }) })).landingLeadsAll).toBe(false);
    expect(deriveWizardContext(landingHistory({ role: 'user', content: marker({ gate: 'landingLeads', all: 'true' }) })).landingLeadsAll).toBe(false);
  });

  it('chọn lại nguồn (marker dataSource) / đổi kênh / ranh giới chiến dịch → xoá lựa chọn landing cũ', () => {
    const pick = { role: 'user', content: marker({ gate: 'landingLeads', slugs: ['khoa-ielts'] }) };
    expect(deriveWizardContext([...landingHistory(pick), { role: 'user', content: marker({ gate: 'dataSource', value: 'landing' }) }]).landingLeadsSlugs).toEqual([]);
    expect(deriveWizardContext([...landingHistory(pick), { role: 'user', content: marker({ gate: 'channel', channel: 'zalo' }) }]).landingLeadsSlugs).toEqual([]);
    expect(deriveWizardContext([...landingHistory(pick), { role: 'assistant', type: 'campaign_created', content: 'xong' }]).landingLeadsSlugs).toEqual([]);
  });

  it('mergeClientWizardContext: marker còn mất khỏi history (F5) → lấy lựa chọn đã lưu ở server; marker trong history thắng', () => {
    const fromServer = mergeClientWizardContext(deriveWizardContext([]), { landingLeadsSlugs: ['khoa-ielts'], landingLeadsAll: false });
    expect(fromServer.landingLeadsSlugs).toEqual(['khoa-ielts']);
    expect(mergeClientWizardContext(deriveWizardContext([]), { landingLeadsAll: true }).landingLeadsAll).toBe(true);

    const derived = deriveWizardContext(landingHistory({ role: 'user', content: marker({ gate: 'landingLeads', slugs: ['khoa-toeic'] }) }));
    expect(mergeClientWizardContext(derived, { landingLeadsSlugs: ['khoa-ielts'] }).landingLeadsSlugs).toEqual(['khoa-toeic']);
  });

  it('đã chọn landing → node khách DB thành read_landing_leads với ĐÚNG slug đã chọn (không phải [])', () => {
    const context = deriveWizardContext(landingHistory({ role: 'user', content: marker({ gate: 'landingLeads', slugs: ['khoa-ielts'] }) }));
    const next = applyWizardSelectionsToScript(scriptWithDbNode(), context);

    expect(next.nodes[0].nodeSubtype).toBe('read_landing_leads');
    expect(next.nodes[0].config).toEqual({ landingLeadsSlugs: ['khoa-ielts'] });
    expect(next.landingSelectionMissing).toBeUndefined();
    expect(next.landingLeadsAll).toBeUndefined();
  });

  it('"Tất cả landing" tường minh → slug rỗng được phép, script mang dấu landingLeadsAll', () => {
    const context = deriveWizardContext(landingHistory({ role: 'user', content: marker({ gate: 'landingLeads', all: true }) }));
    const next = applyWizardSelectionsToScript(scriptWithDbNode(), context);

    expect(next.nodes[0].nodeSubtype).toBe('read_landing_leads');
    expect(next.nodes[0].config.landingLeadsSlugs).toEqual([]);
    expect(next.landingLeadsAll).toBe(true);
  });

  it('CHƯA chọn landing (ca lỗi gốc) → KHÔNG vá thành read_landing_leads slug rỗng; node giữ nguyên, script bị đánh dấu landingSelectionMissing', () => {
    const context = deriveWizardContext(landingHistory());
    const next = applyWizardSelectionsToScript(scriptWithDbNode(), context);

    expect(next.nodes[0].nodeSubtype).toBe('interested_customers');
    expect(JSON.stringify(next.nodes)).not.toContain('landingLeadsSlugs');
    expect(next.landingSelectionMissing).toBe(true);
  });

  it('nguồn khác landing không bị đụng tới và không có dấu landing nào', () => {
    const next = applyWizardSelectionsToScript(scriptWithDbNode(), { dataSource: 'db', senderAccountId: 7 });
    expect(next.nodes[0].nodeSubtype).toBe('interested_customers');
    expect(next.landingSelectionMissing).toBeUndefined();
  });
});

/**
 * Cổng formId (10/10/2026) — nguồn "Người điền Biểu mẫu". Trước đây không ai ghi `context.formId` nên node read_form_submissions luôn
 * mang formId ''. Mirror backend wizardFormGate.spec.js.
 */
describe('cổng formId — deriveWizardContext / contextFromServerGates / applyWizardSelectionsToScript', () => {
  const formHistory = (...extra) => [
    { role: 'user', content: marker({ gate: 'channel', channel: 'email' }) },
    { role: 'user', content: marker({ gate: 'senderAccount', channel: 'email', accountId: 7, accountName: 'Shop' }) },
    { role: 'user', content: marker({ gate: 'dataSource', value: 'form' }) },
    ...extra,
  ];
  const pick = (formId) => ({ role: 'user', content: marker({ gate: 'formId', formId }) });
  const scriptWithDbNode = () => ({
    campaignType: 'email',
    nodes: [{ nodeSubtype: 'interested_customers', config: {} }],
  });

  it('marker formId → context.formId là số; id rác là null', () => {
    expect(deriveWizardContext(formHistory(pick(7))).formId).toBe(7);
    expect(deriveWizardContext(formHistory(pick('7'))).formId).toBe(7);
    [0, -1, 1.5, 'abc', '', null].forEach((bad) => {
      expect(deriveWizardContext(formHistory(pick(bad))).formId).toBeNull();
    });
    expect(normalizeFormId(undefined)).toBeNull();
  });

  it('chọn lại nguồn / đổi kênh / ranh giới chiến dịch → xoá biểu mẫu cũ', () => {
    const picked = formHistory(pick(7));
    expect(deriveWizardContext([...picked, { role: 'user', content: marker({ gate: 'dataSource', value: 'form' }) }]).formId).toBeNull();
    expect(deriveWizardContext([...picked, { role: 'user', content: marker({ gate: 'channel', channel: 'zalo' }) }]).formId).toBeNull();
    expect(deriveWizardContext([...picked, { role: 'assistant', type: 'campaign_created', content: 'xong' }]).formId).toBeNull();
  });

  it('contextFromServerGates mang formId của gates server; mergeClientWizardContext lấp chỗ trống khi marker mất (F5)', () => {
    expect(contextFromServerGates({ dataSource: 'form', formId: 7 }).formId).toBe(7);
    expect(contextFromServerGates({}).formId).toBeNull();
    expect(mergeClientWizardContext(deriveWizardContext([]), { formId: 7 }).formId).toBe(7);
    expect(mergeClientWizardContext(deriveWizardContext(formHistory(pick(9))), { formId: 7 }).formId).toBe(9);
  });

  it('đã chọn biểu mẫu → node khách DB thành read_form_submissions với ĐÚNG formId đã chọn', () => {
    const context = contextFromServerGates({ channel: 'email', senderAccountId: 7, dataSource: 'form', formId: 7 });
    const next = applyWizardSelectionsToScript(scriptWithDbNode(), context);
    expect(next.nodes[0].nodeSubtype).toBe('read_form_submissions');
    expect(next.nodes[0].config.formId).toBe(7);
  });
});
