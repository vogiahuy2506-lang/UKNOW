import { describe, expect, it } from '@jest/globals';
import { MAX_AI_MANUAL_RECIPIENTS, validateManualRecipients, validateTelegramChatIds } from '../manualRecipients.util.js';

describe('manualRecipients', () => {
  it('normalizes and deduplicates emails, phones, and uids', () => {
    expect(validateManualRecipients({
      emails: 'A@example.com\na@example.com',
      phones: '0912345678, 0912345678',
      uids: '123456789012345678, 123456789012345678',
    })).toEqual({
      emails: ['a@example.com'],
      phones: ['0912345678'],
      uids: ['123456789012345678'],
    });
  });

  it('validates 18-19 digit Zalo UIDs correctly', () => {
    const res = validateManualRecipients({
      uids: ['1234567890123456789', '9876543210987654321'],
    });
    expect(res.uids).toHaveLength(2);
    expect(res.uids[0]).toBe('1234567890123456789');
  });

  it('rejects invalid uids', () => {
    expect(() => validateManualRecipients({ uids: 'not-a-uid' })).toThrow('UID Zalo không hợp lệ');
    expect(() => validateManualRecipients({ uids: '123' })).toThrow('UID Zalo không hợp lệ'); // < 6 chars
  });

  it('restores leading zero for 9-digit mobile phones', () => {
    const res = validateManualRecipients({
      phones: '844790999, 388180856',
    });
    expect(res.phones).toEqual(['0844790999', '0388180856']);
  });

  it('rejects invalid phones (e.g. 0123456789 with non-existent prefix 01)', () => {
    expect(() => validateManualRecipients({ phones: '0123456789' })).toThrow('số điện thoại không hợp lệ');
    expect(() => validateManualRecipients({ phones: '12345' })).toThrow('số điện thoại không hợp lệ');
  });

  it('rejects invalid input and values over the hard limit', () => {
    expect(() => validateManualRecipients({ emails: 'not-an-email' })).toThrow('email không hợp lệ');
    expect(() => validateManualRecipients({ emails: Array.from({ length: MAX_AI_MANUAL_RECIPIENTS + 1 }, (_, i) => `u${i}@example.test`) }))
      .toThrow('tối đa');
  });
});

describe('validateTelegramChatIds — C P2-9', () => {
  it('nhận chat id số (người dương, nhóm/kênh âm), tách bằng dấu phẩy/xuống dòng, bỏ trùng', () => {
    expect(validateTelegramChatIds('123456789, -1001234567890\n123456789')).toEqual(['123456789', '-1001234567890']);
    expect(validateTelegramChatIds(['111111', ' 222222 '])).toEqual(['111111', '222222']);
  });

  it('rỗng/thiếu → mảng rỗng (nơi gọi tự quyết có bắt buộc)', () => {
    expect(validateTelegramChatIds(undefined)).toEqual([]);
    expect(validateTelegramChatIds('')).toEqual([]);
  });

  it('username/chữ/số quá dài → INVALID_MANUAL_RECIPIENTS; vượt trần → MANUAL_RECIPIENTS_LIMIT', () => {
    expect(() => validateTelegramChatIds('@ten')).toThrow(expect.objectContaining({ code: 'INVALID_MANUAL_RECIPIENTS', statusCode: 400 }));
    expect(() => validateTelegramChatIds('1'.repeat(21))).toThrow(expect.objectContaining({ code: 'INVALID_MANUAL_RECIPIENTS' }));
    expect(() => validateTelegramChatIds(Array.from({ length: MAX_AI_MANUAL_RECIPIENTS + 1 }, (_, i) => String(100000 + i))))
      .toThrow(expect.objectContaining({ code: 'MANUAL_RECIPIENTS_LIMIT' }));
  });

  it('validateManualRecipients giữ nguyên hình dạng { emails, phones, uids } (không có chatIds)', () => {
    expect(Object.keys(validateManualRecipients({ emails: 'a@example.com' })).sort()).toEqual(['emails', 'phones', 'uids']);
  });
});
