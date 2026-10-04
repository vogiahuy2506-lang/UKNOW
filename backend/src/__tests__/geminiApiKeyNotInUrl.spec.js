/**
 * D-08 / EXTRA-A2 (04/10/2026): khoá Gemini chỉ được đi bằng header `x-goog-api-key`, KHÔNG bao giờ nằm trong URL (`?key=`).
 * URL hay bị in ra log, thông báo lỗi mạng và proxy — khoá lộ là đốt tiền Google gián tiếp.
 *
 * Phép đo quét MÃ NGUỒN (không test file): mọi tệp dựng URL tới `generativelanguage.googleapis.com` không được ghép `key=` vào
 * chuỗi truy vấn. Bản trước chỉ lõi `generateContent` đã sạch; embedding, tư vấn trang chủ và ListModels còn `?key=`.
 * Có ca "phép đo không mù" để biết bộ quét thật sự thấy cả 3 nơi gọi Google (không phải quét thư mục rỗng rồi báo xanh).
 */
import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_ROOT = fileURLToPath(new URL('..', import.meta.url));
const GEMINI_HOST = 'generativelanguage.googleapis.com';
// `?key=` / `&key=` trong chuỗi URL, hoặc đặt tham số `key` bằng URLSearchParams.
const KEY_IN_QUERY_RE = /[?&]key=|searchParams\.(?:set|append)\(\s*['"`]key['"`]/;

function listSourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules' || name === 'fixtures') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      listSourceFiles(full, out);
    } else if (/\.(?:js|mjs|cjs)$/.test(name) && !/\.(?:spec|test)\./.test(name)) {
      out.push(full);
    }
  }
  return out;
}

/** Bỏ dòng chú thích (// … và * …) — chú thích được phép NHẮC `?key=` để giải thích vì sao đã bỏ. Không cắt `//` giữa dòng: URL có `https://`. */
const codeOnly = (text) => text
  .split('\n')
  .filter((line) => !/^\s*(?:\/\/|\*|\/\*)/.test(line))
  .join('\n');

const filesCallingGoogle = listSourceFiles(SRC_ROOT)
  .map((file) => ({ file, text: codeOnly(readFileSync(file, 'utf8')) }))
  .filter(({ text }) => text.includes(GEMINI_HOST));

describe('khoá Gemini không nằm trong URL', () => {
  it('phép đo không mù: thấy lõi generateContent, embedding và đồng bộ ListModels', () => {
    const names = filesCallingGoogle.map(({ file }) => file.slice(SRC_ROOT.length).replace(/\\/g, '/'));
    expect(names).toEqual(expect.arrayContaining([
      'utils/geminiClient.util.js',
      'utils/embeddingClient.util.js',
      'services/ai/aiModelCatalog.service.js',
    ]));
  });

  it('không tệp nguồn nào gọi Google mà ghép `key=` vào URL', () => {
    const offenders = filesCallingGoogle
      .filter(({ text }) => KEY_IN_QUERY_RE.test(text))
      .map(({ file }) => file.slice(SRC_ROOT.length).replace(/\\/g, '/'));
    expect(offenders).toEqual([]);
  });

  it('bộ lọc nhạy: bắt đúng các kiểu ghép khoá bản cũ', () => {
    expect(KEY_IN_QUERY_RE.test('https://generativelanguage.googleapis.com/v1/models/x:embedContent?key=${k}')).toBe(true);
    expect(KEY_IN_QUERY_RE.test('...:generateContent?a=1&key=${apiKey}')).toBe(true);
    expect(KEY_IN_QUERY_RE.test("url.searchParams.set('key', apiKey);")).toBe(true);
    expect(KEY_IN_QUERY_RE.test("headers: { 'x-goog-api-key': apiKey }")).toBe(false);
    expect(KEY_IN_QUERY_RE.test("url.searchParams.set('pageToken', t);")).toBe(false);
  });
});
