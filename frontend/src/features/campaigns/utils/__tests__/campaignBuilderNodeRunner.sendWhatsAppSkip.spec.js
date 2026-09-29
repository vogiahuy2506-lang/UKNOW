/**
 * PLAN_WHATSAPP_DAY_DU_2026-09-29 PR-W4b — dry-run: send_whatsapp KHÔNG được rơi vào nhánh mặc định
 * {ok:true} ("thành công giả"), cùng khuôn send_telegram.
 */
import { describe, expect, it } from 'vitest';
import { createCampaignNodeRunner } from '../campaignBuilderNodeRunner';

describe('campaignBuilderNodeRunner — send_whatsapp KHÔNG gửi khi "Chạy thử"', () => {
  it('output.skipped=true, reason dry_run_not_supported, KHÔNG có output.ok', async () => {
    const runner = createCampaignNodeRunner({ campaignId: 1, apiService: {} });
    const node = {
      id: 'n1',
      data: {
        nodeType: 'send_whatsapp',
        config: { whatsappSessionKey: '40-default', recipientSource: 'manual', recipientKeys: '84912345678', steps: [{ message: 'hi' }] },
      },
    };
    const result = await runner.buildRunResultForNode(node, {}, {});
    expect(result.output.skipped).toBe(true);
    expect(result.output.reason).toBe('dry_run_not_supported');
    expect(result.output.ok).toBeUndefined();
  });

  it('node lạ khác vẫn rơi vào nhánh mặc định {ok:true} — không phá hành vi cũ', async () => {
    const runner = createCampaignNodeRunner({ campaignId: 1, apiService: {} });
    const node = { id: 'n2', data: { nodeType: 'some_future_unknown_node_type', config: {} } };
    const result = await runner.buildRunResultForNode(node, {}, {});
    expect(result.output).toEqual({ ok: true });
  });
});
