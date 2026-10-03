/**
 * F2.1 — brief HÌNH DẠNG THẬT cho slot filler (không mock, không tự dựng `contentBrief`).
 *
 * Brief đi qua đúng hàm production: lịch sử chat có marker `[wizard]{"gate":"campaignBrief",…}` →
 * `extractCampaignBriefFromHistory` → `mergeCampaignBrief` → `deriveIntent` → `compileCampaign` → `buildSlotFillingPrompt`.
 * Spec cũ (campaignSlotFiller.spec.js) tự gán `contentBrief: { topic }` — tên trường CampaignBrief thật không có — nên xanh
 * trong khi production ra "Chủ đề chính: Thông báo chiến dịch" (9 chiến dịch, 23 tin thật 20–26/09/2026).
 *
 * Hai đường kiểm riêng để mỗi mắt xích ánh xạ có ca đỏ riêng khi bị bỏ:
 *   - qua `campaignIntent.contentBrief` (do deriveIntent ánh xạ), KHÔNG truyền `brief`;
 *   - qua CampaignBrief thô (`brief`), KHÔNG truyền `campaignIntent`.
 */
import { describe, expect, it } from '@jest/globals';
import { extractCampaignBriefFromHistory, mergeCampaignBrief } from '../campaignBrief.service.js';
import { deriveIntent, isCompilableIntent, validateCampaignIntentV1 } from '../campaignIntent.schema.js';
import { compileCampaign } from '../campaignCompiler.service.js';
import { buildSlotFillingPrompt, SLOT_ANTI_FABRICATION_RULE } from '../campaignSlotFiller.service.js';

const GATES = {
  channel: 'zalo_group',
  senderAccountId: 8,
  zaloGroupIds: ['g1'],
  schedule: { mode: 'once' },
};

/** brief dựng bằng hàm production từ lịch sử có marker — đúng hình dạng `briefForState` ở aiCampaign.service. */
function realBrief(briefMarker, { defaultContentLocale = 'vi' } = {}) {
  const history = [
    { role: 'user', content: 'Tạo chiến dịch gửi nhóm Zalo' },
    { role: 'user', content: `[wizard]${JSON.stringify(briefMarker)}\nChủ đề` },
  ];
  const extracted = extractCampaignBriefFromHistory(history);
  expect(extracted.invalid).toBe(false);
  return mergeCampaignBrief(null, extracted.brief, { defaultContentLocale });
}

function compileFor(brief) {
  const { intent } = deriveIntent(GATES, brief);
  expect(isCompilableIntent(intent).ok).toBe(true);
  return { intent, compiled: compileCampaign(intent) };
}

describe('F2.1 — deriveIntent ánh xạ CampaignBrief THẬT sang contentBrief', () => {
  it('custom_topic: topicText → contentBrief.topic, contentLocale → contentBrief.locale, contentMode giữ lại', () => {
    const brief = realBrief({ gate: 'campaignBrief', contentMode: 'custom_topic', topicText: 'Lịch nghỉ Tết 2027' });
    // Hình dạng thật: KHÔNG có `topic` / `locale` — chỉ `topicText` / `contentLocale`.
    expect(brief.topic).toBeUndefined();
    expect(brief.locale).toBeUndefined();

    const { intent } = deriveIntent(GATES, brief);
    expect(intent.contentBrief).toMatchObject({ topic: 'Lịch nghỉ Tết 2027', locale: 'vi', contentMode: 'custom_topic' });
    expect(validateCampaignIntentV1(intent).valid).toBe(true);
  });

  it('single_product "other": productName/productDescription đi theo, topic mặc định là tên sản phẩm', () => {
    const brief = realBrief({
      gate: 'campaignBrief',
      contentMode: 'single_product',
      productMode: 'other',
      productName: 'Bó hoa hướng dương Mini',
      productDescription: 'Bó 5 bông, giao trong ngày',
    });
    const { intent } = deriveIntent(GATES, brief);
    expect(intent.contentBrief).toMatchObject({
      topic: 'Bó hoa hướng dương Mini',
      productName: 'Bó hoa hướng dương Mini',
      productDescription: 'Bó 5 bông, giao trong ngày',
    });
  });

  it('en: contentLocale "en" thành contentBrief.locale "en" (trước đây rơi mất → luôn tiếng Việt)', () => {
    const brief = realBrief(
      { gate: 'campaignBrief', contentMode: 'custom_topic', topicText: 'Holiday schedule' },
      { defaultContentLocale: 'en' }
    );
    const { intent } = deriveIntent(GATES, brief);
    expect(intent.contentBrief.locale).toBe('en');
  });

  it('vẫn nhận brief dựng tay kiểu cũ (topic/locale/tone) — không phá nơi gọi cũ', () => {
    const { intent } = deriveIntent(GATES, { topic: 'Khai giảng', locale: 'vi', tone: 'Hào hứng' });
    expect(intent.contentBrief).toMatchObject({ topic: 'Khai giảng', locale: 'vi', tone: 'Hào hứng' });
  });
});

