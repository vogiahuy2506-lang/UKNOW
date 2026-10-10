/**
 * Cổng `formId` (10/10/2026) — nguồn "Người điền Biểu mẫu" phải lưu biểu mẫu đã chọn.
 *
 * Trước đây wizard cho chọn nguồn `form` nhưng không gate nào lưu biểu mẫu: intent thiếu audience.formId, compiler từ chối,
 * kịch bản rơi về model thuần và node read_form_submissions mang `formId: ''`. Khuôn: cổng `landingLeads`.
 */
import { describe, expect, it } from '@jest/globals';
import {
  GATE_MERGE_POLICIES,
  buildCampaignPromptWithWizardState,
  buildFormGate,
  createEmptyWizardState,
  evaluateNextGate,
  extractWizardState,
  hasFormSelection,
  mergeWizardState,
  normalizeFormId,
  pickSoleFormId,
} from '../aiCampaignWizard.service.js';
import { deriveIntent, isCompilableIntent } from '../campaignIntent.schema.js';

const user = (content) => ({ role: 'user', content });
const marker = (payload, text = 'x') => user(`[wizard]${JSON.stringify(payload)}\n${text}`);

const EMAIL_SENDER = { id: 7, name: 'Shop', email: 'shop@example.vn', status: 'active' };
const PICKER = {
  forms: [
    { id: 7, title: 'Đăng ký tư vấn', consentEnabled: true, consentedCount: 12 },
    { id: 9, title: 'Khảo sát', consentEnabled: false, consentedCount: 0 },
  ],
};
const resources = (formPicker = PICKER) => ({ emailSenders: [EMAIL_SENDER], formPicker, courses: [] });

const historyToFormSource = () => [
  user('Tạo chiến dịch email cho người đã nộp biểu mẫu'),
  marker({ gate: 'channel', channel: 'email' }, 'Email'),
  marker({ gate: 'senderAccount', channel: 'email', accountId: 7, accountName: 'Shop' }, 'Shop'),
  marker({ gate: 'dataSource', value: 'form' }, 'Biểu mẫu'),
];

describe('cổng formId — chọn nguồn form rồi PHẢI chọn biểu mẫu', () => {
  it('nguồn form chưa chọn biểu mẫu → thẻ chọn (gate formId), mỗi biểu mẫu một lựa chọn', () => {
    const gate = evaluateNextGate(extractWizardState(historyToFormSource()), resources(), 'vi');
    expect(gate.gate).toBe('formId');
    expect(gate.response.type).toBe('ask_campaign_details');
    const question = gate.response.data.questions[0];
    expect(question.wizardGate).toBe('formId');
    expect(question.options.map((o) => o.value)).toEqual(['7', '9']);
    expect(question.options[1].description).toMatch(/chưa bật hỏi đồng ý/);
  });

  it('marker formId → lưu id (số), cổng đi tiếp sang brief', () => {
    const state = extractWizardState([...historyToFormSource(), marker({ gate: 'formId', formId: 7 })]);
    expect(state.formId).toBe(7);
    expect(hasFormSelection(state)).toBe(true);
    expect(evaluateNextGate(state, resources(), 'vi').gate).toBe('campaignBrief');
  });

  it('marker mang id dạng chuỗi số ("7") vẫn nhận; id rác (0, -1, 1.5, "abc", rỗng) là CHƯA chọn', () => {
    expect(extractWizardState([...historyToFormSource(), marker({ gate: 'formId', formId: '7' })]).formId).toBe(7);
    for (const bad of [0, -1, 1.5, 'abc', '', null, true]) {
      const state = extractWizardState([...historyToFormSource(), marker({ gate: 'formId', formId: bad })]);
      expect(state.formId).toBeNull();
      expect(evaluateNextGate(state, resources(), 'vi').gate).toBe('formId');
    }
    expect(normalizeFormId(undefined)).toBeNull();
  });

  it('không tải được danh sách (picker null) → chặn bằng câu thử lại, KHÔNG đi tiếp', () => {
    for (const picker of [null, undefined]) {
      const gate = evaluateNextGate(extractWizardState(historyToFormSource()), { ...resources(), formPicker: picker }, 'vi');
      expect(gate.gate).toBe('formId');
      expect(gate.response.type).toBe('text');
    }
  });

  it('workspace chưa có biểu mẫu xuất bản → quay về thẻ chọn nguồn kèm lời giải thích', () => {
    const gate = evaluateNextGate(extractWizardState(historyToFormSource()), resources({ forms: [] }), 'vi');
    expect(gate.gate).toBe('dataSource');
    expect(gate.response.content).toMatch(/chưa có biểu mẫu/);
    expect(buildFormGate({ forms: [] }, {}, 'en').response.content).toMatch(/no published form/);
  });

  it('chỉ áp cho Email / Zalo cá nhân và nguồn form; nguồn khác không bị hỏi biểu mẫu', () => {
    const base = { isCampaignFlow: true, senderAccountId: 7, dataSource: 'form', formId: null };
    const res = { ...resources(), zaloAccounts: [{ id: 7, displayName: 'Z', status: 'connected', isActive: true }] };
    expect(evaluateNextGate({ ...base, channel: 'email', zaloGroupIds: [] }, res, 'vi').gate).toBe('formId');
    expect(evaluateNextGate({ ...base, channel: 'zalo', zaloGroupIds: [] }, res, 'vi').gate).toBe('formId');
    expect(evaluateNextGate({ ...base, channel: 'email', dataSource: 'db', zaloGroupIds: [] }, res, 'vi')?.gate).not.toBe('formId');
  });

  it('tự chọn khi workspace chỉ có ĐÚNG MỘT biểu mẫu (nơi gọi ghi vào gate)', () => {
    expect(pickSoleFormId({ forms: [{ id: 9 }] })).toBe(9);
    expect(pickSoleFormId(PICKER)).toBeNull();
    expect(pickSoleFormId({ forms: [] })).toBeNull();
    expect(pickSoleFormId(null)).toBeNull();
  });
});

