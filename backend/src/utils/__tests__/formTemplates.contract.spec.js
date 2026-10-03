/**
 * Hợp đồng giữa bước "Chọn mẫu" của trình soạn biểu mẫu (frontend) và bộ chuẩn hoá THẬT của backend.
 *
 * Mẫu (`frontend/src/features/forms/constants/formTemplates.js`) chỉ điền sẵn state mà trình soạn đã
 * có; bấm Lưu thì đi đúng đường lưu cũ (POST /forms → normalizeFormFields / Settings / BookingConfig /
 * PaymentConfig). Spec này đẩy từng mẫu — cả bản vi lẫn en — qua các hàm chuẩn hoá đó, để mẫu nào
 * lệch hợp đồng (nhãn rỗng, role trùng, đặt lịch không có khung giờ, nút gửi quá 50 ký tự…) thì đỏ ở CI
 * chứ không phải đỏ ở lần lưu đầu tiên của khách.
 *
 * `toEditorPayload` bên dưới chép đúng cách `FormEditorPage.handleSave` dựng payload từ state (khoá
 * `key` của trường mới để trống → server tự sinh; settings luôn đủ 6 khoá; bookingConfig đủ 6 khoá).
 * Lệch với trình soạn thì spec FormEditorPage phía frontend (ghim payload thật) báo trước.
 */
import { describe, it, expect } from '@jest/globals';
import {
  FORM_TEMPLATES,
  buildFormFromTemplate,
} from '../../../../frontend/src/features/forms/constants/formTemplates.js';
import viDictionary from '../../../../frontend/src/i18n/vi.js';
import enDictionary from '../../../../frontend/src/i18n/en.js';
import {
  normalizeFormFields,
  normalizeFormSettings,
  normalizeBookingConfig,
  normalizePaymentConfig,
} from '../formDefinition.util.js';

const WEEKDAY_KEYS = ['0', '1', '2', '3', '4', '5', '6'];

const lookup = (dict, key) => key.split('.').reduce((node, part) => (node == null ? node : node[part]), dict);
const tFor = (dict) => (key) => {
  const v = lookup(dict, key);
  if (typeof v !== 'string') throw new Error(`Thiếu khoá dịch ${key}`);
  return v;
};

/** Chép FormEditorPage.handleSave: state → payload gửi POST /forms. */
function toEditorPayload(template, t) {
  const built = buildFormFromTemplate(template, t);
  const fields = built.fields.map((f) => {
    const item = { label: f.label.trim(), type: f.type, required: Boolean(f.required) };
    if (f.key && String(f.key).trim()) item.key = f.key.trim();
    if (f.role) item.role = f.role;
    if (['select', 'radio', 'checkbox'].includes(f.type)) {
      item.options = f.options.map((o) => String(o).trim()).filter(Boolean);
    }
    return item;
  });

  // DEFAULT_SETTINGS của trình soạn (+ chữ mặc định publicForm.*) gộp với phần mẫu ghi đè.
  const settings = {
    notifyOwner: true,
    consentEnabled: false,
    sendConfirmation: false,
    submitButtonText: t('publicForm.defaultSubmit'),
    successMessage: t('publicForm.defaultSuccess'),
    redirectUrl: '',
    ...built.settings,
  };
  const payloadSettings = {
    notifyOwner: Boolean(settings.notifyOwner),
    consentEnabled: Boolean(settings.consentEnabled),
    sendConfirmation: Boolean(settings.sendConfirmation),
    submitButtonText: settings.submitButtonText?.trim() || t('publicForm.defaultSubmit'),
    successMessage: settings.successMessage?.trim() || t('publicForm.defaultSuccess'),
    redirectUrl: settings.redirectUrl?.trim() || null,
  };

  let bookingConfig = null;
  if (built.bookingWeeklySlots) {
    const weeklySlots = {};
    for (const key of WEEKDAY_KEYS) weeklySlots[key] = (built.bookingWeeklySlots[key] || []).filter(Boolean);
    bookingConfig = {
      enabled: true,
      weeklySlots,
      slotCapacity: null, // '' trong state = không giới hạn → gửi null
      daysAhead: 30,
      minNoticeMinutes: 60,
      closedDates: [],
    };
  }

  return { fields, settings: payloadSettings, bookingConfig, enablePayment: built.enablePayment };
}

