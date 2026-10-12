import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../..');

// `api.post(url, null, …)`: instance `services/api.js` đặt sẵn Content-Type application/json nên axios gửi `null` thành
// CHUỖI "null"; `express.json()` của backend chạy chế độ strict (chỉ nhận object/array) → 400 SyntaxError, trả về
// trước cả bước kiểm đăng nhập. 10–12/10/2026: bấm thông báo, "Đánh dấu đã đọc hết" và nút "Đóng góp ý" trên
// production đều 400 — 40 thông báo chuông, 0 dòng được đánh dấu đã đọc. Route không cần thân thì gửi `{}`.
const NULL_BODY_RE = /\bapi\.(?:post|put|patch)\(\s*(?:`[^`]*`|'[^']*'|"[^"]*"|[\w.]+)\s*,\s*null\s*[,)]/g;

function listSource(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSource(full));
    else if (entry.isFile() && /\.(jsx?|mjs)$/.test(entry.name) && !/\.(spec|test)\.jsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('noNullJsonBody — không gửi thân JSON `null` qua api.post/put/patch', () => {
  it('axios thật biến thân null thành chuỗi "null" khi Content-Type là JSON (lý do luật này tồn tại)', () => {
    const transform = axios.defaults.transformRequest[0];
    const headers = new axios.AxiosHeaders({ 'Content-Type': 'application/json' });
    expect(transform.call({ transitional: axios.defaults.transitional }, null, headers)).toBe('null');
    expect(transform.call({ transitional: axios.defaults.transitional }, {}, headers)).toBe('{}');
  });

  it('không tệp nào trong src gọi api.post|put|patch(url, null, …)', () => {
    const violations = [];
    for (const file of listSource(SRC)) {
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(NULL_BODY_RE)) {
        const line = text.slice(0, match.index).split('\n').length;
        violations.push(`${path.relative(SRC, file)}:${line}  ${match[0]}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('mẫu regex bắt đúng các dạng gọi từng gây lỗi', () => {
    const samples = [
      "api.post(`/notifications/${encodeURIComponent(id)}/read`, null, REQUEST_OPTIONS)",
      "api.post('/notifications/read-all', null, REQUEST_OPTIONS)",
      'api.put(url, null)',
    ];
    samples.forEach((sample) => expect(sample.match(NULL_BODY_RE)).not.toBeNull());
    expect("api.post('/notifications/read-all', {}, REQUEST_OPTIONS)".match(NULL_BODY_RE)).toBeNull();
  });
});
