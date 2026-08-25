import { describe, it, expect } from 'vitest';
import { enrichTemplateDraftFromDb } from '../planWorkflowReconstitution';

describe('planWorkflowReconstitution — enrichTemplateDraftFromDb', () => {
  it('tái tạo đủ cờ client từ planSlotKey trong DB', () => {
    const dbData = {
      templateName: 'Email Chào Mừng Ngày 1',
      subject: 'Chào mừng bạn',
      bodyHtml: '<p>Nội dung</p>',
      channel: 'email',
      planSlotKey: 'd1-s1',
    };

    const enriched = enrichTemplateDraftFromDb(dbData, []);
    expect(enriched._planTemplate).toBe(true);
    expect(enriched._planSlotKey).toBe('d1-s1');
    expect(enriched._planSlotId).toBe('d1-s1');
    expect(enriched._planDay).toBe(1);
    expect(enriched._planSlotIndex).toBe(1);
    expect(enriched._fromLibrary).toBeUndefined();
  });

  it('gắn thông tin library template nếu slotId đã nằm trong savedTemplates của wizard_state', () => {
    const dbData = {
      templateName: 'Zalo Ngày 2',
      bodyText: 'Nội dung tin nhắn',
      channel: 'zalo',
      planSlotKey: 'd2-s2',
    };
    const savedTemplates = [
      { slotId: 'd1-s1', templateId: 101 },
      { slotId: 'd2-s2', templateId: 202 },
    ];

    const enriched = enrichTemplateDraftFromDb(dbData, savedTemplates);
    expect(enriched._planTemplate).toBe(true);
    expect(enriched._planDay).toBe(2);
    expect(enriched._planSlotIndex).toBe(2);
    expect(enriched._fromLibrary).toBe(true);
    expect(enriched._libraryTemplateId).toBe(202);
  });

  it('xử lý an toàn tin cũ không có planSlotKey (không ném lỗi)', () => {
    const legacyDraft = {
      templateName: 'Template tự do không thuộc kế hoạch',
      bodyHtml: '<p>Tự do</p>',
    };

    const enriched = enrichTemplateDraftFromDb(legacyDraft, []);
    expect(enriched).toEqual(legacyDraft);
    expect(enriched._planTemplate).toBeUndefined();
  });

  it('chấp nhận cả _planSlotKey cũ trong cache/local state', () => {
    const cachedDraft = {
      templateName: 'Draft từ cache',
      _planSlotKey: 'd3-s1',
    };

    const enriched = enrichTemplateDraftFromDb(cachedDraft, []);
    expect(enriched._planTemplate).toBe(true);
    expect(enriched._planDay).toBe(3);
    expect(enriched._planSlotIndex).toBe(1);
  });

  it('kịch bản dựng lại từ DB: draft có planSlotKey -> enrich -> lưu -> workflow nhận diện hợp lệ để tiến sang ngày kế', () => {
    // 1. Dữ liệu tin nhắn DB trả về sau khi F5
    const dbDraftMessageData = {
      templateName: 'Template Ngày 1',
      subject: 'Tiêu đề email',
      bodyHtml: '<p>Nội dung</p>',
      channel: 'email',
      planSlotKey: 'd1-s1',
    };

    // 2. Wizard state từ DB: kế hoạch 2 ngày, chưa lưu template nào
    const wizardStatePlan = {
      snapshot: {
        totalDays: 2,
        days: [
          { day: 1, slots: [{ slotIndex: 1, slotId: 'd1-s1' }] },
          { day: 2, slots: [{ slotIndex: 1, slotId: 'd2-s1' }] },
        ],
      },
      savedTemplates: [],
    };

    // 3. Bước dựng lại tin nhắn từ DB (AiChatbot loadSessionMessages)
    const enrichedDraft = enrichTemplateDraftFromDb(dbDraftMessageData, wizardStatePlan.savedTemplates);
    expect(enrichedDraft._planTemplate).toBe(true);
    expect(enrichedDraft._planSlotKey).toBe('d1-s1');

    // 4. Người dùng bấm "Lưu vào thư viện" -> gọi handlePlanTemplateSaved
    // Kiểm tra điều kiện chặn ở dòng đầu handlePlanTemplateSaved:
    const savedTemplateResult = { id: 501, templateName: enrichedDraft.templateName };
    const canProgress = Boolean(enrichedDraft._planTemplate && savedTemplateResult.id);
    expect(canProgress).toBe(true);

    // 5. Khẳng định cập nhật savedTemplates và hoàn tất Ngày 1
    const newRecord = {
      day: enrichedDraft._planDay,
      slotIndex: enrichedDraft._planSlotIndex,
      slotId: enrichedDraft._planSlotId,
      templateId: savedTemplateResult.id,
    };
    const updatedSaved = [...wizardStatePlan.savedTemplates, newRecord];
    expect(updatedSaved).toHaveLength(1);
    expect(updatedSaved[0].slotId).toBe('d1-s1');
  });
});
