import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { compileCampaign } from '../campaignCompiler.service.js';
import { assertNoEmptyContent, mergeCompiledWithContent } from '../campaignScriptMerge.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AI_CAMPAIGN_SERVICE = path.resolve(__dirname, '../aiCampaign.service.js');

/**
 * Các bài test dưới đây kiểm CHÍNH MÃ NGUỒN của call site, không kiểm một bản sao logic.
 *
 * Lý do: bản đầu của tính năng này gọi `isCompilableIntent(intent)` với biến `intent` sẵn có
 * trong scope — mà biến đó là CHUỖI phân loại ý định ('content_plan_request'), không phải
 * CampaignIntentV1. Hậu quả: vị từ luôn trả false, compiler KHÔNG BAO GIỜ chạy, và log ghi ra
 * một lý do trông hợp lý ("intent khuyết trường") nên không ai nghi ngờ.
 *
 * 2049 test lúc đó vẫn xanh, vì các spec dựng lại logic cờ bằng tay thay vì chạy code thật.
 * Một bài test chép lại logic sản xuất thì không bao giờ bắt được lỗi đấu dây.
 */
describe('Call site của compiler trong aiCampaign.service.js', () => {
  const source = fs.readFileSync(AI_CAMPAIGN_SERVICE, 'utf8');

  it('phải tự dựng intent có cấu trúc bằng deriveIntent', () => {
    expect(source).toMatch(/deriveIntent\s*\(/);
  });

  it('KHÔNG được truyền thẳng biến `intent` của hàm bao ngoài vào isCompilableIntent', () => {
    expect(source).not.toMatch(/isCompilableIntent\s*\(\s*intent\s*\)/);
  });

  it('phải kiểm cờ COMPILER_ENABLED_FLOWS theo channel của intent đã dựng', () => {
    expect(source).toMatch(/COMPILER_ENABLED_FLOWS/);
    expect(source).toMatch(/campaignIntent\.channel/);
  });
});

describe('Việc 3 & 4: COMPILER_ENABLED_FLOWS feature flag & fallback logic', () => {
  const originalEnv = process.env.COMPILER_ENABLED_FLOWS;

  beforeEach(() => {
    process.env.COMPILER_ENABLED_FLOWS = '';
  });

  afterEach(() => {
    process.env.COMPILER_ENABLED_FLOWS = originalEnv;
  });

  const sampleZaloGroupIntent = {
    version: 1,
    channel: 'zalo_group',
    sender: { type: 'zalo_account', id: 8 },
    audience: { type: 'zalo_contacts', recipientKind: 'phone' },
    schedule: { type: 'once' },
  };

  const sampleLegacyScript = {
    nodes: [
      {
        tempId: 'legacy_send',
        nodeSubtype: 'send_zalo_group',
        config: {
          zaloGroupTemplateSteps: [{ message: '📢 Thông báo nhóm từ LLM' }],
        },
      },
    ],
    connections: [],
  };

  it('khi cờ tắt (mặc định), luồng không được compile và giữ nguyên script cũ', () => {
    process.env.COMPILER_ENABLED_FLOWS = '';
    const enabledFlows = (process.env.COMPILER_ENABLED_FLOWS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    expect(enabledFlows.includes(sampleZaloGroupIntent.channel)).toBe(false);
  });

  it('khi bật COMPILER_ENABLED_FLOWS=zalo_group, luồng zalo_group được compile và ghép nội dung thành công', () => {
    process.env.COMPILER_ENABLED_FLOWS = 'zalo_group';
    const enabledFlows = (process.env.COMPILER_ENABLED_FLOWS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    expect(enabledFlows.includes('zalo_group')).toBe(true);

    const compiled = compileCampaign(sampleZaloGroupIntent);
    const { script, unmatchedSlots } = mergeCompiledWithContent(compiled, sampleLegacyScript);
    expect(unmatchedSlots).toEqual([]);

    assertNoEmptyContent(script);
    script.compilerApplied = true;
    script._via = 'ai_compiler';

    expect(script._via).toBe('ai_compiler');
    expect(script.nodes.length).toBe(4);
    const sendNode = script.nodes.find((n) => n.nodeSubtype === 'send_zalo_group');
    expect(sendNode.config.zaloGroupTemplateSteps[0].message).toBe('📢 Thông báo nhóm từ LLM');
  });

  it('khi bật COMPILER_ENABLED_FLOWS=zalo_group, luồng email vẫn không bị can thiệp', () => {
    process.env.COMPILER_ENABLED_FLOWS = 'zalo_group';
    const enabledFlows = (process.env.COMPILER_ENABLED_FLOWS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    expect(enabledFlows.includes('email')).toBe(false);
  });

  it('khi nội dung LLM rỗng, assertNoEmptyContent chặn lại và ném EMPTY_CONTENT để kích hoạt fallback an toàn', () => {
    process.env.COMPILER_ENABLED_FLOWS = 'zalo_group';
    const emptyLegacyScript = {
      nodes: [
        {
          tempId: 'legacy_send',
          nodeSubtype: 'send_zalo_group',
          config: {
            zaloGroupTemplateSteps: [{ message: '' }],
          },
        },
      ],
    };

    const compiled = compileCampaign(sampleZaloGroupIntent);
    const { script, unmatchedSlots } = mergeCompiledWithContent(compiled, emptyLegacyScript);
    expect(unmatchedSlots.length).toBe(1);

    expect(() => assertNoEmptyContent(script)).toThrow();
  });
});
