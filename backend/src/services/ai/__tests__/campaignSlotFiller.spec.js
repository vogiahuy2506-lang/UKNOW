import { describe, expect, it, jest } from '@jest/globals';
import { compileCampaign } from '../campaignCompiler.service.js';
import {
  applySlotsToGraph,
  buildSlotFillingPrompt,
  fillContentSlots,
} from '../campaignSlotFiller.service.js';

describe('GĐ 4: campaignSlotFiller.service', () => {
  const sampleZaloGroupIntentOnce = {
    version: 1,
    channel: 'zalo_group',
    sender: { type: 'zalo_account', id: 8 },
    audience: { type: 'zalo_contacts', groupIds: ['g1', 'g2'] },
    schedule: { type: 'once' },
    contentBrief: {
      topic: 'Khai giảng khoá học AI Automation',
      targetAudience: 'Học viên trong nhóm Zalo',
      tone: 'Hào hứng, chuyên nghiệp',
      locale: 'vi',
    },
  };

  const sampleZaloGroupIntentDrip = {
    version: 1,
    channel: 'zalo_group',
    sender: { type: 'zalo_account', id: 8 },
    audience: { type: 'zalo_contacts', groupIds: ['g1'] },
    schedule: { type: 'drip', days: 3, slotsPerDay: 1 },
    contentBrief: {
      topic: 'Chuỗi thông báo 3 ngày ra mắt tính năng mới',
      targetAudience: 'Cộng đồng Zalo',
      locale: 'vi',
    },
  };

  describe('buildSlotFillingPrompt', () => {
    it('sinh prompt đầy đủ thông tin chủ đề, đối tượng và danh sách slot', () => {
      const compiled = compileCampaign(sampleZaloGroupIntentOnce);
      const { systemPrompt, userPrompt } = buildSlotFillingPrompt({
        slots: compiled.contentSlots,
        campaignIntent: sampleZaloGroupIntentOnce,
      });

      expect(systemPrompt).toContain('Zalo Nhóm');
      expect(systemPrompt).toContain('slotId');
      expect(userPrompt).toContain('Khai giảng khoá học AI Automation');
      expect(userPrompt).toContain(compiled.contentSlots[0].slotId);
    });
  });

  describe('applySlotsToGraph', () => {
    it('điền thành công nội dung vào slot Zalo nhóm gửi 1 lần (once)', () => {
      const compiled = compileCampaign(sampleZaloGroupIntentOnce);
      expect(compiled.contentSlots.length).toBe(1);

      const filledSlots = [
        {
          slotId: compiled.contentSlots[0].slotId,
          message: '📢 Chào cả nhà! Khóa học AI Automation sẽ khai giảng vào tối thứ 6 tuần này.',
        },
      ];

      const { script, appliedCount } = applySlotsToGraph(compiled, filledSlots);
      expect(appliedCount).toBe(1);

      const sendNode = script.nodes.find((n) => n.nodeSubtype === 'send_zalo_group');
      expect(sendNode.config.zaloGroupTemplateSteps[0].message).toContain('khai giảng vào tối thứ 6');
      expect(Array.isArray(sendNode.config.zaloGroupTemplateSteps[0].templateMappings)).toBe(true);

      // Ràng buộc invariant: cấu trúc node, connections và IDs giữ nguyên 100%
      expect(script.nodes.length).toBe(compiled.nodes.length);
      expect(script.connections.length).toBe(compiled.connections.length);
      expect(script.nodes[0].id).toBe(compiled.nodes[0].id);
    });

    it('điền thành công nội dung vào chuỗi Zalo nhóm nhiều ngày (drip)', () => {
      const compiled = compileCampaign(sampleZaloGroupIntentDrip);
      expect(compiled.contentSlots.length).toBe(3);

      const filledSlots = [
        { slotId: compiled.contentSlots[0].slotId, message: '🎉 Ngày 1: Ra mắt tính năng AI mới!' },
        { slotId: compiled.contentSlots[1].slotId, message: '💡 Ngày 2: Hướng dẫn sử dụng chi tiết.' },
        { slotId: compiled.contentSlots[2].slotId, message: '⏰ Ngày 3: Ưu đãi chỉ còn trong hôm nay.' },
      ];

      const { script, appliedCount } = applySlotsToGraph(compiled, filledSlots);
      expect(appliedCount).toBe(3);

      const sendNode = script.nodes.find((n) => n.nodeSubtype === 'send_zalo_group');
      expect(sendNode.config.zaloGroupTemplateSteps.length).toBe(3);
      expect(sendNode.config.zaloGroupTemplateSteps[0].message).toContain('Ngày 1');
      expect(sendNode.config.zaloGroupTemplateSteps[1].message).toContain('Ngày 2');
      expect(sendNode.config.zaloGroupTemplateSteps[2].message).toContain('Ngày 3');
    });

    it('ném lỗi khi có slot bị rỗng nội dung để kích hoạt fail-open', () => {
      const compiled = compileCampaign(sampleZaloGroupIntentOnce);
      const invalidSlots = [
        { slotId: compiled.contentSlots[0].slotId, message: '   ' },
      ];

      expect(() => applySlotsToGraph(compiled, invalidSlots)).toThrow(/rỗng hoặc không có nội dung/);
    });

    it('bảo toàn 100% ID, node, connections của compiler (không sửa invariant đồ thị)', () => {
      const compiled = compileCampaign(sampleZaloGroupIntentOnce);
      const originalNodeIds = compiled.nodes.map((n) => n.id);
      const originalConnections = JSON.stringify(compiled.connections);

      const filledSlots = [
        { slotId: compiled.contentSlots[0].slotId, message: 'Tin nhắn hợp lệ cho nhóm' },
      ];

      const { script } = applySlotsToGraph(compiled, filledSlots);
      expect(script.nodes.map((n) => n.id)).toEqual(originalNodeIds);
      expect(JSON.stringify(script.connections)).toBe(originalConnections);
    });
  });

  describe('fillContentSlots (Fail-open resilience)', () => {
    it('trả về success: false an toàn khi compiledGraph không có slot nào', async () => {
      const res = await fillContentSlots({
        compiledGraph: { nodes: [], connections: [], contentSlots: [] },
        campaignIntent: sampleZaloGroupIntentOnce,
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe('no_slots_to_fill');
    });

    it('xử lý fail-open an toàn khi API ném lỗi hoặc không có cấu hình API key', async () => {
      const compiled = compileCampaign(sampleZaloGroupIntentOnce);
      const prevKey = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      try {
        const res = await fillContentSlots({
          compiledGraph: compiled,
          campaignIntent: sampleZaloGroupIntentOnce,
        });

        // Fail-open: không bao giờ ném lỗi ra ngoài, trả về success: false
        expect(res.success).toBe(false);
        expect(res.error).toBeDefined();
      } finally {
        if (prevKey) process.env.GEMINI_API_KEY = prevKey;
      }
    });
  });
});
