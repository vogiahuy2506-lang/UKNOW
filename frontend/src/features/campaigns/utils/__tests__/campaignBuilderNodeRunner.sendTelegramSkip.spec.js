/**
 * PLAN_PR7_NODE_TELEGRAM_TRINH_DUNG_2026-09-28 mục 6 Bẫy — "đừng để chạy thử 'thành công giả'":
 * nhánh mặc định của buildRunResultForNode trả {output:{ok:true}} cho MỌI node lạ mà không gửi gì.
 * send_telegram phải dừng TRƯỚC nhánh đó.
 */
import { describe, expect, it } from 'vitest';
import { createCampaignNodeRunner } from '../campaignBuilderNodeRunner';

describe('campaignBuilderNodeRunner — send_telegram KHÔNG gửi khi "Chạy thử"', () => {
  it("output.skipped=true, KHÔNG có output.ok — không rơi vào nhánh mặc định {ok:true}", async () => {
    const runner = createCampaignNodeRunner({ campaignId: 1, apiService: {} });
    const node = {
      id: 'n1',
      data: {
        nodeType: 'send_telegram',
        config: { telegramAccountId: '7', recipientSource: 'manual', recipientKeys: '123456', steps: [{ message: 'hi' }] },
      },
    };
    const result = await runner.buildRunResultForNode(node, {}, {});
    expect(result.output.skipped).toBe(true);
    expect(result.output.ok).toBeUndefined();
  });

  it('một node lạ KHÁC (không phải send_telegram) vẫn rơi vào nhánh mặc định {ok:true} như trước — không phá hành vi cũ', async () => {
    const runner = createCampaignNodeRunner({ campaignId: 1, apiService: {} });
    const node = { id: 'n2', data: { nodeType: 'some_future_unknown_node_type', config: {} } };
    const result = await runner.buildRunResultForNode(node, {}, {});
    expect(result.output).toEqual({ ok: true });
  });
});
