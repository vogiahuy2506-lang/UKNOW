/**
 * PLAN_WHATSAPP_DAY_DU_2026-09-29 PR-W4b — send_whatsapp trong nodeConfigModal.helpers.js:
 * createNodeConfigFormData (whitelist whatsappSessionKey, recipientSource mặc định
 * 'whatsapp_conversations') + quy tắc SĐT (hợp đồng W4a↔W4b mục 4) + handleNodeConfigSaveClick.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createNodeConfigFormData,
  handleNodeConfigSaveClick,
  normalizeWhatsAppPhone,
  parseWhatsAppPhoneList,
  WHATSAPP_PHONE_PATTERN,
} from '../nodeConfigModal.helpers';

describe('createNodeConfigFormData — send_whatsapp', () => {
  it('config rỗng -> nguồn mặc định whatsapp_conversations, steps 1 bước rỗng, chưa có tài khoản', () => {
    const formData = createNodeConfigFormData({ config: {}, nodeType: 'send_whatsapp' });
    expect(formData.recipientSource).toBe('whatsapp_conversations');
    expect(formData.whatsappSessionKey).toBe('');
    expect(formData.recipientKeys).toBe('');
    expect(formData.steps).toEqual([{ message: '' }]);
  });

  it('nodeType khác vẫn mặc định như cũ (email/không truyền: manual; telegram: telegram_conversations)', () => {
    expect(createNodeConfigFormData({ config: {}, nodeType: 'send_email' }).recipientSource).toBe('manual');
    expect(createNodeConfigFormData({ config: {} }).recipientSource).toBe('manual');
    expect(createNodeConfigFormData({ config: {}, nodeType: 'send_telegram' }).recipientSource).toBe('telegram_conversations');
  });

  it('mở lại hộp cấu hình -> giữ đủ whatsappSessionKey/recipientSource/recipientKeys/steps (không bị whitelist làm mất)', () => {
    const config = {
      whatsappSessionKey: '40-default',
      recipientSource: 'manual',
      recipientKeys: '84912345678\n0913456789',
      steps: [{ message: 'Xin chào {{ten}}' }],
    };
    const formData = createNodeConfigFormData({ config, nodeType: 'send_whatsapp' });
    expect(formData.whatsappSessionKey).toBe('40-default');
    expect(formData.recipientSource).toBe('manual');
    expect(formData.recipientKeys).toBe('84912345678\n0913456789');
    expect(formData.steps).toEqual([{ message: 'Xin chào {{ten}}' }]);
  });

  it("nguồn 'node' giữ recipientNodeId + recipientColumn", () => {
    const formData = createNodeConfigFormData({
      config: { recipientSource: 'node', recipientNodeId: 'n2', recipientColumn: 'sdt' },
      nodeType: 'send_whatsapp',
    });
    expect(formData.recipientSource).toBe('node');
    expect(formData.recipientNodeId).toBe('n2');
    expect(formData.recipientColumn).toBe('sdt');
  });

  it('recipientKeys dạng mảng (từ backend) -> chuỗi nhiều dòng cho textarea', () => {
    const formData = createNodeConfigFormData({
      config: { recipientKeys: ['84912345678', '84913456789'] },
      nodeType: 'send_whatsapp',
    });
    expect(formData.recipientKeys).toBe('84912345678\n84913456789');
  });
});

describe('normalizeWhatsAppPhone / parseWhatsAppPhoneList — quy tắc SĐT hợp đồng', () => {
  it("bỏ '+' đầu; VN 0… -> 84…; đã 84… giữ nguyên", () => {
    expect(normalizeWhatsAppPhone('+84912345678')).toBe('84912345678');
    expect(normalizeWhatsAppPhone('0912345678')).toBe('84912345678');
    expect(normalizeWhatsAppPhone('84912345678')).toBe('84912345678');
    expect(normalizeWhatsAppPhone('  0912345678  ')).toBe('84912345678');
    expect(normalizeWhatsAppPhone('+14155552671')).toBe('14155552671');
  });

  it('KHÔNG đổi 84… -> 0… (ngược Zalo)', () => {
    expect(normalizeWhatsAppPhone('84912345678').startsWith('0')).toBe(false);
  });

  it('regex đúng /^\\d{8,15}$/ — 7 chữ số bị chặn, 8 và 15 qua, 16 bị chặn', () => {
    expect(WHATSAPP_PHONE_PATTERN.source).toBe('^\\d{8,15}$');
    expect(WHATSAPP_PHONE_PATTERN.test('1234567')).toBe(false);
    expect(WHATSAPP_PHONE_PATTERN.test('12345678')).toBe(true);
    expect(WHATSAPP_PHONE_PATTERN.test('123456789012345')).toBe(true);
    expect(WHATSAPP_PHONE_PATTERN.test('1234567890123456')).toBe(false);
  });

  it("tách theo xuống dòng và ',' — '0912…, 84913…, abc' -> 2 số hợp lệ 84…, 1 sai", () => {
    const { valid, invalid } = parseWhatsAppPhoneList('0912345678,84913456789\nabc');
    expect(valid).toEqual(['84912345678', '84913456789']);
    expect(invalid).toEqual(['abc']);
  });

  it("KHÔNG tách theo ';' — '0912345678;0913456789' là MỘT token sai (đối chiếu split(/[\\n,]+/) của backend)", () => {
    const { valid, invalid } = parseWhatsAppPhoneList('0912345678;0913456789');
    expect(valid).toEqual([]);
    expect(invalid).toEqual(['0912345678;0913456789']);
  });

  it('số 7 chữ số bị chặn; khoảng trắng/gạch/dấu + bên trong bị BỎ như backend (0912 345-678 -> 84912345678)', () => {
    expect(parseWhatsAppPhoneList('1234567').invalid).toEqual(['1234567']);
    expect(parseWhatsAppPhoneList('0912 345-678').valid).toEqual(['84912345678']);
    expect(parseWhatsAppPhoneList('0912 345-678').invalid).toEqual([]);
    expect(normalizeWhatsAppPhone('(+84) 912 345 678')).toBe('84912345678');
  });

  it('khử trùng sau chuẩn hoá (0912… và 84912… là một số)', () => {
    expect(parseWhatsAppPhoneList('0912345678\n84912345678\n+84912345678').valid).toEqual(['84912345678']);
  });

  it('dòng trống bị bỏ; rỗng -> không có gì', () => {
    expect(parseWhatsAppPhoneList('\n\n , \n')).toEqual({ valid: [], invalid: [] });
    expect(parseWhatsAppPhoneList(undefined)).toEqual({ valid: [], invalid: [] });
  });
});

describe('handleNodeConfigSaveClick — send_whatsapp', () => {
  const baseFormData = {
    whatsappSessionKey: '40-default',
    recipientSource: 'whatsapp_conversations',
    steps: [{ message: 'Xin chào {{ten}}' }],
  };
  const makeToast = () => ({ error: vi.fn(), success: vi.fn() });
  const run = async (formData) => {
    const onSave = vi.fn();
    const toastNotifier = makeToast();
    await handleNodeConfigSaveClick({ nodeType: 'send_whatsapp', formData, onSave, toastNotifier });
    return { onSave, toastNotifier };
  };

  it('thiếu tài khoản -> báo lỗi, KHÔNG onSave', async () => {
    const { onSave, toastNotifier } = await run({ ...baseFormData, whatsappSessionKey: '' });
    expect(onSave).not.toHaveBeenCalled();
    expect(toastNotifier.error).toHaveBeenCalledWith(expect.stringContaining('tài khoản WhatsApp'));
  });

  it('nội dung rỗng -> báo lỗi, KHÔNG onSave', async () => {
    const { onSave, toastNotifier } = await run({ ...baseFormData, steps: [{ message: '  ' }] });
    expect(onSave).not.toHaveBeenCalled();
    expect(toastNotifier.error).toHaveBeenCalledWith(expect.stringContaining('nội dung'));
  });

  it('nội dung > 4096 -> báo lỗi; đúng 4096 -> qua', async () => {
    const over = await run({ ...baseFormData, steps: [{ message: 'a'.repeat(4097) }] });
    expect(over.onSave).not.toHaveBeenCalled();
    expect(over.toastNotifier.error).toHaveBeenCalledWith(expect.stringContaining('4096'));
    const exact = await run({ ...baseFormData, steps: [{ message: 'a'.repeat(4096) }] });
    expect(exact.onSave).toHaveBeenCalledTimes(1);
  });

  it('nguồn hội thoại đủ tài khoản + nội dung -> onSave nguyên formData', async () => {
    const { onSave, toastNotifier } = await run(baseFormData);
    expect(onSave).toHaveBeenCalledWith(baseFormData);
    expect(toastNotifier.error).not.toHaveBeenCalled();
  });

  it('nhập SĐT: 7 chữ số bị chặn, KHÔNG onSave', async () => {
    const { onSave, toastNotifier } = await run({ ...baseFormData, recipientSource: 'manual', recipientKeys: '1234567' });
    expect(onSave).not.toHaveBeenCalled();
    expect(toastNotifier.error).toHaveBeenCalledWith(expect.stringContaining('1234567'));
  });

  it("nhập SĐT: chứa chữ ('abc') hoặc ngăn bằng ';' -> chặn", async () => {
    const abc = await run({ ...baseFormData, recipientSource: 'manual', recipientKeys: '0912345678\nabc' });
    expect(abc.onSave).not.toHaveBeenCalled();
    expect(abc.toastNotifier.error).toHaveBeenCalledWith(expect.stringContaining('abc'));
    const semi = await run({ ...baseFormData, recipientSource: 'manual', recipientKeys: '0912345678;0913456789' });
    expect(semi.onSave).not.toHaveBeenCalled();
  });

  it('nhập SĐT: rỗng -> chặn; hợp lệ (0…, 84…, +84…) -> onSave', async () => {
    const empty = await run({ ...baseFormData, recipientSource: 'manual', recipientKeys: '  ' });
    expect(empty.onSave).not.toHaveBeenCalled();
    const ok = await run({ ...baseFormData, recipientSource: 'manual', recipientKeys: '0912345678,84913456789\n+84914567890' });
    expect(ok.onSave).toHaveBeenCalledTimes(1);
    expect(ok.toastNotifier.error).not.toHaveBeenCalled();
  });

  it("nguồn 'node': thiếu khối -> chặn; thiếu cột -> chặn; đủ cả hai -> onSave", async () => {
    const noNode = await run({ ...baseFormData, recipientSource: 'node', recipientNodeId: '', recipientColumn: 'sdt' });
    expect(noNode.onSave).not.toHaveBeenCalled();
    const noCol = await run({ ...baseFormData, recipientSource: 'node', recipientNodeId: 'n2', recipientColumn: '' });
    expect(noCol.onSave).not.toHaveBeenCalled();
    const ok = await run({ ...baseFormData, recipientSource: 'node', recipientNodeId: 'n2', recipientColumn: 'sdt' });
    expect(ok.onSave).toHaveBeenCalledTimes(1);
  });
});
