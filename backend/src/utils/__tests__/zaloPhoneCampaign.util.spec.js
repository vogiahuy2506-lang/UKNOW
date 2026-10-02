import { describe, it, expect } from '@jest/globals';
import {
  normalizePhoneForZaloCampaign,
  isZaloUnreachableRecipientError,
  inferZaloUnreachableReason,
} from '../zaloPhoneCampaign.util.js';

describe('normalizePhoneForZaloCampaign', () => {
  it('84xxxxxxxxx (mã quốc gia) → 0xxxxxxxxx', () => {
    expect(normalizePhoneForZaloCampaign('84912345678')).toBe('0912345678');
  });

  it('+84 912 345 678 (dấu + và khoảng trắng) → 0912345678', () => {
    expect(normalizePhoneForZaloCampaign('+84 912 345 678')).toBe('0912345678');
  });

  it('0912-345-678 (gạch nối) → giữ nguyên số, chỉ bỏ ký tự không phải số', () => {
    expect(normalizePhoneForZaloCampaign('0912-345-678')).toBe('0912345678');
  });

  it('0912345678 (đã đúng dạng) → giữ nguyên', () => {
    expect(normalizePhoneForZaloCampaign('0912345678')).toBe('0912345678');
  });

  it('912345678 (9 số, thiếu 0, bắt đầu bằng 9) → khôi phục số 0', () => {
    expect(normalizePhoneForZaloCampaign('912345678')).toBe('0912345678');
  });

  it('877909606 (9 số, thiếu 0, đầu 8 Itelecom/VNPT) → khôi phục thành 0877909606', () => {
    expect(normalizePhoneForZaloCampaign('877909606')).toBe('0877909606');
  });

  it('812345678 (9 số, thiếu 0, đầu 8 Vinaphone) → khôi phục thành 0812345678', () => {
    expect(normalizePhoneForZaloCampaign('812345678')).toBe('0812345678');
  });

  it('312345678 (9 số, thiếu 0, đầu 3 Viettel) → khôi phục thành 0312345678', () => {
    expect(normalizePhoneForZaloCampaign('312345678')).toBe('0312345678');
  });

  it('512345678 (9 số, thiếu 0, đầu 5 Vietnamobile/Wintel) → khôi phục thành 0512345678', () => {
    expect(normalizePhoneForZaloCampaign('512345678')).toBe('0512345678');
  });

  it('712345678 (9 số, thiếu 0, đầu 7 Mobifone) → khôi phục thành 0712345678', () => {
    expect(normalizePhoneForZaloCampaign('712345678')).toBe('0712345678');
  });

  it('112345678 (9 số, bắt đầu bằng 1 - không phải đầu di động VN) → giữ nguyên 9 số', () => {
    expect(normalizePhoneForZaloCampaign('112345678')).toBe('112345678');
  });

  it('rỗng/null/undefined → chuỗi rỗng', () => {
    expect(normalizePhoneForZaloCampaign('')).toBe('');
    expect(normalizePhoneForZaloCampaign(null)).toBe('');
    expect(normalizePhoneForZaloCampaign(undefined)).toBe('');
  });

  it('rác chữ cái xen số ("abc123def") → chỉ giữ số', () => {
    expect(normalizePhoneForZaloCampaign('abc123def')).toBe('123');
  });
});

describe('isZaloUnreachableRecipientError', () => {
  it('người nhận từ chối nhận tin (chuỗi nguyên văn Zalo) → true', () => {
    const error = new Error('Xin lỗi! Hiện tại tôi không muốn nhận tin nhắn.');
    expect(isZaloUnreachableRecipientError(error)).toBe(true);
  });

  it('lỗi nhóm không tìm thấy (excludeDomain) → false', () => {
    const error = new Error('Không tìm thấy nhóm Zalo trong tài khoản');
    expect(isZaloUnreachableRecipientError(error)).toBe(false);
  });
});

describe('inferZaloUnreachableReason', () => {
  it('người nhận từ chối nhận tin (chuỗi nguyên văn Zalo) → stranger_blocked', () => {
    const error = new Error('Xin lỗi! Hiện tại tôi không muốn nhận tin nhắn.');
    expect(inferZaloUnreachableReason(error)).toBe('stranger_blocked');
  });

  it('lỗi nhóm không tìm thấy (đối chứng) → không thành stranger_blocked', () => {
    const error = new Error('Không tìm thấy nhóm Zalo trong tài khoản');
    expect(inferZaloUnreachableReason(error)).not.toBe('stranger_blocked');
  });
});

