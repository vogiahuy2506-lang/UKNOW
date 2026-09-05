import { describe, it, expect } from '@jest/globals';
import { buildGoogleSheetsPayload } from '../googleSheetsAppend.util.js';
import { buildLandingLeadsAdminXlsxBuffer } from '../landingLeadsXlsxExport.util.js';
import ExcelJS from 'exceljs';

describe('buildGoogleSheetsPayload — Nghị định 330/2026', () => {
  it('không rò false ra Google Sheet của khách khi consent là null (chưa hỏi)', () => {
    const leadNull = { id: 1, email: 'null_consent@test.com', marketingConsent: null };
    const payload = buildGoogleSheetsPayload(leadNull);
    expect(payload.marketingConsent).toBeNull();
  });

  it('bảo toàn true khi khách đã đồng ý', () => {
    const leadTrue = { id: 2, email: 'true_consent@test.com', marketingConsent: true };
    const payload = buildGoogleSheetsPayload(leadTrue);
    expect(payload.marketingConsent).toBe(true);
  });

  it('bảo toàn false khi khách đã từ chối', () => {
    const leadFalse = { id: 3, email: 'false_consent@test.com', marketingConsent: false };
    const payload = buildGoogleSheetsPayload(leadFalse);
    expect(payload.marketingConsent).toBe(false);
  });
});

describe('buildLandingLeadsAdminXlsxBuffer — 3 nhãn Có / Không / —', () => {
  it('ghi đúng nhãn: Có (true), Không (false), — (null/chưa hỏi)', async () => {
    const items = [
      { id: 1, fullName: 'User A', email: 'a@test.com', marketingConsent: true, createdAt: '2026-09-05T10:00:00.000Z' },
      { id: 2, fullName: 'User B', email: 'b@test.com', marketingConsent: false, createdAt: '2026-09-05T10:00:00.000Z' },
      { id: 3, fullName: 'User C', email: 'c@test.com', marketingConsent: null, createdAt: '2026-09-05T10:00:00.000Z' },
    ];

    const buffer = await buildLandingLeadsAdminXlsxBuffer(items);
    expect(buffer).toBeInstanceOf(Buffer);

    // Đọc lại workbook từ buffer để assert giá trị ô
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('Khách landing');

    // Cột 7 là 'Đồng ý nhận tin' (marketingConsent)
    // Row 1 là header, row 2 là User A, row 3 là User B, row 4 là User C
    expect(sheet.getRow(2).getCell(7).value).toBe('Có');
    expect(sheet.getRow(3).getCell(7).value).toBe('Không');
    expect(sheet.getRow(4).getCell(7).value).toBe('—');
  });
});
