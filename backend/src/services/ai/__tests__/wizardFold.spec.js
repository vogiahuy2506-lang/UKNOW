import { describe, expect, it } from '@jest/globals';
import {
  createEmptyDerivedWizardState,
  extractWizardState,
  foldWizardMessages,
} from '../aiCampaignWizard.service.js';

const HISTORY = [
  { role: 'user', content: 'Tạo chiến dịch email giới thiệu khoá học' },
  { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' },
  { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":7,"accountName":"Sales"}\nSales' },
];

describe('foldWizardMessages', () => {
  it('extractWizardState = gấp toàn bộ lịch sử từ state rỗng', () => {
    expect(foldWizardMessages(createEmptyDerivedWizardState(), HISTORY, {})).toEqual(extractWizardState(HISTORY));
  });

  it('createEmptyDerivedWizardState trả bản mới mỗi lần (không dùng chung mảng)', () => {
    const a = createEmptyDerivedWizardState();
    a.markerGates.push('x');
    expect(createEmptyDerivedWizardState().markerGates).toEqual([]);
  });

  it('indexOffset: chỉ số tuyệt đối — gấp tin cuối với offset khớp chỉ số trong lịch sử đầy đủ', () => {
    const tail = foldWizardMessages(createEmptyDerivedWizardState(), HISTORY.slice(-1), { indexOffset: HISTORY.length - 1 });
    expect(tail.senderAccountId).toBe(7);
    expect(tail.latestCampaignMessageIndex).toBe(HISTORY.length - 1);
    expect(tail.markerGates).toEqual(['senderAccount']);
  });

  it('indexOffset: mốc huỷ tính theo chỉ số tuyệt đối', () => {
    const skipped = foldWizardMessages(createEmptyDerivedWizardState(), HISTORY.slice(-1), {
      indexOffset: HISTORY.length - 1,
      abandonedAtMessageCount: HISTORY.length,
    });
    expect(skipped.senderAccountId).toBeNull();
    expect(skipped.isCampaignFlow).toBe(false);
  });
});