describe('F2.1 — buildSlotFillingPrompt với brief THẬT', () => {
  it('đường qua INTENT (không truyền brief): prompt chứa topicText khách nhập', () => {
    const brief = realBrief({ gate: 'campaignBrief', contentMode: 'custom_topic', topicText: 'Lịch nghỉ Tết 2027' });
    const { intent, compiled } = compileFor(brief);
    const { userPrompt } = buildSlotFillingPrompt({ slots: compiled.contentSlots, campaignIntent: intent });

    expect(userPrompt).toContain('Lịch nghỉ Tết 2027');
    expect(userPrompt).not.toContain('Thông báo chiến dịch');
  });

  it('đường qua BRIEF thô (không truyền intent): prompt chứa topicText khách nhập', () => {
    const brief = realBrief({ gate: 'campaignBrief', contentMode: 'custom_topic', topicText: 'Lịch nghỉ Tết 2027' });
    const { compiled } = compileFor(brief);
    const { userPrompt } = buildSlotFillingPrompt({ slots: compiled.contentSlots, brief });

    expect(userPrompt).toContain('Lịch nghỉ Tết 2027');
    expect(userPrompt).not.toContain('Thông báo chiến dịch');
  });

  it('sản phẩm khách nhập (productName + productDescription) có mặt trong prompt', () => {
    const brief = realBrief({
      gate: 'campaignBrief',
      contentMode: 'single_product',
      productMode: 'other',
      productName: 'Bó hoa hướng dương Mini',
      productDescription: 'Bó 5 bông, giao trong ngày',
    });
    const { intent, compiled } = compileFor(brief);
    const { userPrompt } = buildSlotFillingPrompt({ slots: compiled.contentSlots, campaignIntent: intent, brief });

    expect(userPrompt).toContain('Bó hoa hướng dương Mini');
    expect(userPrompt).toContain('Bó 5 bông, giao trong ngày');
  });

  it('sản phẩm catalog đã giải (resolvedProducts) hiện tên + giá + mô tả', () => {
    const brief = realBrief({ gate: 'campaignBrief', contentMode: 'single_product', productId: 5 });
    const { intent, compiled } = compileFor(brief);
    const { userPrompt } = buildSlotFillingPrompt({
      slots: compiled.contentSlots,
      campaignIntent: intent,
      brief,
      resolvedProducts: [
        { id: 5, course_name: 'Khoá Marketing AI cơ bản', description: 'Học AI viết nội dung bán hàng', category: 'Đào tạo', price: 1990000, original_price: 2990000 },
      ],
    });

    expect(userPrompt).toContain('Khoá Marketing AI cơ bản');
    expect(userPrompt).toContain('Học AI viết nội dung bán hàng');
    expect(userPrompt).toContain('giá: 1990000');
    expect(userPrompt).toContain('giá gốc: 2990000');
  });

  it('locale en (qua intent): prompt yêu cầu tiếng Anh; locale vi: yêu cầu tiếng Việt có dấu', () => {
    const en = realBrief(
      { gate: 'campaignBrief', contentMode: 'custom_topic', topicText: 'Holiday schedule' },
      { defaultContentLocale: 'en' }
    );
    const enPrompt = buildSlotFillingPrompt({ slots: compileFor(en).compiled.contentSlots, campaignIntent: compileFor(en).intent });
    expect(enPrompt.systemPrompt).toContain('Write the ENTIRE message in natural, professional English');
    expect(enPrompt.userPrompt).toContain('Tiếng Anh (English)');

    const vi = realBrief({ gate: 'campaignBrief', contentMode: 'custom_topic', topicText: 'Lịch nghỉ Tết' });
    const viPrompt = buildSlotFillingPrompt({ slots: compileFor(vi).compiled.contentSlots, campaignIntent: compileFor(vi).intent });
    expect(viPrompt.systemPrompt).toContain('Tiếng Việt chuẩn có dấu');
    expect(viPrompt.systemPrompt).not.toContain('Write the ENTIRE message');
  });

  it('có luật cấm bịa giá/ưu đãi/ngày giờ ở CẢ prompt Zalo nhóm lẫn prompt kênh adapter', () => {
    const brief = realBrief({ gate: 'campaignBrief', contentMode: 'custom_topic', topicText: 'Lịch nghỉ Tết' });
    const { intent, compiled } = compileFor(brief);
    const group = buildSlotFillingPrompt({ slots: compiled.contentSlots, campaignIntent: intent });
    expect(group.systemPrompt).toContain(SLOT_ANTI_FABRICATION_RULE);
    expect(SLOT_ANTI_FABRICATION_RULE).toMatch(/giá, ưu đãi, khuyến mãi, chiết khấu, quà tặng, ngày giờ/);

    const adapter = buildSlotFillingPrompt({
      slots: [{ slotId: 'tg_step_0', channel: 'telegram', stepIndex: 0 }],
      campaignIntent: intent,
    });
    expect(adapter.systemPrompt).toContain('Telegram');
    expect(adapter.systemPrompt).toContain(SLOT_ANTI_FABRICATION_RULE);
  });

  it('không có chủ đề/sản phẩm: KHÔNG tự điền "Thông báo chiến dịch" mà nói thẳng là chưa có chủ đề', () => {
    const { userPrompt } = buildSlotFillingPrompt({
      slots: [{ slotId: 's1', channel: 'zalo_group', stepIndex: 0, day: 1 }],
      campaignIntent: {},
      brief: null,
    });
    expect(userPrompt).not.toContain('Thông báo chiến dịch');
    expect(userPrompt).toMatch(/chưa có chủ đề cụ thể/);
  });

  it('câu yêu cầu thật: tham số userPrompt thắng history; marker [wizard] bị bỏ, không thành "lời người dùng"', () => {
    const slots = [{ slotId: 's1', channel: 'zalo_group', stepIndex: 0, day: 1 }];
    const withPrompt = buildSlotFillingPrompt({
      slots,
      userPrompt: 'Gửi nhóm Zalo thông báo lịch nghỉ Tết',
      history: [{ role: 'user', content: 'tin khác' }],
    });
    expect(withPrompt.userPrompt).toContain('Gửi nhóm Zalo thông báo lịch nghỉ Tết');
    expect(withPrompt.userPrompt).not.toContain('tin khác');

    const markerOnly = buildSlotFillingPrompt({
      slots,
      history: [{ role: 'user', content: '[wizard]{"gate":"schedule","mode":"once"}\nGửi 1 lần' }],
    });
    expect(markerOnly.userPrompt).not.toContain('[wizard]');
    expect(markerOnly.userPrompt).not.toContain('Yêu cầu của người dùng');
  });
});
