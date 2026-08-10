import { describe, expect, it } from '@jest/globals';
import { parseCreateInvoiceItemResult } from '../matbaoHddtClient.util.js';

describe('parseCreateInvoiceItemResult', () => {
  it('reads nested Postman demo success (data[i].data.maSoHDon / shDon / urlDownloadPDF)', () => {
    const body = {
      data: [
        {
          errorCode: 200,
          data: {
            maSoHDon: 'QVh5dWZsYksyS0l4YkFUL3BrZm5BbXk0OUd4OHVIcTZhM0EvOXZydExFQWNmRDVFM2hDV1I0Y1ZkQVVrT213UA==',
            shDon: 0,
            urlDownloadPDF: 'https://demo-api-hddt.matbao.in/download/sample.pdf',
          },
        },
      ],
    };
    const parsed = parseCreateInvoiceItemResult(body);
    expect(parsed.errorCode).toBe('200');
    expect(parsed.maSoHdon).toBe(body.data[0].data.maSoHDon);
    expect(parsed.soHdon).toBe('0');
    expect(parsed.pdfUrl).toBe(body.data[0].data.urlDownloadPDF);
  });

  it('does not leave maSoHdon null when only nested fields exist', () => {
    const parsed = parseCreateInvoiceItemResult({
      data: [{ errorCode: 200, data: { maSoHDon: 'ABC', shDon: 12 } }],
    });
    expect(parsed.maSoHdon).toBe('ABC');
    expect(parsed.soHdon).toBe('12');
    expect(parsed.pdfUrl).toBeNull();
  });

  it('falls back to flat fields if API returns legacy shape', () => {
    const parsed = parseCreateInvoiceItemResult({
      data: [{ errorCode: 200, maSoHDon: 'FLAT', soHDon: 3 }],
    });
    expect(parsed.maSoHdon).toBe('FLAT');
    expect(parsed.soHdon).toBe('3');
  });
});