describe.each([
  ['vi', viDictionary],
  ['en', enDictionary],
])('mẫu biểu mẫu dựng sẵn đi qua bộ chuẩn hoá thật của backend (%s)', (_lang, dict) => {
  const t = tFor(dict);

  it.each(FORM_TEMPLATES.map((tpl) => [tpl.id, tpl]))('mẫu "%s": trường + cài đặt được chấp nhận nguyên trạng', (_id, template) => {
    const payload = toEditorPayload(template, t);

    const fields = normalizeFormFields(payload.fields);
    expect(fields).toHaveLength(template.fields.length);
    // Role và kiểu được giữ nguyên qua chuẩn hoá (không bị server âm thầm bỏ).
    expect(fields.map((f) => f.role)).toEqual(template.fields.map((f) => f.role || null));
    expect(fields.map((f) => f.type)).toEqual(template.fields.map((f) => f.type));
    for (const f of fields) {
      if (['select', 'radio', 'checkbox'].includes(f.type)) expect(f.options.length).toBeGreaterThan(0);
    }

    const settings = normalizeFormSettings(payload.settings);
    expect(settings.submitButtonText).toBe(payload.settings.submitButtonText);
    expect(settings.successMessage).toBe(payload.settings.successMessage);
    expect(settings.consentEnabled).toBe(false);
    expect(settings.redirectUrl).toBeNull();
  });

  it('mẫu "booking": bookingConfig được chấp nhận, có khung giờ; mẫu khác gửi null (đặt lịch tắt)', () => {
    for (const template of FORM_TEMPLATES) {
      const { bookingConfig } = toEditorPayload(template, t);
      const normalized = normalizeBookingConfig(bookingConfig);
      if (template.id === 'booking') {
        expect(normalized).not.toBeNull();
        expect(normalized.enabled).toBe(true);
        const total = WEEKDAY_KEYS.reduce((n, k) => n + normalized.weeklySlots[k].length, 0);
        expect(total).toBeGreaterThan(0);
      } else {
        expect(bookingConfig).toBeNull();
        expect(normalized).toBeNull();
      }
    }
  });

  it('mẫu "booking" phải điền sẵn khung giờ: bật đặt lịch mà rỗng thì backend từ chối (lý do mẫu có giờ mẫu)', () => {
    expect(() => normalizeBookingConfig({ enabled: true, weeklySlots: {} })).toThrow(
      'Bật đặt lịch phải có ít nhất 1 khung giờ trong tuần'
    );
  });

  it('mẫu "booking" có Email bắt buộc + bật gửi xác nhận (thư xác nhận / nhắc hẹn cần cả hai)', () => {
    const template = FORM_TEMPLATES.find((tpl) => tpl.id === 'booking');
    const { fields, settings } = toEditorPayload(template, t);
    const emailField = normalizeFormFields(fields).find((f) => f.role === 'email');
    expect(emailField).toBeDefined();
    expect(emailField.required).toBe(true);
    expect(settings.sendConfirmation).toBe(true);
  });

  it('mẫu "payment": chỉ bật cờ thanh toán — chủ form khai số tiền + tài khoản rồi mới lưu được (khai đủ thì backend nhận)', () => {
    const template = FORM_TEMPLATES.find((tpl) => tpl.id === 'payment');
    const payload = toEditorPayload(template, t);
    expect(payload.enablePayment).toBe(true);

    // Mới chọn mẫu, chưa khai gì: backend (và validate phía trình soạn) chặn — đúng như thiết kế.
    expect(() => normalizePaymentConfig({ enabled: true, methods: ['bank'], method: 'bank', holdMinutes: 30 })).toThrow(
      /Số tiền phải là số nguyên/
    );

    // Sau khi chủ form khai đủ ở khối Thanh toán (payload đúng hình trình soạn gửi) thì được nhận.
    const normalized = normalizePaymentConfig({
      enabled: true,
      methods: ['bank'],
      method: 'bank',
      amount: 500000,
      holdMinutes: 30,
      bankBin: '970436',
      accountNumber: '0123456789',
      accountName: 'Nguyen Van A',
    });
    expect(normalized).not.toBeNull();
    expect(normalized.amount).toBe(500000);
    expect(normalized.accountName).toBe('NGUYEN VAN A');
  });
});
