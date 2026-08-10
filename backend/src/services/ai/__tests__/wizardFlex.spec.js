import { describe, expect, it } from '@jest/globals';
import {
  extractWizardState,
  isPlanApproveText,
  isPlanCancelText,
  withDeadEndNudge,
} from '../aiCampaignWizard.service.js';

describe('plan free-text approve / cancel', () => {
  it('matches whole-message approve phrases and rejects loose text', () => {
    expect(isPlanApproveText('đồng ý')).toBe(true);
    expect(isPlanApproveText('tạo đi')).toBe(true);
    expect(isPlanApproveText('ok')).toBe(true);
    expect(isPlanApproveText('được')).toBe(false);
    expect(isPlanApproveText('mình đồng ý với giá này')).toBe(false);
  });

  it('matches cancel phrases', () => {
    expect(isPlanCancelText('huỷ')).toBe(true);
    expect(isPlanCancelText('cancel')).toBe(true);
    expect(isPlanCancelText('thôi')).toBe(true);
    expect(isPlanCancelText('không huỷ được')).toBe(false);
  });

  it('sets planApproved from free-text before marker early-return', () => {
    const state = extractWizardState([
      {
        role: 'assistant',
        type: 'content_plan',
        content: 'plan',
        data: { totalDays: 3, days: [{ day: 1, channel: 'email', slots: [] }] },
      },
      { role: 'user', content: 'đồng ý' },
    ]);
    expect(state.hasContentPlan).toBe(true);
    expect(state.planApproved).toBe(true);
  });

  it('does not approve from free-text without a content plan', () => {
    const state = extractWizardState([
      { role: 'user', content: 'ok' },
    ]);
    expect(state.planApproved).toBe(false);
  });
});

describe('withDeadEndNudge', () => {
  it('appends plan-specific nudge when count >= 2', () => {
    const nudged = withDeadEndNudge(
      { type: 'ask_campaign_details', content: 'Xác nhận kế hoạch?' },
      { lastGateCount: 2 },
      'planApproved',
      'vi'
    );
    expect(nudged.content).toContain('Đồng ý');
    expect(nudged.content).toContain('huỷ');
  });

  it('uses generic nudge for other gates', () => {
    const nudged = withDeadEndNudge(
      { type: 'ask_campaign_details', content: 'Chọn kênh?' },
      { lastGateCount: 3 },
      'channel',
      'vi'
    );
    expect(nudged.content).toContain('lựa chọn');
    expect(nudged.content).not.toMatch(/Bấm \*\*Đồng ý\*\*/);
  });

  it('does not nudge when count < 2', () => {
    const original = { type: 'ask_campaign_details', content: 'Chọn kênh?' };
    expect(withDeadEndNudge(original, { lastGateCount: 1 }, 'channel', 'vi')).toEqual(original);
  });
});