describe('formId — merge, reset và lưu bền', () => {
  it('mọi field của gates phải có chính sách merge (formId là custom)', () => {
    expect(GATE_MERGE_POLICIES.formId).toEqual({ policy: 'custom' });
    expect(createEmptyWizardState().gates.formId).toBeNull();
    expect(mergeWizardState({}, {}, {}).formId).toBeNull();
  });

  it('tải lại trang (marker mất khỏi history) → formId đã lưu sống sót', () => {
    const persisted = { ...createEmptyWizardState().gates, channel: 'email', dataSource: 'form', formId: 7 };
    const merged = mergeWizardState(persisted, extractWizardState([user('tiếp tục')]), {});
    expect(merged.formId).toBe(7);
  });

  it('chọn lại NGUỒN người nhận → biểu mẫu cũ không sống sót', () => {
    const persisted = { ...createEmptyWizardState().gates, channel: 'email', dataSource: 'form', formId: 7 };
    const derived = extractWizardState([...historyToFormSource().slice(0, 3), marker({ gate: 'dataSource', value: 'form' })]);
    expect(mergeWizardState(persisted, derived, {}).formId).toBeNull();
  });

  it('chọn lại biểu mẫu (marker mới) thắng bản đã lưu', () => {
    const persisted = { ...createEmptyWizardState().gates, channel: 'email', dataSource: 'form', formId: 7 };
    const derived = extractWizardState([...historyToFormSource(), marker({ gate: 'formId', formId: 9 })]);
    expect(mergeWizardState(persisted, derived, {}).formId).toBe(9);
  });

  it('đổi kênh → formId bị xoá; chiến dịch đã tạo xong → chiến dịch sau không kế thừa', () => {
    const switched = extractWizardState([
      ...historyToFormSource(), marker({ gate: 'formId', formId: 7 }), marker({ gate: 'channel', channel: 'zalo' }, 'Zalo'),
    ]);
    expect(switched.formId).toBeNull();
    const afterCreated = extractWizardState([
      ...historyToFormSource(), marker({ gate: 'formId', formId: 7 }),
      { role: 'assistant', type: 'campaign_created', content: 'xong' },
    ]);
    expect(afterCreated.formId).toBeNull();
  });
});

describe('formId — prompt và intent', () => {
  it('prompt WIZARD ĐÃ CHỐT mang formId để model không tự chọn', () => {
    const prompt = buildCampaignPromptWithWizardState({ channel: 'email', dataSource: 'form', formId: 7 }, 'gửi', 'vi');
    expect(prompt).toContain('- formId: 7');
    expect(buildCampaignPromptWithWizardState({ channel: 'email', dataSource: 'form' }, 'gửi', 'vi')).not.toContain('formId');
  });

  const gates = (extra) => ({
    isCampaignFlow: true, channel: 'email', senderAccountId: 7, dataSource: 'form', schedule: { mode: 'once' }, ...extra,
  });
  const brief = { contentMode: 'custom_topic', topicText: 'Nhắc lịch', contentLocale: 'vi' };

  it('deriveIntent: audience.formId từ gate, compile được', () => {
    const { intent } = deriveIntent(gates({ formId: 7 }), brief);
    expect(intent.audience).toMatchObject({ type: 'form', formId: 7 });
    expect(isCompilableIntent(intent).ok).toBe(true);
  });

  it('deriveIntent: chưa chọn biểu mẫu → thiếu audience.formId (không bịa id)', () => {
    for (const formId of [null, undefined, 0, 'abc']) {
      const { intent } = deriveIntent(gates({ formId }), brief);
      expect(intent.audience.formId).toBeUndefined();
      expect(isCompilableIntent(intent).missing).toContain('audience.formId');
    }
  });

  it('deriveIntent: formId chỉ gắn khi nguồn là form (gate cũ sót lại không rò sang nguồn khác)', () => {
    const { intent } = deriveIntent(gates({ dataSource: 'db', formId: 7 }), brief);
    expect(intent.audience.formId).toBeUndefined();
  });
});
