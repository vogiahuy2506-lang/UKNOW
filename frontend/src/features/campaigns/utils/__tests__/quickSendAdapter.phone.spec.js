/**
 * W7a — bảng input -> output SĐT WhatsApp GHIM CHUNG với backend
 * (backend/src/services/campaign/__tests__/quickSendAdapter.service.spec.js `WHATSAPP_PHONE_TABLE`).
 * Sửa một bên mà quên bên kia là đỏ một trong hai spec — FE chặt/lỏng hơn BE đều làm mất người nhận im lặng.
 */
import { describe, expect, it } from 'vitest';
import { parseWhatsAppPhoneList } from '../nodeConfigModal.helpers';
import {
  parseTelegramChatIdList,
  parseManualAdapterRecipients,
  shouldStopBatchOnFailedItem,
  shouldStopBatchOnHttpError,
} from '../../../../pages/campaigns/quickSendAdapter.util';

// GIỮ NGUYÊN bảng này với BE.
const WHATSAPP_PHONE_TABLE = [
  ['0912345678', '84912345678'],
  ['84912345678', '84912345678'],
  ['+84912345678', '84912345678'],
  ['0912 345 678', '84912345678'],
  ['0912-345-678', '84912345678'],
  ['(0912) 345.678', '84912345678'],
  ['1234567', null],
  ['abc', null],
  ['', null],
  ['0', null],
  ['1234567890123456', null],
  ['12345678', '12345678'],
  ['123456789012345', '123456789012345'],
];

describe('parseWhatsAppPhoneList FE — bảng ghim chung với backend normalizeWhatsAppPhone', () => {
  it.each(WHATSAPP_PHONE_TABLE)('%j -> %j', (input, expected) => {
    const { valid, invalid } = parseWhatsAppPhoneList(input);
    if (expected === null) {
      expect(valid).toEqual([]);
      // Chuỗi rỗng không tạo token nào; còn lại phải bị liệt kê là sai (giữ nguyên bản gõ).
      expect(invalid).toEqual(input.trim() === '' ? [] : [input.trim()]);
    } else {
      expect(valid).toEqual([expected]);
      expect(invalid).toEqual([]);
    }
  });
});

describe('parseTelegramChatIdList — ĐÚNG quy tắc backend (/[\\n,]/ + /^-?\\d+$/)', () => {
  it('nhận số, số âm (nhóm), khử trùng', () => {
    expect(parseTelegramChatIdList('123\n-100456,123')).toEqual({ valid: ['123', '-100456'], invalid: [] });
  });

  it('";" KHÔNG phải dấu tách (backend bỏ im lặng) -> cả mục là sai', () => {
    expect(parseTelegramChatIdList('12;34')).toEqual({ valid: [], invalid: ['12;34'] });
  });

  it.each([['abc'], ['12a'], ['1 2'], ['--1'], ['+5']])('"%s" sai', (bad) => {
    expect(parseTelegramChatIdList(bad).invalid).toEqual([bad]);
  });

  it('parseManualAdapterRecipients chọn đúng bộ tách theo kênh', () => {
    expect(parseManualAdapterRecipients('telegram', '0912345678').invalid).toEqual([]); // chỉ là số -> hợp lệ Telegram
    expect(parseManualAdapterRecipients('whatsapp', '0912345678').valid).toEqual(['84912345678']);
    expect(parseManualAdapterRecipients('whatsapp', '-100123').invalid).toEqual(['-100123']); // 6 chữ số < 8
  });
});

describe('phân loại dừng đợt', () => {
  it.each([['auth'], ['not_configured'], ['quota_exceeded'], ['system_error']])('failed %s -> dừng đợt', (errorCategory) => {
    expect(shouldStopBatchOnFailedItem({ errorCategory })).toBe(true);
  });
  it.each([['hard'], ['transient'], [undefined]])('failed %s -> đi tiếp', (errorCategory) => {
    expect(shouldStopBatchOnFailedItem({ errorCategory })).toBe(false);
  });
  it('HTTP 403/409/503 dừng; 400/500/mạng đi tiếp', () => {
    [403, 409, 503].forEach((status) => expect(shouldStopBatchOnHttpError({ response: { status } })).toBe(true));
    [400, 500, undefined].forEach((status) => expect(shouldStopBatchOnHttpError({ response: { status } })).toBe(false));
    expect(shouldStopBatchOnHttpError(new Error('Network Error'))).toBe(false);
  });
});
