import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Chốt chặn: class Tailwind viết theo kiểu bản 4 mà bản 3 (repo đang dùng) KHÔNG sinh CSS.
 *
 * 10/10/2026: `p-4.5` / `py-4.5` không tồn tại ở Tailwind 3 → đệm 0 → modal Sản phẩm sát lề;
 * `shadow-xs` / `shadow-2xs` không sinh bóng (~250 chỗ); `py-0.2`, `mt-0.1` không tồn tại ở cả hai bản.
 * Không có lỗi build nào báo — class lạ chỉ lặng lẽ không có tác dụng.
 *
 * 11/10/2026: `backdrop-blur-xs` (14 chỗ, mọi lớp phủ modal) cũng là tên của bản 4 — bản 3 chỉ có
 * `backdrop-blur-sm` (4px, đúng bằng `xs` của bản 4) — nên lớp phủ không hề mờ. Cùng họ: `blur-xs`,
 * `rounded-xs`, `drop-shadow-xs`, `bg-linear-*`, `outline-hidden`, `inset-shadow-*`, `text-shadow-*`; bản 4 còn
 * nhận mọi số nguyên: `border-3` (3 spinner không hiện vòng vì preflight đặt viền 0) và `duration-250`.
 *
 * Spacing thập phân hợp lệ ở repo này: 0.5, 1.5, 2.5, 3.5 (có sẵn) + 4.5 (khai ở tailwind.config.js).
 * Muốn thêm số mới → khai vào `theme.extend.spacing` rồi thêm vào SPACING_DECIMALS_OK ở đây.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../..');

const SPACING_DECIMALS_OK = new Set(['0.5', '1.5', '2.5', '3.5', '4.5']);
// `shadow-<cỡ>` có sinh CSS. Màu bóng (`shadow-orange-200`, `shadow-black/5`) và giá trị tuỳ ý
// (`shadow-[...]`) không nằm trong luật này vì không khớp mẫu "cỡ".
const SHADOW_SIZES_OK = new Set(['sm', 'md', 'lg', 'xl', '2xl', 'inner', 'none', 'xs', '2xs']);

