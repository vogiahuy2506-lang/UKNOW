/**
 * Rà soát C P2-7 (04/10/2026) — cổng `landingLeads`: nguồn "Đăng ký từ Landing Page" không bao giờ ngầm thành "mọi lead của mọi landing".
 *
 * Trước đây wizard không có cổng chọn landing: model tự chọn (hoặc quên) slug, FE vá node khách DB thành `read_landing_leads` với
 * `landingLeadsSlugs: []` = MỌI lead của MỌI landing → tin gửi nhầm người, không thu hồi được.
 */
import { describe, expect, it } from '@jest/globals';
import {
  GATE_PROMPT_TYPES,
  MAX_LANDING_SLUGS_PER_CAMPAIGN,
  buildCampaignPromptWithWizardState,
  buildLandingLeadsGate,
  createEmptyWizardState,
  evaluateNextGate,
  extractWizardState,
  hasLandingLeadsSelection,
  isWizardAnswerTurn,
  mergeWizardState,
  normalizeLandingSlugs,
} from '../aiCampaignWizard.service.js';

const user = (content) => ({ role: 'user', content });
const marker = (payload, text = 'x') => user(`[wizard]${JSON.stringify(payload)}\n${text}`);

const EMAIL_SENDER = { id: 7, name: 'Shop', email: 'shop@example.vn', status: 'active' };
const PICKER = {
  totalLeads: 205,
  landings: [
    { slug: 'khoa-ielts', title: 'Khoá IELTS', isPublished: true, formId: null, leadCount: 120, formConsentedCount: 0 },
    { slug: 'khoa-toeic', title: 'Khoá TOEIC', isPublished: true, formId: null, leadCount: 80, formConsentedCount: 0 },
    { slug: 'dat-lich', title: 'Đặt lịch tư vấn', isPublished: true, formId: 3, leadCount: 0, formConsentedCount: 15 },
  ],
};

/** Lịch sử: người dùng yêu cầu chiến dịch email, chọn email 7, chọn nguồn landing. */
const historyToLandingSource = () => [
  user('Tạo chiến dịch email gửi cho người đăng ký landing'),
  marker({ gate: 'channel', channel: 'email' }, 'Email'),
  marker({ gate: 'senderAccount', channel: 'email', accountId: 7, accountName: 'Shop' }, 'Shop'),
  marker({ gate: 'dataSource', value: 'landing' }, 'Landing'),
];

const gateOf = (history, resources = { emailSenders: [EMAIL_SENDER], landingPicker: PICKER }) => (
  evaluateNextGate(extractWizardState(history), resources, 'vi')
);

