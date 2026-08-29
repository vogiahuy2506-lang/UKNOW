import { describe, expect, it, jest } from '@jest/globals';
import { checkSheetForChannel } from '../sheetRecipientCheck.service.js';

describe('sheetRecipientCheck.service', () => {
  it('returns invalid_url when sheetUrl is empty', async () => {
    const res = await checkSheetForChannel('', 'zalo');
    expect(res.status).toBe('invalid_url');
    expect(res.url).toBe('');
    expect(res.emailCount).toBe(0);
    expect(res.phoneCount).toBe(0);
    expect(res.headers).toEqual([]);
  });

  it('returns ok when sheet has phones for zalo channel', async () => {
    const mockExtract = jest.fn().mockResolvedValue({
      emails: [],
      phones: ['0901234567', '0912345678'],
      headers: ['Tên', 'Số điện thoại'],
      detectedColumns: { phone: true, email: false },
    });

    const res = await checkSheetForChannel('https://docs.google.com/spreadsheets/d/abc12345/edit', 'zalo', {
      extractFn: mockExtract,
    });
    expect(res.status).toBe('ok');
    expect(res.phoneCount).toBe(2);
    expect(res.emailCount).toBe(0);
    expect(res.headers).toEqual(['Tên', 'Số điện thoại']);
  });

  it('returns wrong_channel when sheet has only emails but channel is zalo', async () => {
    const mockExtract = jest.fn().mockResolvedValue({
      emails: ['user@example.com'],
      phones: [],
      headers: ['Tên', 'Email'],
      detectedColumns: { email: true, phone: false },
    });

    const res = await checkSheetForChannel('https://docs.google.com/spreadsheets/d/abc12345/edit', 'zalo', {
      extractFn: mockExtract,
    });
    expect(res.status).toBe('wrong_channel');
    expect(res.emailCount).toBe(1);
    expect(res.phoneCount).toBe(0);
    expect(res.headers).toEqual(['Tên', 'Email']);
  });

  it('returns wrong_channel when sheet has only phones but channel is email', async () => {
    const mockExtract = jest.fn().mockResolvedValue({
      emails: [],
      phones: ['0901234567'],
      headers: ['Tên', 'SĐT'],
      detectedColumns: { email: false, phone: true },
    });

    const res = await checkSheetForChannel('https://docs.google.com/spreadsheets/d/abc12345/edit', 'email', {
      extractFn: mockExtract,
    });
    expect(res.status).toBe('wrong_channel');
    expect(res.emailCount).toBe(0);
    expect(res.phoneCount).toBe(1);
    expect(res.headers).toEqual(['Tên', 'SĐT']);
  });

  it('maps NO_RECIPIENTS_FOUND to no_contact with headers attached', async () => {
    const error = new Error('No recipients');
    error.code = 'NO_RECIPIENTS_FOUND';
    error.statusCode = 400;
    error.headers = ['Task', 'Kết quả cần đạt', 'Nhân sự'];
    const mockExtract = jest.fn().mockRejectedValue(error);

    const res = await checkSheetForChannel('https://docs.google.com/spreadsheets/d/abc12345/edit', 'zalo', {
      extractFn: mockExtract,
    });
    expect(res.status).toBe('no_contact');
    expect(res.headers).toEqual(['Task', 'Kết quả cần đạt', 'Nhân sự']);
  });

  it('maps SHEET_NOT_PUBLIC to not_public', async () => {
    const error = new Error('Not public');
    error.code = 'SHEET_NOT_PUBLIC';
    error.statusCode = 400;
    const mockExtract = jest.fn().mockRejectedValue(error);

    const res = await checkSheetForChannel('https://docs.google.com/spreadsheets/d/abc12345/edit', 'zalo', {
      extractFn: mockExtract,
    });
    expect(res.status).toBe('not_public');
  });

  it('maps INVALID_SHEET_URL to invalid_url', async () => {
    const error = new Error('Invalid URL');
    error.code = 'INVALID_SHEET_URL';
    error.statusCode = 400;
    const mockExtract = jest.fn().mockRejectedValue(error);

    const res = await checkSheetForChannel('https://example.com/not-sheet', 'zalo', {
      extractFn: mockExtract,
    });
    expect(res.status).toBe('invalid_url');
  });

  it('maps RECIPIENTS_LIMIT_EXCEEDED to too_many', async () => {
    const error = new Error('Limit exceeded');
    error.code = 'RECIPIENTS_LIMIT_EXCEEDED';
    error.limit = 1000;
    error.totalCount = 6000;
    const mockExtract = jest.fn().mockRejectedValue(error);

    const res = await checkSheetForChannel('https://docs.google.com/spreadsheets/d/abc12345/edit', 'zalo', {
      extractFn: mockExtract,
    });
    expect(res.status).toBe('too_many');
    expect(res.limit).toBe(1000);
    expect(res.totalCount).toBe(6000);
  });

  it('maps SHEET_FETCH_FAILED or network errors to unknown without throwing', async () => {
    const error = new Error('Google 502 Bad Gateway');
    error.code = 'SHEET_FETCH_FAILED';
    error.statusCode = 502;
    const mockExtract = jest.fn().mockRejectedValue(error);

    const res = await checkSheetForChannel('https://docs.google.com/spreadsheets/d/abc12345/edit', 'zalo', {
      extractFn: mockExtract,
    });
    expect(res.status).toBe('unknown');
    expect(res.error).toContain('502');
  });
});
