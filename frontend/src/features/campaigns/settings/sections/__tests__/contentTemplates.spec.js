import { describe, expect, it, vi } from 'vitest';
import { createBlankContentStep } from '..';
import { normalizeEmailSubject, plainTextToEmailHtml, resolveCustomSteps } from '../contentTemplates';

const customStep = (content, extra = {}) => ({ ...createBlankContentStep(), content: { ...createBlankContentStep().content, mode: 'custom', ...content }, ...extra });
const templateStep = (templateId, extra = {}) => ({
  ...createBlankContentStep(),
  content: { ...createBlankContentStep().content, mode: 'template', templateId, templateName: `Mẫu ${templateId}` },
  origSignature: JSON.stringify(['template', String(templateId), '', '']),
  origIndex: 0,
  ...extra,
});

const makeServices = () => ({
  email: { createTemplate: vi.fn(), deleteTemplate: vi.fn().mockResolvedValue({}) },
  zalo: { createTemplate: vi.fn(), deleteTemplate: vi.fn().mockResolvedValue({}) },
});
const created = (id) => ({ data: { data: { id } } });

describe('plainTextToEmailHtml / normalizeEmailSubject', () => {
  it('chữ thuần → đoạn <p> (xuống dòng đơn → <br>); HTML giữ nguyên nhưng bỏ script / thuộc tính on*', () => {
    expect(plainTextToEmailHtml('Dòng 1\nDòng 2\n\nĐoạn 2')).toBe('<p>Dòng 1<br>Dòng 2</p>\n<p>Đoạn 2</p>');
    expect(plainTextToEmailHtml('<p onclick="x()">Chào</p><script>alert(1)</script>')).toBe('<p>Chào</p>');
  });
  it('tiêu đề: một dòng, bỏ ký tự điều khiển, tối đa 150 ký tự', () => {
    expect(normalizeEmailSubject('  Xin   chào\n bạn ')).toBe('Xin chào bạn');
    expect(normalizeEmailSubject('a'.repeat(200))).toHaveLength(150);
  });
});

