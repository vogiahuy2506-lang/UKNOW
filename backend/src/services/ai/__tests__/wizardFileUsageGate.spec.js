import { describe, expect, it } from '@jest/globals';
import {
  buildFileUsageQuestion,
  createEmptyWizardState,
  evaluateNextGate,
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
