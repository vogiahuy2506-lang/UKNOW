import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Chốt chặn: mọi lớp huy hiệu `badge-<tên>` dùng trong mã phải được khai báo trong `src/index.css`.
 *
 * 11/10/2026: `badge-green`, `badge-red`, `badge-danger`, `badge-yellow`, `badge-blue`, `badge-purple`, `badge-primary` (23 chỗ —
 * Quản lý voucher, Thành viên, Cảnh báo, Hoá đơn, Marketplace) chưa từng được khai báo → chip mất nền + màu, chữ "Hoạt động"
 * xuống 2 dòng. Không lỗi build nào báo — lớp lạ chỉ lặng lẽ không có tác dụng.
 *
 * HOOK_ONLY: tên chỉ dùng làm móc nhận diện (đi kèm lớp màu thật), không cần CSS.
 */
const HOOK_ONLY = new Set(['unsubscribed', 'bounced', 'receipt', 'payer']);

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.(jsx?|tsx?)$/.test(entry.name) && !/\.(spec|test)\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('badgeClassesDefined', () => {
  it('mọi `badge-<tên>` dùng trong src đều có trong index.css (trừ móc nhận diện HOOK_ONLY)', () => {
    const css = fs.readFileSync(path.join(SRC_DIR, 'index.css'), 'utf8');
    const defined = new Set([...css.matchAll(/\.badge-([a-z]+)\b/g)].map((m) => m[1]));
    const missing = [];
    for (const file of walk(SRC_DIR)) {
      const text = fs.readFileSync(file, 'utf8');
      text.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/(?<![\w-])badge-([a-z]+)\b/g)) {
          if (!defined.has(m[1]) && !HOOK_ONLY.has(m[1])) {
            missing.push(`${path.relative(SRC_DIR, file)}:${i + 1}: badge-${m[1]}`);
          }
        }
      });
    }
    expect(missing, `Lớp huy hiệu chưa khai báo trong index.css — thêm vào index.css hoặc dùng badge-success/warning/error/info/gray:\n${missing.join('\n')}`).toEqual([]);
  });
});
