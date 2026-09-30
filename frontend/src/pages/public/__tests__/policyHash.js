import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PUBLIC_DIR = path.resolve(HERE, '..');

/**
 * Băm nội dung các file trang của một chính sách: mỗi file chuẩn hoá `\r\n` → `\n`,
 * nối theo thứ tự `files`, phân cách bằng `\n/* ---- <TênFile> ---- *\/\n`. Trả về sha256 hex.
 * Dùng chung cho guard và cho việc in hash khi cập nhật `policyVersions.js`.
 */
export function computePolicyHash(files, dir = PUBLIC_DIR) {
  const parts = files.map((name) => {
    const raw = fs.readFileSync(path.join(dir, name), 'utf8');
    return raw.replace(/\r\n/g, '\n');
  });
  const joined = parts
    .map((text, i) => (i === 0 ? text : `\n/* ---- ${files[i]} ---- */\n${text}`))
    .join('');
  return crypto.createHash('sha256').update(joined).digest('hex');
}
