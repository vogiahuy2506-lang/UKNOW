import { describe, expect, it } from '@jest/globals';
import {
  buildFileUsageQuestion,
  createEmptyWizardState,
  evaluateNextGate,
  extractWizardState,
  isWizardAnswerTurn,
  mergeWizardState,
} from '../aiCampaignWizard.service.js';

describe('Việc 1: Wizard hỏi cách dùng tệp (gate: fileUsage)', () => {
  const baseState = {
    ...createEmptyWizardState().gates,
    isCampaignFlow: true,
    channel: 'zalo_group',
    senderAccountId: 5,
    zaloGroupIds: ['g1'],
  };

  it('khi có file đính kèm (không phải spreadsheet) và chưa chọn fileUsage, wizard hỏi fileUsage', () => {
    const state = {
      ...baseState,
      hasAttachedFile: true,
      hasAttachedSpreadsheet: false,
      fileUsage: null,
    };

    const next = evaluateNextGate(state, {}, 'vi');
    expect(next).not.toBeNull();
    expect(next.gate).toBe('fileUsage');
    expect(next.response.content).toContain('Bạn muốn tôi lấy nội dung trong tệp');
    expect(next.response.data.questions[0].options.map((o) => o.value)).toEqual([
      'as_content',
      'as_attachment',
      'both',
    ]);
  });

  it('khi tệp đính kèm là bảng tính spreadsheet, wizard KHÔNG hỏi fileUsage', () => {
    const state = {
      ...baseState,
      hasAttachedFile: true,
      hasAttachedSpreadsheet: true, // File danh sách người nhận
      fileUsage: null,
    };

    const next = evaluateNextGate(state, {}, 'vi');
    // Bỏ qua fileUsage, đi tiếp vào brief hoặc schedule
    expect(next?.gate).not.toBe('fileUsage');
  });

  it('khi không có file đính kèm nào, wizard KHÔNG hỏi fileUsage', () => {
    const state = {
      ...baseState,
      hasAttachedFile: false,
      fileUsage: null,
    };

    const next = evaluateNextGate(state, {}, 'vi');
    expect(next?.gate).not.toBe('fileUsage');
  });

  it('khi đã có fileUsage, wizard đi tiếp tới brief/schedule mà không hỏi lại', () => {
    const state = {
      ...baseState,
      hasAttachedFile: true,
      hasAttachedSpreadsheet: false,
      fileUsage: 'as_attachment',
      schedule: { mode: 'once' },
      brief: { topic: 'Thông báo', contentMode: 'custom_topic' },
    };

    const next = evaluateNextGate(state, {}, 'vi');
    expect(next?.gate).not.toBe('fileUsage');
  });

  it('mergeWizardState bảo lưu fileUsage theo chính sách marker-pick', () => {
    const persisted = { fileUsage: 'both' };
    const derived = { fileUsage: null, markerGates: [] };

    const merged = mergeWizardState(persisted, derived);
    expect(merged.fileUsage).toBe('both');

    const derivedWithMarker = { fileUsage: 'as_content', markerGates: ['fileUsage'] };
    const mergedWithMarker = mergeWizardState(persisted, derivedWithMarker);
    expect(mergedWithMarker.fileUsage).toBe('as_content');
  });

  it('Finding 2: khi chọn fileUsage là as_content hoặc both, brief tự động sẵn sàng và KHÔNG hỏi lại cổng campaignBrief', () => {
    // Trường hợp as_content
    const stateContent = {
      ...baseState,
      hasAttachedFile: true,
      hasAttachedSpreadsheet: false,
      fileUsage: 'as_content',
      brief: null, // Chưa có brief
      schedule: null,
    };

    const nextContent = evaluateNextGate(stateContent, {}, 'vi');
    // Phải bỏ qua campaignBrief và hỏi thẳng schedule!
    expect(nextContent?.gate).toBe('schedule');

    // Trường hợp both
    const stateBoth = {
      ...baseState,
      hasAttachedFile: true,
      hasAttachedSpreadsheet: false,
      fileUsage: 'both',
      brief: null,
      schedule: null,
    };

    const nextBoth = evaluateNextGate(stateBoth, {}, 'vi');
    expect(nextBoth?.gate).toBe('schedule');
  });

  it('Finding 2: khi chọn fileUsage là as_attachment và chưa có brief, wizard VẪN HỎI cổng campaignBrief', () => {
    const stateAttachment = {
      ...baseState,
      hasAttachedFile: true,
      hasAttachedSpreadsheet: false,
      fileUsage: 'as_attachment',
      brief: null, // Chưa có brief
      schedule: null,
    };

    const nextAttachment = evaluateNextGate(stateAttachment, {}, 'vi');
    // Khi chỉ gửi kèm, phải hỏi brief để biết nội dung tin lấy từ đâu
    expect(nextAttachment?.gate).toBe('campaignBrief');
  });
});