describe('cổng landingLeads — chọn nguồn landing rồi PHẢI chọn trang', () => {
  it('đã chọn nguồn landing nhưng chưa chọn trang → thẻ landing_picker (KHÔNG đi tiếp sang brief/lịch)', () => {
    const gate = gateOf(historyToLandingSource());

    expect(gate.gate).toBe('landingLeads');
    expect(gate.response.type).toBe('landing_picker');
    expect(gate.response.data.landings.map((l) => l.slug)).toEqual(['khoa-ielts', 'khoa-toeic', 'dat-lich']);
    expect(gate.response.data.totalLeads).toBe(205);
    expect(gate.response.data.maxSelect).toBe(MAX_LANDING_SLUGS_PER_CAMPAIGN);
  });

  it('thẻ liệt kê tên + slug + số lead; landing dùng Biểu mẫu mang formId và số người đã đồng ý', () => {
    const { landings } = gateOf(historyToLandingSource()).response.data;

    expect(landings[0]).toEqual({
      slug: 'khoa-ielts', title: 'Khoá IELTS', isPublished: true, formId: null, leadCount: 120, formConsentedCount: 0,
    });
    expect(landings[2]).toMatchObject({ slug: 'dat-lich', formId: 3, formConsentedCount: 15 });
  });

  it('chọn ≥ 1 trang → cổng thông qua, wizard đi tiếp (campaignBrief)', () => {
    const history = [...historyToLandingSource(), marker({ gate: 'landingLeads', slugs: ['khoa-ielts'] })];
    const state = extractWizardState(history);

    expect(state.landingLeadsSlugs).toEqual(['khoa-ielts']);
    expect(state.landingLeadsAll).toBe(false);
    expect(hasLandingLeadsSelection(state)).toBe(true);
    expect(evaluateNextGate(state, { emailSenders: [EMAIL_SENDER], landingPicker: PICKER, courses: [] }, 'vi').gate).toBe('campaignBrief');
  });

  it('"Tất cả landing" TƯỜNG MINH (all:true) → cổng thông qua với slug rỗng có chủ ý', () => {
    const state = extractWizardState([...historyToLandingSource(), marker({ gate: 'landingLeads', all: true })]);

    expect(state.landingLeadsAll).toBe(true);
    expect(state.landingLeadsSlugs).toEqual([]);
    expect(evaluateNextGate(state, { emailSenders: [EMAIL_SENDER], landingPicker: PICKER, courses: [] }, 'vi').gate).toBe('campaignBrief');
  });

  it('marker landingLeads RỖNG (không slug, không all) KHÔNG được coi là "tất cả" → vẫn hỏi lại', () => {
    const state = extractWizardState([...historyToLandingSource(), marker({ gate: 'landingLeads', slugs: [] })]);

    expect(state.landingLeadsAll).toBe(false);
    expect(hasLandingLeadsSelection(state)).toBe(false);
    expect(evaluateNextGate(state, { emailSenders: [EMAIL_SENDER], landingPicker: PICKER }, 'vi').gate).toBe('landingLeads');
  });

  it('all chỉ nhận đúng boolean true ("true"/1 từ marker giả không qua)', () => {
    const state = extractWizardState([...historyToLandingSource(), marker({ gate: 'landingLeads', all: 'true' })]);
    expect(state.landingLeadsAll).toBe(false);
  });

  it('danh sách landing CHƯA BIẾT (tra DB lỗi → null, hoặc nơi gọi không tải) → chặn bằng câu thử lại, KHÔNG đi tiếp với danh sách rỗng', () => {
    for (const resources of [{ emailSenders: [EMAIL_SENDER], landingPicker: null }, { emailSenders: [EMAIL_SENDER] }]) {
      const gate = gateOf(historyToLandingSource(), resources);
      expect(gate.gate).toBe('landingLeads');
      expect(gate.response.type).toBe('text');
      expect(gate.response.content).toMatch(/chưa tải được/);
    }
  });

  it('workspace chưa có landing nào → quay về thẻ chọn nguồn người nhận kèm lời giải thích (không có thẻ chọn rỗng)', () => {
    const gate = gateOf(historyToLandingSource(), { emailSenders: [EMAIL_SENDER], landingPicker: { landings: [], totalLeads: 0 } });

    expect(gate.gate).toBe('dataSource');
    expect(gate.response.type).toBe('ask_campaign_details');
    expect(gate.response.content).toMatch(/chưa có landing page nào/);
    expect(gate.response.data.questions[0].wizardGate).toBe('dataSource');
  });

  it('tiếng Anh: thẻ và câu chặn có bản tiếng Anh', () => {
    expect(buildLandingLeadsGate(PICKER, {}, 'en').response.content).toMatch(/Which landing page/);
    expect(buildLandingLeadsGate(null, {}, 'en').response.content).toMatch(/could not load/);
    expect(buildLandingLeadsGate({ landings: [], totalLeads: 0 }, { channel: 'email' }, 'en').response.content).toMatch(/no landing page yet/);
  });

  it('cổng chỉ áp cho Email / Zalo cá nhân: Zalo nhóm không có nguồn người nhận, kênh adapter dùng hội thoại', () => {
    const base = { isCampaignFlow: true, senderAccountId: 7, dataSource: 'landing', landingLeadsSlugs: [], landingLeadsAll: false };
    const resources = {
      emailSenders: [EMAIL_SENDER],
      zaloAccounts: [{ id: 7, status: 'connected', isActive: true }],
      landingPicker: PICKER,
      courses: [],
    };
    expect(evaluateNextGate({ ...base, channel: 'email' }, resources, 'vi').gate).toBe('landingLeads');
    expect(evaluateNextGate({ ...base, channel: 'zalo' }, resources, 'vi').gate).toBe('landingLeads');
    expect(evaluateNextGate({ ...base, channel: 'zalo_group', zaloGroupIds: ['g1'] }, resources, 'vi')?.gate).not.toBe('landingLeads');
  });

  it('nguồn khác landing (db/sheet/manual) KHÔNG bị hỏi chọn landing', () => {
    const state = extractWizardState([
      user('Tạo chiến dịch email gửi cho khách'),
      marker({ gate: 'channel', channel: 'email' }),
      marker({ gate: 'senderAccount', channel: 'email', accountId: 7 }),
      marker({ gate: 'dataSource', value: 'db' }),
    ]);
    expect(evaluateNextGate(state, { emailSenders: [EMAIL_SENDER], landingPicker: PICKER, courses: [] }, 'vi').gate).not.toBe('landingLeads');
  });
});

