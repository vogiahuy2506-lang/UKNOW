import { describe, expect, it } from '@jest/globals';
import { compileCampaign } from '../campaignCompiler.service.js';
import { assertNoEmptyContent, mergeCompiledWithContent } from '../campaignScriptMerge.service.js';

describe('Việc 1 & 2: campaignScriptMerge.service', () => {
  const intentZaloGroupOnce = {
    version: 1,
    channel: 'zalo_group',
    sender: { type: 'zalo_account', id: 9 },
    audience: { type: 'zalo_contacts', recipientKind: 'phone' },
    schedule: { type: 'once' },
  };

  it('ghép thành công nội dung Zalo nhóm một lần từ legacy zaloGroupTemplateSteps', () => {
    const compiled = compileCampaign(intentZaloGroupOnce);
    const legacyScript = {
      nodes: [
        {
          nodeSubtype: 'send_zalo_group',
          config: {
            zaloGroupTemplateSteps: [
              { message: '📢 Thông báo ra mắt khóa học mới cho nhóm!', templateId: 101 },
            ],
          },
        },
      ],
      connections: [],
    };

    const { script, unmatchedSlots } = mergeCompiledWithContent(compiled, legacyScript);
    expect(unmatchedSlots).toEqual([]);
    expect(script.nodes.length).toBe(4);

    const sendGroupNode = script.nodes.find((n) => n.nodeSubtype === 'send_zalo_group');
    expect(sendGroupNode).toBeDefined();
    expect(sendGroupNode.config.zaloAccountId).toBe(9);
    expect(sendGroupNode.config.zaloGroupTemplateSteps[0].message).toBe('📢 Thông báo ra mắt khóa học mới cho nhóm!');
    expect(sendGroupNode.config.zaloGroupTemplateSteps[0].templateId).toBe(101);

    expect(() => assertNoEmptyContent(script)).not.toThrow();
  });

  it('ghép thành công nội dung Zalo nhóm Drip 2 bước từ legacy script', () => {
    const intentZaloGroupDrip = {
      version: 1,
      channel: 'zalo_group',
      sender: { type: 'zalo_account', id: 9 },
      audience: { type: 'zalo_contacts', recipientKind: 'phone' },
      schedule: { type: 'drip', days: 2, slotsPerDay: 1 },
    };

    const compiled = compileCampaign(intentZaloGroupDrip);
    const legacyScript = {
      nodes: [
        {
          nodeSubtype: 'send_zalo_group',
          config: {
            zaloGroupTemplateSteps: [
              { message: 'Tin 1: Giới thiệu' },
              { message: 'Tin 2: Nhắc nhở ưu đãi' },
            ],
          },
        },
      ],
    };

    const { script, unmatchedSlots } = mergeCompiledWithContent(compiled, legacyScript);
    expect(unmatchedSlots).toEqual([]);

    const sendGroupNode = script.nodes.find((n) => n.nodeSubtype === 'send_zalo_group');
    expect(sendGroupNode.config.zaloGroupTemplateSteps.length).toBe(2);
    expect(sendGroupNode.config.zaloGroupTemplateSteps[0].message).toBe('Tin 1: Giới thiệu');
    expect(sendGroupNode.config.zaloGroupTemplateSteps[1].message).toBe('Tin 2: Nhắc nhở ưu đãi');

    expect(() => assertNoEmptyContent(script)).not.toThrow();
  });

  it('phát hiện unmatchedSlots và assertNoEmptyContent ném lỗi khi thiếu nội dung ở một bước', () => {
    const intentZaloGroupDrip = {
      version: 1,
      channel: 'zalo_group',
      sender: { type: 'zalo_account', id: 9 },
      audience: { type: 'zalo_contacts', recipientKind: 'phone' },
      schedule: { type: 'drip', days: 2, slotsPerDay: 1 },
    };

    const compiled = compileCampaign(intentZaloGroupDrip);
    // Legacy chỉ có 1 bước nhưng compiler cần 2 bước
    const incompleteLegacy = {
      nodes: [
        {
          nodeSubtype: 'send_zalo_group',
          config: {
            zaloGroupTemplateSteps: [{ message: 'Tin 1 duy nhất' }],
          },
        },
      ],
    };

    const { script, unmatchedSlots } = mergeCompiledWithContent(compiled, incompleteLegacy);
    expect(unmatchedSlots.length).toBe(1);
    expect(unmatchedSlots[0].stepIndex).toBe(1);

    expect(() => assertNoEmptyContent(script)).toThrow(/bước #2 có nội dung message rỗng/);
  });

  it('assertNoEmptyContent ném lỗi khi tin nhắn chỉ chứa khoảng trắng', () => {
    const badScript = {
      nodes: [
        {
          nodeSubtype: 'send_zalo_group',
          config: {
            zaloGroupTemplateSteps: [{ message: '   \n\t  ' }],
          },
        },
      ],
    };

    expect(() => assertNoEmptyContent(badScript)).toThrow(/nội dung message rỗng/);
  });

  it('ghép thành công nội dung Email (subject & body)', () => {
    const intentEmail = {
      version: 1,
      channel: 'email',
      sender: { type: 'email_account', id: 3 },
      audience: { type: 'sheet', url: 'https://sheet.url', recipientKind: 'email' },
      schedule: { type: 'once' },
    };

    const compiled = compileCampaign(intentEmail);
    const legacyScript = {
      nodes: [
        {
          nodeSubtype: 'send_email',
          config: {
            emailSteps: [{ emailSubject: 'Tiêu đề thật', emailBody: '<p>Nội dung thật</p>' }],
          },
        },
      ],
    };

    const { script, unmatchedSlots } = mergeCompiledWithContent(compiled, legacyScript);
    expect(unmatchedSlots).toEqual([]);
    const sendNode = script.nodes.find((n) => n.nodeSubtype === 'send_email');
    expect(sendNode.config.emailSteps[0].emailSubject).toBe('Tiêu đề thật');
    expect(sendNode.config.emailSteps[0].emailBody).toBe('<p>Nội dung thật</p>');
    expect(() => assertNoEmptyContent(script)).not.toThrow();
  });

  /**
   * Lệch số bước phải bị bắt ở CẢ HAI chiều.
   *
   * Vòng ghép duyệt theo bước của compiler, nên chiều "compiler nhiều hơn" tự lộ ra
   * (chỉ số vượt quá mảng legacy → không có nội dung). Nhưng chiều ngược lại thì không:
   * LLM soạn 5 tin, compiler dựng 3 bước → cả 3 đều có nội dung, `unmatchedSlots` rỗng,
   * bản ghép được áp dụng và **2 tin bị bỏ đi trong im lặng**. Khách nhận 3 thay vì 5.
   */
  const mkGroupScript = (steps) => ({
    nodes: [{ id: 'send', nodeSubtype: 'send_zalo_group', config: { zaloGroupTemplateSteps: steps } }],
    connections: [],
  });

  it('compiler ÍT bước hơn LLM → báo unmatched để rơi về script cũ, không âm thầm bỏ tin', () => {
    const compiled = mkGroupScript([{ message: '' }, { message: '' }, { message: '' }]);
    const legacy = mkGroupScript(
      Array.from({ length: 5 }, (_, i) => ({ message: `tin ${i + 1}` }))
    );

    const { unmatchedSlots } = mergeCompiledWithContent(compiled, legacy);

    expect(unmatchedSlots.length).toBeGreaterThan(0);
    expect(unmatchedSlots[0].reason).toBe('legacy_has_more_steps');
    expect(unmatchedSlots[0].legacyStepCount).toBe(5);
    expect(unmatchedSlots[0].compiledStepCount).toBe(3);
  });

  it('số bước bằng nhau → ghép được, không có unmatched', () => {
    const compiled = mkGroupScript([{ message: '' }, { message: '' }]);
    const legacy = mkGroupScript([{ message: 'tin 1' }, { message: 'tin 2' }]);

    const { script, unmatchedSlots } = mergeCompiledWithContent(compiled, legacy);

    expect(unmatchedSlots).toHaveLength(0);
    expect(script.nodes[0].config.zaloGroupTemplateSteps.map((s) => s.message)).toEqual([
      'tin 1',
      'tin 2',
    ]);
  });
});
