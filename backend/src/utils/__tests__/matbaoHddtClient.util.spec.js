import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  parseCreateInvoiceItemResult,
  extractPdfBase64,
  extractPdfLink,
  assertAllowedMatbaoPdfUrl,
  isAllowedMatbaoPdfHost,
  matbaoDownloadInvoicePdf,
} from '../matbaoHddtClient.util.js';

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

describe('PDF response extractors', () => {
  it('reads data_PDF_Base64 variants', () => {
    expect(extractPdfBase64({ data_PDF_Base64: 'JVBERi0x' })).toBe('JVBERi0x');
    expect(extractPdfBase64({ data: { pdfBase64: 'AAA' } })).toBe('AAA');
  });

  it('reads link_file / urlDownloadPDF variants', () => {
    expect(extractPdfLink({ link_file: 'https://cdn.example/a.pdf' }))
      .toBe('https://cdn.example/a.pdf');
    expect(extractPdfLink({ data: { urlDownloadPDF: 'https://cdn.example/b.pdf' } }))
      .toBe('https://cdn.example/b.pdf');
    expect(extractPdfLink({ link_file: 'javascript:alert(1)' })).toBeNull();
  });
});

describe('Mat Bao PDF URL allowlist (SSRF)', () => {
  it('allows matbao.in and subdomains over https:443', () => {
    expect(isAllowedMatbaoPdfHost('demo-api-hddt.matbao.in')).toBe(true);
    expect(isAllowedMatbaoPdfHost('cdn.matbao.in')).toBe(true);
    expect(assertAllowedMatbaoPdfUrl('https://demo-api-hddt.matbao.in/a.pdf').hostname)
      .toBe('demo-api-hddt.matbao.in');
  });

  it('rejects non-allowlisted hosts, http, IPs, credentials, and odd ports', () => {
    expect(isAllowedMatbaoPdfHost('evil.example')).toBe(false);
    expect(isAllowedMatbaoPdfHost('127.0.0.1')).toBe(false);
    expect(() => assertAllowedMatbaoPdfUrl('https://evil.example/x.pdf')).toThrow(/allowlist/);
    expect(() => assertAllowedMatbaoPdfUrl('http://demo-api-hddt.matbao.in/x.pdf')).toThrow(/https/);
    expect(() => assertAllowedMatbaoPdfUrl('https://127.0.0.1/x.pdf')).toThrow(/allowlist/);
    expect(() => assertAllowedMatbaoPdfUrl('https://user:pass@demo-api-hddt.matbao.in/x.pdf'))
      .toThrow(/credentials/);
    expect(() => assertAllowedMatbaoPdfUrl('https://demo-api-hddt.matbao.in:8443/x.pdf'))
      .toThrow(/443/);
  });
});

describe('matbaoDownloadInvoicePdf pdf_url fallback follows allowlisted redirects only', () => {
  const origFetch = global.fetch;
  const pdfBytes = Buffer.from('%PDF-1.4 fake');

  afterEach(() => {
    global.fetch = origFetch;
  });

  it('follows https redirect on matbao.in and returns PDF', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        status: 302,
        ok: false,
        headers: { get: (h) => (h.toLowerCase() === 'location' ? 'https://cdn.matbao.in/file.pdf' : null) },
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        arrayBuffer: async () => pdfBytes,
      });

    const result = await matbaoDownloadInvoicePdf({
      pdfUrl: 'https://demo-api-hddt.matbao.in/download/sample.pdf',
    });
    expect(result.contentType).toBe('application/pdf');
    expect(result.buffer.subarray(0, 4).toString('utf8')).toBe('%PDF');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][1]).toEqual(expect.objectContaining({ redirect: 'manual' }));
  });

  it('rejects redirect to a non-allowlisted host', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      status: 302,
      ok: false,
      headers: { get: (h) => (h.toLowerCase() === 'location' ? 'https://127.0.0.1/ssrf' : null) },
    });

    await expect(matbaoDownloadInvoicePdf({
      pdfUrl: 'https://demo-api-hddt.matbao.in/download/sample.pdf',
    })).rejects.toThrow(/allowlist/);
  });

  it('rejects http pdf_url fallback without fetching', async () => {
    global.fetch = jest.fn();
    await expect(matbaoDownloadInvoicePdf({
      pdfUrl: 'http://demo-api-hddt.matbao.in/x.pdf',
    })).rejects.toThrow(/https/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