describe('lựa chọn landing — vòng đời trong state', () => {
  it('chọn lại nguồn người nhận (marker dataSource mới) → lựa chọn landing cũ bị xoá, phải chọn lại', () => {
    const state = extractWizardState([
      ...historyToLandingSource(),
      marker({ gate: 'landingLeads', slugs: ['khoa-ielts'] }),
      marker({ gate: 'dataSource', value: 'landing' }),
    ]);
    expect(state.landingLeadsSlugs).toEqual([]);
    expect(hasLandingLeadsSelection(state)).toBe(false);
  });

  it('đổi kênh (marker channel) → xoá lựa chọn landing; ranh giới chiến dịch đã tạo xong cũng vậy', () => {
    const afterChannel = extractWizardState([
      ...historyToLandingSource(),
      marker({ gate: 'landingLeads', slugs: ['khoa-ielts'] }),
      marker({ gate: 'channel', channel: 'zalo' }),
    ]);
    expect(afterChannel.landingLeadsSlugs).toEqual([]);

    const afterCreated = extractWizardState([
      ...historyToLandingSource(),
      marker({ gate: 'landingLeads', slugs: ['khoa-ielts'] }),
      { role: 'assistant', type: 'campaign_created', content: 'xong', data: { campaignId: 1 } },
    ]);
    expect(afterCreated.landingLeadsSlugs).toEqual([]);
    expect(afterCreated.landingLeadsAll).toBe(false);
  });

  it('slug từ marker được chuẩn hoá: thường hoá, bỏ "/" đầu cuối, bỏ trùng/rỗng, cắt ở MAX', () => {
    expect(normalizeLandingSlugs([' /Khoa-IELTS/ ', 'khoa-ielts', '', null, '/'])).toEqual(['khoa-ielts']);
    expect(normalizeLandingSlugs('khong-phai-mang')).toEqual([]);
    const many = Array.from({ length: MAX_LANDING_SLUGS_PER_CAMPAIGN + 20 }, (_, i) => `lp-${i}`);
    expect(normalizeLandingSlugs(many)).toHaveLength(MAX_LANDING_SLUGS_PER_CAMPAIGN);
  });

  it('mergeWizardState: lựa chọn đã lưu sống sót khi marker mất khỏi history (F5), derived thắng khi có marker mới', () => {
    const persisted = { ...createEmptyWizardState().gates, channel: 'email', dataSource: 'landing', landingLeadsSlugs: ['khoa-ielts'] };

    // Không còn marker nào trong history (đã tải lại trang) → giữ bản đã lưu.
    const reloaded = mergeWizardState(persisted, extractWizardState([user('tiếp tục')]), {});
    expect(reloaded.landingLeadsSlugs).toEqual(['khoa-ielts']);

    // Marker landingLeads mới → derived thắng.
    const picked = mergeWizardState(
      persisted,
      extractWizardState([...historyToLandingSource(), marker({ gate: 'landingLeads', slugs: ['khoa-toeic'] })]),
      {},
    );
    expect(picked.landingLeadsSlugs).toEqual(['khoa-toeic']);

    // Marker dataSource mới (chọn lại nguồn) → lựa chọn cũ bị xoá chứ không hồi sinh từ bản đã lưu.
    const reselected = mergeWizardState(persisted, extractWizardState(historyToLandingSource()), {});
    expect(reselected.landingLeadsSlugs).toEqual([]);
    expect(reselected.landingLeadsAll).toBe(false);
  });

  it('mergeWizardState: "Tất cả" đã lưu cũng sống sót qua F5', () => {
    const persisted = { ...createEmptyWizardState().gates, channel: 'email', dataSource: 'landing', landingLeadsAll: true };
    expect(mergeWizardState(persisted, extractWizardState([user('tiếp tục')]), {}).landingLeadsAll).toBe(true);
  });

  it('wizard mới tinh: không có lựa chọn landing', () => {
    const gates = createEmptyWizardState().gates;
    expect(gates.landingLeadsSlugs).toEqual([]);
    expect(gates.landingLeadsAll).toBe(false);
  });
});

describe('lựa chọn landing đi vào prompt và lượt trả lời gõ tay', () => {
  it('buildCampaignPromptWithWizardState ghi slug đã chọn / "Tất cả"; không ghi gì khi chưa chọn', () => {
    const picked = buildCampaignPromptWithWizardState({ channel: 'email', dataSource: 'landing', landingLeadsSlugs: ['khoa-ielts', 'khoa-toeic'] }, 'gửi', 'vi');
    expect(picked).toContain('- landingLeadsSlugs: ["khoa-ielts", "khoa-toeic"]');

    const all = buildCampaignPromptWithWizardState({ channel: 'email', dataSource: 'landing', landingLeadsAll: true }, 'gửi', 'vi');
    expect(all).toContain('- landingLeadsAll: true');
    expect(all).not.toContain('- landingLeadsSlugs:');

    const none = buildCampaignPromptWithWizardState({ channel: 'email', dataSource: 'landing' }, 'gửi', 'vi');
    expect(none).not.toContain('landingLeads');
  });

  it('landing_picker là thẻ cổng: gõ chữ sau thẻ vẫn tính là đang trả lời cổng', () => {
    expect(GATE_PROMPT_TYPES.has('landing_picker')).toBe(true);
    expect(isWizardAnswerTurn([
      { role: 'assistant', type: 'landing_picker', content: 'Chọn landing', data: PICKER },
      { role: 'user', content: 'trang ielts' },
    ])).toBe(true);
  });
});
