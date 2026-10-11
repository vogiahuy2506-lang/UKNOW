import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../..');

const RULE1_ARBITRARY_RE = /dark:[\w:-]*-\[(#|rgb)/;
const RULE2_NEUTRAL_RE = /dark:([\w-]+:)*(bg|text|border|divide|ring|placeholder|from|via|to)-(white|black|slate|gray|zinc|neutral|stone)(-\d+)?\b/;
const RULE3_DARK_CLASS_RE = /\bdark:[a-zA-Z0-9[]/;

const PUBLIC_SURFACE_PATTERNS = [
  /^pages\/public\//,
  /^pages\/auth\//,
  /^pages\/docs\//,
  /^layouts\/(PublicLayout|AuthLayout|CheckoutLayout|PolicyLayout|DocsLayout)\.jsx$/,
  /^features\/hero\//,
  /^features\/checkout\//,
  /^features\/forms\/pages\/(PublicFormPage|FormSubmissionStatusPage)\.jsx$/,
];

function isPublicSurface(relPath) {
  return PUBLIC_SURFACE_PATTERNS.some((pattern) => pattern.test(relPath));
}

function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(full));
    } else if (entry.isFile() && (entry.name.endsWith('.jsx') || full.endsWith('src/index.css'))) {
      out.push(full);
    }
  }
  return out;
}

describe('noDarkVariants — chốt chặn thiết kế giao diện tối', () => {
  const allFiles = listFiles(SRC);

  it('Luật 1: cấm mọi dark: có giá trị tuỳ ý (hex hoặc rgb viết cứng)', () => {
    const violations = [];
    for (const file of allFiles) {
      const rel = path.relative(SRC, file);
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (RULE1_ARBITRARY_RE.test(line)) {
          violations.push(`${rel}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    expect(
      violations,
      `Phát hiện class dark: dùng mã màu tuỳ ý [#...] hoặc [rgb...]. Dùng token dk-* thay thế:\n${violations.join('\n')}`
    ).toEqual([]);
  });

  it('Luật 2: cấm dark: + màu trung tính có sẵn (trừ dòng có // dark-ngoai-le:)', () => {
    const violations = [];
    for (const file of allFiles) {
      const rel = path.relative(SRC, file);
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (RULE2_NEUTRAL_RE.test(line) && !line.includes('// dark-ngoai-le:')) {
          violations.push(`${rel}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    expect(
      violations,
      `Phát hiện class dark: dùng màu trung tính viết cứng (slate/gray/white...). Dùng token dk-* tương ứng:\n${violations.join('\n')}`
    ).toEqual([]);
  });

  it('Luật 3: cấm class dark: trong các bề mặt công khai luôn sáng', () => {
    const violations = [];
    for (const file of allFiles) {
      const rel = path.relative(SRC, file);
      if (!isPublicSurface(rel)) continue;

      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (RULE3_DARK_CLASS_RE.test(line)) {
          violations.push(`${rel}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    expect(
      violations,
      `Phát hiện class dark: trong bề mặt công khai luôn sáng (pages/public, auth, docs, checkout, hero...):\n${violations.join('\n')}`
    ).toEqual([]);
  });

  it('Luật 4: trong cùng một chuỗi class, dark:bg-X và dark:hover:bg-X không được trùng nhau', () => {
    const violations = [];
    for (const file of allFiles) {
      const rel = path.relative(SRC, file);
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        const bgMatches = [...line.matchAll(/\bdark:bg-([^\s"'`]+)/g)];
        const hoverMatches = [...line.matchAll(/\bdark:hover:bg-([^\s"'`]+)/g)];
        for (const bg of bgMatches) {
          const bgToken = bg[1];
          for (const h of hoverMatches) {
            const hoverToken = h[1];
            if (bgToken === hoverToken) {
              violations.push(`${rel}:${index + 1}: dark:bg-${bgToken} trùng dark:hover:bg-${hoverToken}`);
            }
          }
        }
      });
    }
    expect(
      violations,
      `Phát hiện class dark:bg-X và dark:hover:bg-X trùng token trong cùng một dòng. Rê chuột cần nâng nền lên 1 nấc (inset→surface, surface→raised, raised→strong, strong→dk-border-strong):\n${violations.join('\n')}`
    ).toEqual([]);
  });
});