const SPACING_PREFIXES = [
  'p', 'px', 'py', 'pt', 'pr', 'pb', 'pl',
  'm', 'mx', 'my', 'mt', 'mr', 'mb', 'ml',
  'gap', 'gap-x', 'gap-y', 'space-x', 'space-y',
  'w', 'h', 'size', 'min-w', 'min-h', 'max-w', 'max-h',
  'top', 'left', 'right', 'bottom', 'inset', 'inset-x', 'inset-y',
];
// (?<![\w-]) để `-mt-0.2` (âm) vẫn bị bắt qua nhóm `-?`, còn `foo-w-1.2` thì không dính nhầm.
const SPACING_RE = new RegExp(
  `(?<![\\w-])-?(?:${SPACING_PREFIXES.join('|')})-(\\d+\\.\\d+)(?![\\w.])`,
  'g'
);
// Cỡ bóng: số tuỳ chọn + xs|sm|md|lg|xl, hoặc inner|none. Lookbehind bỏ `drop-shadow-*`.
const SHADOW_RE = /(?<![\w-])shadow-(\d*(?:xs|sm|md|lg|xl)|inner|none)(?![\w[-])/g;

// Tên chỉ có ở Tailwind 4 → bản 3 không sinh CSS, class lặng lẽ không có tác dụng.
// (?<![\w-]) để `backdrop-blur-xs` không bị đếm thêm một lần thành `blur-xs`, và `hover:`/`dark:` đứng trước vẫn bắt được.
const V4_ONLY_CLASSES = [
  { re: /(?<![\w-])backdrop-blur-xs(?![\w-])/g, use: 'backdrop-blur-sm (4px, đúng bằng xs của bản 4)' },
  { re: /(?<![\w-])blur-xs(?![\w-])/g, use: 'blur-sm' },
  { re: /(?<![\w-])rounded(?:-(?:t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee))?-xs(?![\w-])/g, use: 'rounded-sm (2px, đúng bằng xs của bản 4)' },
  { re: /(?<![\w-])drop-shadow-(?:2xs|xs)(?![\w-])/g, use: 'drop-shadow-sm' },
  { re: /(?<![\w-])bg-linear-[\w[]/g, use: 'bg-gradient-to-* hoặc bg-[linear-gradient(...)]' },
  { re: /(?<![\w-])bg-radial(?:-[\w[]|(?![\w:-]))/g, use: 'bg-[radial-gradient(...)]' },
  { re: /(?<![\w-])bg-conic(?:-[\w[]|(?![\w:-]))/g, use: 'bg-[conic-gradient(...)]' },
  { re: /(?<![\w-])outline-hidden(?![\w-])/g, use: 'outline-none' },
  { re: /(?<![\w-])inset-shadow(?:-[\w[]|(?![\w:-]))/g, use: 'shadow-inner' },
  { re: /(?<![\w-])text-shadow-[\w[]/g, use: 'style={{ textShadow }} hoặc [text-shadow:...]' },
  // Bản 4 nhận mọi số nguyên (border-3, duration-250, ring-3); bản 3 chỉ có dãy cố định.
  { re: /(?<![\w-])border(?:-[xytrblse])?-(?!(?:0|2|4|8)(?![\w.]))\d+(?![\w.-])/g, use: 'border-[3px] (hoặc 0/2/4/8)' },
  { re: /(?<![\w-])duration-(?!(?:0|75|100|150|200|300|500|700|1000)(?![\w.]))\d+(?![\w.-])/g, use: 'duration-[250ms] (hoặc 75/100/150/200/300/500/700/1000)' },
  { re: /(?<![\w-])ring-(?!(?:0|1|2|4|8)(?![\w.]))\d+(?![\w.-])/g, use: 'ring-[3px] (hoặc 0/1/2/4/8)' },
];

function listSourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.jsx'))) {
      out.push(full);
    }
  }
  return out;
}

function scan(re, isBad, group = 1) {
  const violations = [];
  for (const file of listSourceFiles(SRC)) {
    const rel = path.relative(SRC, file);
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      for (const match of line.matchAll(re)) {
        if (isBad(match[group])) {
          violations.push(`${rel}:${index + 1}: ${match[0]}`);
        }
      }
    });
  }
  return violations;
}

describe('tailwindClassesExist — class Tailwind 4 mà bản 3 không sinh CSS', () => {
  it('spacing thập phân chỉ nhận 0.5 / 1.5 / 2.5 / 3.5 / 4.5', () => {
    const violations = scan(SPACING_RE, (value) => !SPACING_DECIMALS_OK.has(value));
    expect(
      violations,
      `Class spacing thập phân không tồn tại (sinh CSS rỗng → đệm/cỡ bằng 0). Dùng số nguyên, 0.5/1.5/2.5/3.5/4.5, hoặc [giá trị]:\n${violations.join('\n')}`
    ).toEqual([]);
  });

  it('shadow-<cỡ> chỉ nhận sm / md / lg / xl / 2xl / inner / none / xs / 2xs', () => {
    const violations = scan(SHADOW_RE, (value) => !SHADOW_SIZES_OK.has(value));
    expect(
      violations,
      `Cỡ bóng không tồn tại (không sinh bóng). Khai ở tailwind.config.js boxShadow hoặc dùng cỡ có sẵn:\n${violations.join('\n')}`
    ).toEqual([]);
  });

  it('không dùng tên class chỉ có ở Tailwind 4 (backdrop-blur-xs, rounded-xs, bg-linear-*, outline-hidden...)', () => {
    const violations = [];
    for (const { re, use } of V4_ONLY_CLASSES) {
      for (const v of scan(re, () => true, 0)) {
        violations.push(`${v} → dùng ${use}`);
      }
    }
    expect(
      violations,
      `Tên class của Tailwind 4 mà repo (Tailwind 3) không sinh CSS — class lặng lẽ không có tác dụng:\n${violations.join('\n')}`
    ).toEqual([]);
  });

  it('cấu hình thật có sinh spacing 4.5 và shadow xs/2xs (chặn xoá nhầm khỏi tailwind.config.js)', async () => {
    const config = (await import('../../../tailwind.config.js')).default;
    expect(config.theme.extend.spacing['4.5']).toBe('1.125rem');
    expect(config.theme.extend.boxShadow.xs).toBeTruthy();
    expect(config.theme.extend.boxShadow['2xs']).toBeTruthy();
  });
});