// PLAN_VA_TRO_LY_AI_2026-09-28 PR-2 mục 7 — vòng lặp "Cách sử dụng tệp đính kèm? Cả hai" ×5 trên
// production. Gốc ở FE: gate fileUsage không có nhánh marker nên câu trả lời đi đường chữ thường,
// history kết thúc bằng câu đệm KHÔNG có `type` → backend không thấy wizard → não trợ giúp trả lời.
// Hai ca dưới ghim hợp đồng backend mà bản sửa FE (AiChatbot.jsx, emitWizardAnswer gate fileUsage)
// dựa vào: (1) đường chữ thường cũ thật sự KHÔNG được coi là lượt wizard; (2) marker thì được, và
// extractWizardState đọc đúng lựa chọn.
describe('PR-2 mục 7: câu trả lời fileUsage phải đi bằng marker [wizard]', () => {
  const askCard = { role: 'assistant', type: 'ask_campaign_details', content: 'Bạn muốn tôi lấy nội dung trong tệp…' };

  it('(1) đường chữ thường FE cũ (câu đệm không type + "Nhãn? Lựa chọn") KHÔNG phải lượt wizard → rơi vào não trợ giúp', () => {
    const history = [
      askCard,
      { role: 'user', content: 'gửi tài liệu này cho nhóm học viên' },
      { role: 'assistant', content: 'Cho tôi hỏi vài điều để thiết kế chiến dịch phù hợp.' },
      { role: 'user', content: 'Cách sử dụng tệp đính kèm? Cả hai' },
    ];
    expect(isWizardAnswerTurn(history)).toBe(false);
  });

  it.each([
    ['both', 'Cả hai'],
    ['as_content', 'Lấy nội dung'],
    ['as_attachment', 'Gửi kèm tệp'],
  ])('(2) marker {gate:fileUsage, value:%s} → là lượt wizard và extractWizardState ghi đúng lựa chọn', (value, label) => {
    const marker = `[wizard]${JSON.stringify({ gate: 'fileUsage', value })}\nCách sử dụng tệp đính kèm? ${label}`;
    const history = [askCard, { role: 'user', content: marker }];

    expect(isWizardAnswerTurn(history)).toBe(true);
    const state = extractWizardState(history);
    expect(state.fileUsage).toBe(value);
    expect(state.markerGates).toContain('fileUsage');
  });
});

// 29/09 — sếp thử: gửi PDF kèm "tạo chiến dịch…", chọn Email, tài khoản, nhập người nhận → wizard nhảy thẳng sang thẻ
// nội dung, KHÔNG hỏi "Cách sử dụng tệp đính kèm?". Gốc: mốc cắt tệp lấy max với lastChannelMarkerIndex và
// latestCampaignMessageIndex — hai mốc nhích lên mỗi lượt nên tệp ở câu đầu bị quên ngay khi chọn kênh.
describe('tệp đính kèm ở câu mở đầu vẫn được tính suốt luồng (mốc cắt = lần reset gần nhất)', () => {
  const mk = (payload, text) => `[wizard]${JSON.stringify(payload)}\n${text}`;
  const pdf = [{ name: 'bao-cao.pdf', mimetype: 'application/pdf', size: 1000 }];
  const flowUntilRecipients = [
    { role: 'user', content: 'tạo chiến dịch giới thiệu tài liệu này', files: pdf },
    { role: 'assistant', type: 'ask_campaign_details', content: 'kênh?' },
    { role: 'user', content: mk({ gate: 'channel', channel: 'email' }, 'Kênh gửi: Email') },
    { role: 'assistant', type: 'ask_sender_account', content: 'sender?' },
    { role: 'user', content: mk({ gate: 'senderAccount', channel: 'email', accountId: 1, accountName: 'x' }, 'sender') },
    { role: 'assistant', type: 'ask_campaign_details', content: 'nguồn?' },
    { role: 'user', content: mk({ gate: 'dataSource', value: 'manual', recipientCount: 1 }, 'Nhập trực tiếp') },
  ];

  it('chọn kênh + tài khoản + người nhận xong → vẫn còn tệp, cổng kế là fileUsage (không phải campaignBrief)', () => {
    const state = extractWizardState(flowUntilRecipients);
    expect(state.hasAttachedFile).toBe(true);
    expect(evaluateNextGate(state, {}, 'vi')?.gate).toBe('fileUsage');
  });

  it('chọn "Cả hai" → cổng kế là schedule (nội dung lấy từ tệp, không hỏi thẻ nội dung)', () => {
    const history = [
      ...flowUntilRecipients,
      { role: 'assistant', type: 'ask_campaign_details', content: 'Cách sử dụng tệp đính kèm?' },
      { role: 'user', content: mk({ gate: 'fileUsage', value: 'both' }, 'Cách sử dụng tệp đính kèm? Cả hai') },
    ];
    expect(evaluateNextGate(extractWizardState(history), {}, 'vi')?.gate).toBe('schedule');
  });

  it('chiến dịch MỚI sau ranh giới "đã tạo xong" → tệp của chiến dịch trước KHÔNG tính', () => {
    const history = [
      ...flowUntilRecipients,
      { role: 'assistant', type: 'campaign_created', content: 'Đã tạo chiến dịch' },
      { role: 'user', content: 'tạo chiến dịch email mới chào khách' },
    ];
    expect(extractWizardState(history).hasAttachedFile).toBe(false);
  });

  it('tệp nằm trước mốc huỷ (abandonedAtMessageCount) → KHÔNG tính', () => {
    const history = [
      { role: 'user', content: 'tạo chiến dịch giới thiệu tài liệu này', files: pdf },
      { role: 'assistant', type: 'ask_campaign_details', content: 'kênh?' },
      { role: 'user', content: 'tạo chiến dịch email chào khách' },
    ];
    expect(extractWizardState(history, { abandonedAtMessageCount: 2 }).hasAttachedFile).toBe(false);
  });
});