describe('resolveCustomSteps', () => {
  it('email tự soạn: tạo mẫu đúng payload, tên "<chiến dịch> – Tin N", gắn templateId; tin dùng mẫu có sẵn không bị chạm', async () => {
    const services = makeServices();
    services.email.createTemplate.mockResolvedValue(created(901));
    const value = {
      nodeId: 'mail', channel: 'email', kind: 'email', maxSteps: 10,
      steps: [templateStep(7), customStep({ subject: ' Ưu đãi  hôm nay ', body: 'Chào bạn\nXem ngay' })],
    };
    const result = await resolveCustomSteps({ value, campaignName: 'Chăm sóc', messageLabel: 'Tin', services });
    expect(services.email.createTemplate).toHaveBeenCalledTimes(1);
    expect(services.email.createTemplate.mock.calls[0][0]).toMatchObject({
      templateName: 'Chăm sóc – Tin 2',
      subject: 'Ưu đãi hôm nay',
      bodyHtml: '<p>Chào bạn<br>Xem ngay</p>',
      category: 'marketing',
    });
    expect(services.email.createTemplate.mock.calls[0][0].templateCode).toMatch(/^cp_/);
    expect(services.zalo.createTemplate).not.toHaveBeenCalled();
    expect(result.created).toEqual([{ kind: 'email', id: 901, name: 'Chăm sóc – Tin 2' }]);
    expect(result.value.steps[0]).toBe(value.steps[0]);
    expect(result.value.steps[1].content).toMatchObject({ mode: 'template', templateId: 901, templateName: 'Chăm sóc – Tin 2' });
  });

  it('Zalo tự soạn: tạo mẫu zalo (bodyText), giữ chữ ở customBody để ghi message + ghép biến', async () => {
    const services = makeServices();
    services.zalo.createTemplate.mockResolvedValue(created(55));
    const value = { nodeId: 'z', channel: 'zalo', kind: 'zalo', maxSteps: 10, steps: [customStep({ body: 'Chào {{ten}}' })] };
    const result = await resolveCustomSteps({ value, campaignName: '', fallbackName: 'Chiến dịch', messageLabel: 'Tin', services });
    expect(services.zalo.createTemplate).toHaveBeenCalledWith(expect.objectContaining({ templateName: 'Chiến dịch – Tin 1', bodyText: 'Chào {{ten}}' }));
    expect(result.value.steps[0].content).toMatchObject({ mode: 'template', templateId: 55, customBody: 'Chào {{ten}}' });
  });

  it('lỗi ở tin thứ 2 (vd hết hạn mức mẫu): xoá mẫu vừa tạo ở tin 1, ném đúng câu của máy chủ, KHÔNG trả giá trị', async () => {
    const services = makeServices();
    services.zalo.createTemplate
      .mockResolvedValueOnce(created(61))
      .mockRejectedValueOnce({ response: { data: { message: 'Gói của bạn chỉ tạo được 10 mẫu Zalo.', limitReached: true } } });
    const value = { nodeId: 'z', channel: 'zalo', kind: 'zalo', maxSteps: 10, steps: [customStep({ body: 'Một' }), customStep({ body: 'Hai' })] };
    await expect(resolveCustomSteps({ value, campaignName: 'A', messageLabel: 'Tin', services })).rejects.toMatchObject({
      message: 'Gói của bạn chỉ tạo được 10 mẫu Zalo.',
      limitReached: true,
    });
    expect(services.zalo.deleteTemplate).toHaveBeenCalledTimes(1);
    expect(services.zalo.deleteTemplate).toHaveBeenCalledWith(61);
  });

  it('lỗi khi dọn mẫu không che lỗi gốc', async () => {
    const services = makeServices();
    services.zalo.createTemplate.mockResolvedValueOnce(created(61)).mockRejectedValueOnce(new Error('mạng đứt'));
    services.zalo.deleteTemplate.mockRejectedValue(new Error('xoá hỏng'));
    const value = { nodeId: 'z', channel: 'zalo', kind: 'zalo', maxSteps: 10, steps: [customStep({ body: 'Một' }), customStep({ body: 'Hai' })] };
    await expect(resolveCustomSteps({ value, campaignName: 'A', messageLabel: 'Tin', services })).rejects.toThrow('mạng đứt');
  });

  it('phản hồi không có id → coi là lỗi (không gắn templateId rỗng)', async () => {
    const services = makeServices();
    services.email.createTemplate.mockResolvedValue({ data: { data: {} } });
    const value = { nodeId: 'mail', channel: 'email', kind: 'email', maxSteps: 10, steps: [customStep({ subject: 'S', body: 'B' })] };
    await expect(resolveCustomSteps({ value, campaignName: 'A', messageLabel: 'Tin', services })).rejects.toThrow();
  });

  it('Telegram / WhatsApp: không tạo mẫu, trả nguyên giá trị; Zalo tự soạn KHÔNG đổi (đã có mẫu) cũng không tạo lại', async () => {
    const services = makeServices();
    const tg = { nodeId: 'tg', channel: 'telegram', kind: 'zalo', maxSteps: 5, steps: [customStep({ body: 'Chào' })] };
    expect((await resolveCustomSteps({ value: tg, services })).value).toBe(tg);
    const unchanged = customStep({ body: 'Giữ nguyên' }, { origSignature: JSON.stringify(['custom', '', '', 'Giữ nguyên']), needsTemplate: false });
    const zalo = { nodeId: 'z', channel: 'zalo', kind: 'zalo', maxSteps: 10, steps: [unchanged] };
    await resolveCustomSteps({ value: zalo, services });
    expect(services.zalo.createTemplate).not.toHaveBeenCalled();
  });
});
