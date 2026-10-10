/**
 * F2.3 (rà soát C P1-4) — `create_and_run` do MODEL tự quyết, không qua xác nhận.
 *
 * Trước đây chỉ luồng gửi nhanh và luồng nhập người nhận tay có chốt tất định; còn lại là luật prompt. Model hiểu sai (hoặc bị
 * câu trong tệp PDF/Docs dẫn) → chiến dịch được tạo + kích hoạt + chạy ngay trên khách DB ≤1000 / nhóm Zalo / mọi người từng
 * nhắn Telegram, người dùng không thấy nội dung lẫn bộ lọc.
 *
 * Cổng TẤT ĐỊNH cho mọi luồng: chỉ giữ `create_and_run` khi tin GÕ TAY mới nhất nói rõ "tạo và chạy" / "chạy ngay chiến dịch";
 * không thì hạ về `confirm_create`. Cả hai ca đều chạy qua processSmartChat (marker wizard thật + lời model hình dạng thật).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createBrainGeminiAdapter } from './fixtures/brainGeminiAdapter.js';

const axiosPost = jest.fn();
const extractGeminiUsage = jest.fn();
const reserve = jest.fn();
const record = jest.fn();
const getActiveEmailSenders = jest.fn();

jest.unstable_mockModule('axios', () => ({ default: { post: axiosPost } }));
// runChat đi qua generateGeminiContent (G2.3): ranh giới Google giả nằm ở đó nhưng trả đúng hình dạng kết quả của lõi.
jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({
  extractGeminiUsage,
  generateGeminiContent: createBrainGeminiAdapter({ axiosPost, extractGeminiUsage }),
}));
jest.unstable_mockModule('../businessProfile.service.js', () => ({
  default: {
    getProfile: jest.fn(),
    getContextForPrompt: jest.fn(async () => ''),
    formatProfileForPrompt: jest.fn(() => ''),
    getFormattedProfileForPrompt: jest.fn(async () => ''),
  },
  serializeProductList: jest.fn(() => ''),
}));
jest.unstable_mockModule('../adminContext.service.js', () => ({ buildAdminContext: jest.fn() }));
jest.unstable_mockModule('../aiLandingPage.service.js', () => ({ default: { generate: jest.fn() } }));
jest.unstable_mockModule('../../../controllers/upload.controller.js', () => ({ default: { readTempFileBuffer: jest.fn() } }));
jest.unstable_mockModule('../../../utils/fileParser.util.js', () => ({ extractTextFromBuffer: jest.fn() }));
jest.unstable_mockModule('../../../utils/googleUrlFetch.util.js', () => ({
  attachGoogleUrlParts: jest.fn(async () => ({ parts: [], warnings: [] })),
}));
jest.unstable_mockModule('../aiPromptResources.service.js', () => ({
  default: {
    getZaloAccountsFull: jest.fn(async () => []),
    getActiveEmailSenders,
    getEmailTemplates: jest.fn(async () => []),
    getZaloAccounts: jest.fn(async () => []),
    getZaloGroups: jest.fn(async () => []),
    getZaloTemplates: jest.fn(async () => []),
    getRecommendedCampaignType: jest.fn(async () => 'email'),
    getCustomerStats: jest.fn(async () => ({ total: 10, hasEmail: 10, hasZalo: 0 })),
    getCourses: jest.fn(async () => []),
    getLandingPages: jest.fn(async () => []),
    getForms: jest.fn(async () => []),
    getAdapterChannelAccounts: async () => ({ telegram: [], whatsapp: [] }),
    getAdapterAccountsPromptBlock: async () => '',
    getAdapterNodeTypesPromptLines: () => '',
    getBlockedZaloPromptNotice: () => '',
  },
}));
jest.unstable_mockModule('../aiUsageMeter.service.js', () => ({
  default: { reserve, record, resolveFallbackModel: jest.fn(async () => null) },
}));
jest.unstable_mockModule('../aiModelPolicy.service.js', () => ({
  resolveAllowedModel: jest.fn(async (_userId, model) => model || 'gemini-2.5-flash'),
}));

const { default: aiCampaignService, EXPLICIT_CREATE_AND_RUN_RE, lastHandTypedUserText } = await import('../aiCampaign.service.js');

const MODEL_CREATE_AND_RUN = {
  type: 'create_and_run',
  content: 'Đang tạo và chạy chiến dịch cho bạn...',
  data: {
    campaignName: 'Email khách quen',
    campaignType: 'email',
    autoRun: true,
    nodes: [
      { tempId: 'n_audience', nodeType: 'data', nodeSubtype: 'interested_customers', config: { interestedCustomerType: 'both', interestedLimit: 1000 } },
      {
        tempId: 'n_send',
        nodeType: 'action',
        nodeSubtype: 'send_email',
        config: {
          recipientSource: 'node',
          recipientNodeId: 'n_audience',
          recipientField: 'email',
          emailSteps: [{ emailSubject: 'Mời bạn', emailBody: '<p>Xin chào {{full_name}}</p>', delayValue: 0 }],
        },
      },
    ],
    connections: [{ sourceNodeId: 'n_audience', targetNodeId: 'n_send', connectionType: 'default', connectionLabel: '' }],
  },
  missing_fields: [],
};

const WIZARD_MARKERS = [
  { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' },
  { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":1}\nEmail 1' },
  { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nKhách trong DB' },
  { role: 'user', content: '[wizard]{"gate":"campaignBrief","contentMode":"custom_topic","topicText":"Mời khách quen"}\nChủ đề' },
  { role: 'user', content: '[wizard]{"gate":"schedule","value":"once","mode":"once"}\nGửi 1 lần' },
];

async function runTurn({ typedRequest, locale = 'vi' }) {
  axiosPost.mockResolvedValue({
    data: { candidates: [{ content: { parts: [{ text: JSON.stringify(MODEL_CREATE_AND_RUN) }] } }] },
  });
  return aiCampaignService.processSmartChat({
    userId: 7,
    history: [{ role: 'user', content: typedRequest }, ...WIZARD_MARKERS],
    locale,
  });
}

describe('F2.3 — cổng tất định cho create_and_run (processSmartChat)', () => {
  const prevFlows = process.env.COMPILER_ENABLED_FLOWS;

  beforeEach(() => {
    process.env.COMPILER_ENABLED_FLOWS = '';
    [axiosPost, extractGeminiUsage, reserve, record, getActiveEmailSenders].forEach((fn) => fn.mockReset());
    reserve.mockResolvedValue({ maxOutputTokens: 1024 });
    extractGeminiUsage.mockReturnValue({ promptTokens: 1, outputTokens: 1, totalTokens: 2 });
    getActiveEmailSenders.mockResolvedValue([{ id: 1, name: 'Email 1', email: 'shop@example.vn', status: 'active', isActive: true }]);
    if (prevFlows === undefined) delete process.env.COMPILER_ENABLED_FLOWS;
  });

  it('model trả create_and_run nhưng tin gõ tay chỉ là "tạo chiến dịch email…" (không có câu chạy ngay) → hạ về confirm_create, autoRun=false, không còn câu "đang chạy"', async () => {
    const result = await runTurn({ typedRequest: 'Tạo chiến dịch email gửi cho khách quen mời học khoá mới' });

    expect(result.type).toBe('confirm_create');
    expect(result.data.autoRun).toBe(false);
    expect(result.content).not.toMatch(/đang tạo và chạy/i);
    expect(result.content).toMatch(/xác nhận/);
    // Kịch bản vẫn nguyên để thẻ xác nhận dựng bản xem trước.
    expect(result.data.nodes.map((n) => n.nodeSubtype)).toEqual(expect.arrayContaining(['send_email']));
  });

  it('cùng ca, giao diện tiếng Anh → câu thay thế bằng tiếng Anh', async () => {
    const result = await runTurn({ typedRequest: 'Create an email campaign for loyal customers', locale: 'en' });

    expect(result.type).toBe('confirm_create');
    expect(result.content).toBe('The campaign draft is ready. Review the preview below, then confirm to create it.');
  });

  it('người dùng GÕ rõ "tạo và chạy ngay" → giữ create_and_run (FE vẫn hiện thẻ xác nhận với nút "Tạo và chạy")', async () => {
    const result = await runTurn({ typedRequest: 'Tạo và chạy ngay chiến dịch email gửi cho khách quen' });

    expect(result.type).toBe('create_and_run');
  });

  it('"chạy ngay chiến dịch" cũng là câu rõ ràng; "gửi ngay"/"gửi nhanh" thì KHÔNG đủ', async () => {
    expect((await runTurn({ typedRequest: 'Chạy ngay chiến dịch email cho khách quen' })).type).toBe('create_and_run');
    expect((await runTurn({ typedRequest: 'Gửi ngay email cho khách quen' })).type).toBe('confirm_create');
    expect((await runTurn({ typedRequest: 'Gửi nhanh email cho khách quen' })).type).toBe('confirm_create');
  });
});

describe('F2.3 — luồng nhiều ngày (KHÔNG phải gửi nhanh): chỉ cổng tổng quát chặn create_and_run', () => {
  const prevFlows = process.env.COMPILER_ENABLED_FLOWS;

  beforeEach(() => {
    process.env.COMPILER_ENABLED_FLOWS = '';
    [axiosPost, extractGeminiUsage, reserve, record, getActiveEmailSenders].forEach((fn) => fn.mockReset());
    reserve.mockResolvedValue({ maxOutputTokens: 1024 });
    extractGeminiUsage.mockReturnValue({ promptTokens: 1, outputTokens: 1, totalTokens: 2 });
    getActiveEmailSenders.mockResolvedValue([{ id: 1, name: 'Email 1', email: 'shop@example.vn', status: 'active', isActive: true }]);
    if (prevFlows === undefined) delete process.env.COMPILER_ENABLED_FLOWS;
  });

  const dripHistory = (finalTypedText) => [
    { role: 'user', content: 'Tạo chuỗi email 3 ngày cho khách quen' },
    { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' },
    { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":1}\nEmail 1' },
    { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nKhách trong DB' },
    { role: 'user', content: '[wizard]{"gate":"campaignBrief","contentMode":"custom_topic","topicText":"Mời khách quen"}\nChủ đề' },
    { role: 'user', content: '[wizard]{"gate":"schedule","value":"drip","mode":"drip","days":3,"slotsPerDay":1}\n3 ngày' },
    { role: 'assistant', type: 'content_plan', data: { totalDays: 3, days: [{ day: 1 }, { day: 2 }, { day: 3 }] } },
    { role: 'user', content: '[wizard]{"gate":"planApproved","value":"approve"}\nĐồng ý' },
    { role: 'user', content: finalTypedText },
  ];

  const run = async (finalTypedText) => {
    axiosPost.mockResolvedValue({
      data: { candidates: [{ content: { parts: [{ text: JSON.stringify(MODEL_CREATE_AND_RUN) }] } }] },
    });
    return aiCampaignService.processSmartChat({ userId: 7, history: dripHistory(finalTypedText), locale: 'vi' });
  };

  it('tin gõ tay mới nhất "Tạo chiến dịch" → hạ về confirm_create và thay câu "đang chạy" của model', async () => {
    const result = await run('Tạo chiến dịch');

    expect(result.type).toBe('confirm_create');
    expect(result.data.autoRun).toBe(false);
    expect(result.content).not.toMatch(/đang tạo và chạy/i);
  });

  it('tin gõ tay mới nhất "Tạo và chạy chiến dịch này" → giữ create_and_run', async () => {
    const result = await run('Tạo và chạy chiến dịch này');

    expect(result.type).toBe('create_and_run');
  });
});

describe('F2.3 — lastHandTypedUserText: chỉ tin GÕ TAY, không phải marker/prompt máy/tệp', () => {
  it('bỏ marker [wizard] — một marker mang chữ "tạo và chạy" ở nhãn không tính là người dùng muốn chạy ngay', () => {
    const text = lastHandTypedUserText([
      { role: 'user', content: 'Tạo chiến dịch email cho khách quen' },
      { role: 'user', content: '[wizard]{"gate":"schedule","mode":"once"}\nTạo và chạy ngay' },
    ]);
    expect(text).toBe('Tạo chiến dịch email cho khách quen');
    expect(EXPLICIT_CREATE_AND_RUN_RE.test(text)).toBe(false);
  });

  it('bỏ prompt máy "Tạo chi tiết template cho ngày…" và tin assistant', () => {
    const text = lastHandTypedUserText([
      { role: 'user', content: 'Tạo và chạy ngay chiến dịch email' },
      { role: 'assistant', content: 'Đây là kế hoạch' },
      { role: 'user', content: 'Tạo chi tiết template cho ngày 1 (slot 1)' },
    ]);
    expect(text).toBe('Tạo và chạy ngay chiến dịch email');
  });

  it('lịch sử tin máy CŨ (không cờ, chỉ có chữ) vẫn bị lọc khỏi tin gõ tay', () => {
    const text = lastHandTypedUserText([
      { role: 'user', content: 'Tạo và chạy ngay chiến dịch email' },
      { role: 'user', content: 'tao chi tiet template cho ngay 2, slot 1 (Email)' },
    ]);
    expect(text).toBe('Tạo và chạy ngay chiến dịch email');
  });

  it('tin máy MỚI mang cờ data.internalPrompt bị lọc dù chữ bất kỳ', () => {
    const text = lastHandTypedUserText([
      { role: 'user', content: 'Tạo và chạy ngay chiến dịch email' },
      { role: 'user', content: 'Soạn mẫu cho slot hai', data: { internalPrompt: 'plan_template', planSlotKey: 'd1-s2' } },
    ]);
    expect(text).toBe('Tạo và chạy ngay chiến dịch email');
  });

  it('người dùng gõ thêm một tin khác SAU câu "tạo và chạy" → tin mới nhất không khớp → cổng hạ về confirm_create', () => {
    const response = aiCampaignService._guardCreateAndRunExplicit(
      { type: 'create_and_run', content: 'Đang chạy', data: { nodes: [], connections: [], autoRun: true } },
      [
        { role: 'user', content: 'Tạo và chạy ngay chiến dịch email' },
        { role: 'user', content: 'đổi giờ gửi sang 9h sáng giúp tôi' },
      ]
    );
    expect(response.type).toBe('confirm_create');
    expect(response.data.autoRun).toBe(false);
  });

  it('loại phản hồi khác (confirm_create, text) đi qua nguyên vẹn', () => {
    const confirm = { type: 'confirm_create', content: 'x', data: { nodes: [] } };
    expect(aiCampaignService._guardCreateAndRunExplicit(confirm, [{ role: 'user', content: 'a' }])).toBe(confirm);
    expect(aiCampaignService._guardCreateAndRunExplicit(null, [])).toBeNull();
  });

  it('lịch sử rỗng / không có tin user → chuỗi rỗng, create_and_run bị hạ', () => {
    expect(lastHandTypedUserText([])).toBe('');
    expect(lastHandTypedUserText([{ role: 'assistant', content: 'x' }])).toBe('');
    expect(
      aiCampaignService._guardCreateAndRunExplicit({ type: 'create_and_run', content: 'x', data: { autoRun: true } }, []).type
    ).toBe('confirm_create');
  });
});
