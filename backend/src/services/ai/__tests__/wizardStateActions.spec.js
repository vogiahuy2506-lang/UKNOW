import { describe, expect, it } from '@jest/globals';
import {
  applyWizardStateAction,
  createEmptyWizardState,
} from '../aiCampaignWizard.service.js';

const stateWithPlan = () => {
  const state = createEmptyWizardState();
  state.gates.hasContentPlan = true;
  state.plan.snapshot = {
    totalDays: 2,
    days: [
      { day: 1, channel: 'email', slots: [{ channel: 'email', summary: 'A' }, { channel: 'email', summary: 'B' }] },
      { day: 2, channel: 'email', slots: [{ channel: 'email', summary: 'C' }] },
    ],
  };
  state.plan.status = 'waiting_day_confirm';
  return state;
};

const record = (slotId, day, templateId) => ({
  slotId, day, slotIndex: 1, channel: 'email', sendTime: null, summary: '',
  templateId, templateName: `T${templateId}`, subject: '', bodyHtml: '', bodyText: '',
});

describe('applyWizardStateAction', () => {
  it('throws 400 on unknown action', () => {
    expect(() => applyWizardStateAction(null, 'nope')).toThrow(expect.objectContaining({ status: 400 }));
  });

  describe('approve_plan', () => {
    it('sets planApproved and resets meta counters', () => {
      const base = createEmptyWizardState();
      base.meta = { lastGate: 'planApproved', lastGateCount: 3, deadEndLoggedAt: 'x', updatedAt: null };
      const { state, changed } = applyWizardStateAction(base, 'approve_plan');
      expect(changed).toBe(true);
      expect(state.gates.planApproved).toBe(true);
      expect(state.meta).toMatchObject({ lastGate: null, lastGateCount: 0, deadEndLoggedAt: null });
    });

    it('is a no-op when already approved', () => {
      const base = createEmptyWizardState();
      base.gates.planApproved = true;
      const { changed } = applyWizardStateAction(base, 'approve_plan');
      expect(changed).toBe(false);
    });
  });

  describe('set_sheet_url', () => {
    it('validates the URL', () => {
      expect(() => applyWizardStateAction(null, 'set_sheet_url', { sheetUrl: 'https://evil.com/x' }))
        .toThrow(expect.objectContaining({ status: 400 }));
    });

    it('sets sheetUrl and defaults dataSource to sheet', () => {
      const { state, changed } = applyWizardStateAction(null, 'set_sheet_url', {
        sheetUrl: 'https://docs.google.com/spreadsheets/d/abc/edit',
      });
      expect(changed).toBe(true);
      expect(state.gates.sheetUrl).toBe('https://docs.google.com/spreadsheets/d/abc/edit');
      expect(state.gates.dataSource).toBe('sheet');
    });

    it('is a no-op for an identical URL and keeps existing dataSource', () => {
      const base = createEmptyWizardState();
      base.gates.sheetUrl = 'https://docs.google.com/spreadsheets/d/abc/edit';
      base.gates.dataSource = 'db';
      const { changed, state } = applyWizardStateAction(base, 'set_sheet_url', {
        sheetUrl: 'https://docs.google.com/spreadsheets/d/abc/edit',
      });
      expect(changed).toBe(false);
      expect(state.gates.dataSource).toBe('db');
    });
  });

  describe('record_template_saved', () => {
    it('rejects empty or malformed records', () => {
      expect(() => applyWizardStateAction(null, 'record_template_saved', { records: [] }))
        .toThrow(expect.objectContaining({ status: 400 }));
      expect(() => applyWizardStateAction(null, 'record_template_saved', { records: [{ day: 1 }] }))
        .toThrow(expect.objectContaining({ status: 400 }));
    });

    it('appends with dedupe and keeps status waiting_template_save while days incomplete', () => {
      const base = stateWithPlan();
      const { state, changed } = applyWizardStateAction(base, 'record_template_saved', {
        records: [record('d1-s1', 1, 101), record('d1-s1', 1, 101)],
      });
      expect(changed).toBe(true);
      expect(state.plan.savedTemplates).toHaveLength(1);
      expect(state.plan.status).toBe('waiting_template_save');
    });

    it('flips status to waiting_campaign_confirm when every slot of every day is saved', () => {
      const base = stateWithPlan();
      const step1 = applyWizardStateAction(base, 'record_template_saved', {
        records: [record('d1-s1', 1, 101), record('d1-s2', 1, 102)],
      }).state;
      const { state } = applyWizardStateAction(step1, 'record_template_saved', {
        records: [record('d2-s1', 2, 103)],
      });
      expect(state.plan.status).toBe('waiting_campaign_confirm');
    });

    it('is a no-op when every slotId already recorded', () => {
      const base = stateWithPlan();
      const step1 = applyWizardStateAction(base, 'record_template_saved', {
        records: [record('d1-s1', 1, 101)],
      }).state;
      const { changed } = applyWizardStateAction(step1, 'record_template_saved', {
        records: [record('d1-s1', 1, 101)],
      });
      expect(changed).toBe(false);
    });
  });

  describe('reset_plan', () => {
    it('clears plan section and approval flags', () => {
      const base = stateWithPlan();
      base.gates.planApproved = true;
      base.plan.savedTemplates = [record('d1-s1', 1, 101)];
      const { state, changed } = applyWizardStateAction(base, 'reset_plan');
      expect(changed).toBe(true);
      expect(state.plan.snapshot).toBeNull();
      expect(state.plan.savedTemplates).toEqual([]);
      expect(state.gates.planApproved).toBe(false);
      expect(state.gates.hasContentPlan).toBe(false);
    });

    it('is a no-op when the plan is already empty', () => {
      const { changed } = applyWizardStateAction(createEmptyWizardState(), 'reset_plan');
      expect(changed).toBe(false);
    });
  });

  describe('mark_campaign_created', () => {
    it('completes the plan with campaignId', () => {
      const { state, changed } = applyWizardStateAction(stateWithPlan(), 'mark_campaign_created', { campaignId: 55 });
      expect(changed).toBe(true);
      expect(state.plan.status).toBe('completed');
      expect(state.plan.campaignId).toBe(55);
    });

    it('is a no-op when already completed with the same id', () => {
      const first = applyWizardStateAction(stateWithPlan(), 'mark_campaign_created', { campaignId: 55 }).state;
      const { changed } = applyWizardStateAction(first, 'mark_campaign_created', { campaignId: 55 });
      expect(changed).toBe(false);
    });

    it('reset gate: dọn sạch toàn bộ gates về trạng thái rỗng, giữ nguyên plan', () => {
      const base = stateWithPlan();
      base.gates.channel = 'zalo_group';
      base.gates.senderAccountId = '8';
      base.gates.senderAccountName = 'Tài khoản A';
      base.gates.zaloGroupIds = ['g1'];
      base.gates.isCampaignFlow = true;

      const { state, changed } = applyWizardStateAction(base, 'mark_campaign_created', { campaignId: 55 });

      expect(changed).toBe(true);
      expect(state.gates).toEqual(createEmptyWizardState().gates);
      // Giữ plan (snapshot của chiến dịch VỪA tạo) — chỉ gates reset, không phải plan.
      expect(state.plan.snapshot).toEqual(base.plan.snapshot);
    });

    it('reset meta.lastGate/lastGateCount/deadEndLoggedAt giống abandon_campaign_flow', () => {
      const base = stateWithPlan();
      base.meta = { lastGate: 'zaloGroups', lastGateCount: 2, deadEndLoggedAt: 'x', updatedAt: null };
      const { state } = applyWizardStateAction(base, 'mark_campaign_created', { campaignId: 55 });
      expect(state.meta).toMatchObject({ lastGate: null, lastGateCount: 0, deadEndLoggedAt: null });
    });

    it('KHÔNG đặt abandonedAtMessageCount — đây không phải sự kiện bỏ dở', () => {
      const base = stateWithPlan();
      const { state } = applyWizardStateAction(base, 'mark_campaign_created', { campaignId: 55 });
      expect(state.gates.abandonedAtMessageCount).toBeNull();
    });

    it('idempotent PHẢI xét cả gates rỗng: cùng campaignId nhưng gates đã có dữ liệu mới (chiến dịch tiếp theo) → vẫn changed=true, reset lại', () => {
      const afterFirst = applyWizardStateAction(stateWithPlan(), 'mark_campaign_created', { campaignId: 55 }).state;
      // Mô phỏng: người dùng bắt đầu chiến dịch MỚI trong cùng hội thoại, gate đã có dữ liệu,
      // nhưng client gọi lại mark_campaign_created với campaignId CŨ (retry/trễ mạng).
      const reStarted = { ...afterFirst, gates: { ...afterFirst.gates, channel: 'email', senderAccountId: '9' } };
      const { state, changed } = applyWizardStateAction(reStarted, 'mark_campaign_created', { campaignId: 55 });
      expect(changed).toBe(true);
      expect(state.gates).toEqual(createEmptyWizardState().gates);
    });
  });

  describe('abandon_campaign_flow', () => {
    it('resets gates and records abandonedAtMessageCount', () => {
      const base = stateWithPlan();
      base.gates.channel = 'email';
      base.gates.senderAccountId = '7';
      base.gates.isCampaignFlow = true;

      const { state, changed } = applyWizardStateAction(base, 'abandon_campaign_flow', { messageCount: 5 });
      expect(changed).toBe(true);
      expect(state.gates.channel).toBeNull();
      expect(state.gates.senderAccountId).toBeNull();
      expect(state.gates.isCampaignFlow).toBe(false);
      expect(state.gates.abandonedAtMessageCount).toBe(5);
      expect(state.plan.snapshot).toBeNull();
    });

    // PLAN_WIZARD_VONG_DOI PR-2 mục 7 (GIẢ ĐỊNH kiểm): reducer trước đây luôn changed:true —
    // đã thêm idempotent "gates đã ở đúng trạng thái đã bỏ dở, cùng messageCount → changed:false"
    // vì rẻ (cùng khuôn mark_campaign_created) — tránh PATCH lặp (double-click dismiss) ghi
    // thêm tin ranh giới trùng.
    it('idempotent: gọi lại với cùng messageCount khi gates đã ở đúng trạng thái đã bỏ dở → changed=false', () => {
      const afterFirst = applyWizardStateAction(stateWithPlan(), 'abandon_campaign_flow', { messageCount: 5 }).state;
      const { changed } = applyWizardStateAction(afterFirst, 'abandon_campaign_flow', { messageCount: 5 });
      expect(changed).toBe(false);
    });

    it('messageCount KHÁC (đợt bỏ dở mới, tin nhắn đã nhiều hơn) → vẫn changed=true dù gates đã rỗng', () => {
      const afterFirst = applyWizardStateAction(stateWithPlan(), 'abandon_campaign_flow', { messageCount: 5 }).state;
      const { state, changed } = applyWizardStateAction(afterFirst, 'abandon_campaign_flow', { messageCount: 12 });
      expect(changed).toBe(true);
      expect(state.gates.abandonedAtMessageCount).toBe(12);
    });

    it('gates đã có dữ liệu MỚI (chiến dịch tiếp theo đang làm dở) dù cùng messageCount cũ → vẫn changed=true', () => {
      const afterFirst = applyWizardStateAction(stateWithPlan(), 'abandon_campaign_flow', { messageCount: 5 }).state;
      const reStarted = { ...afterFirst, gates: { ...afterFirst.gates, channel: 'zalo_group', senderAccountId: '9' } };
      const { state, changed } = applyWizardStateAction(reStarted, 'abandon_campaign_flow', { messageCount: 5 });
      expect(changed).toBe(true);
      expect(state.gates.channel).toBeNull();
      expect(state.gates.senderAccountId).toBeNull();
    });
  });

  it('never mutates its input', () => {
    const base = stateWithPlan();
    const frozen = JSON.stringify(base);
    applyWizardStateAction(base, 'record_template_saved', { records: [record('d1-s1', 1, 101)] });
    applyWizardStateAction(base, 'approve_plan');
    expect(JSON.stringify(base)).toBe(frozen);
  });
});
