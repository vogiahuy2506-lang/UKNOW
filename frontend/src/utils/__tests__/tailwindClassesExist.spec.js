import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import tailwindConfig from '../../../tailwind.config.js';

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
 *
 * 11/10/2026: `animate-in fade-in zoom-in-95 slide-in-from-top-1` (16 chỗ / 10 tệp) là class của plugin `tailwindcss-animate`
 * mà repo không cài → modal xác nhận, ô gợi ý ngân hàng, menu thiết bị hiện cái bụp, không hiệu ứng. Giờ có plugin nội
 * tuyến trong tailwind.config.js (`animateInPlugin`, chỉ làm hiệu ứng VÀO); chốt dưới biên dịch Tailwind bằng cấu hình
 * thật và đòi MỌI class họ này đang dùng trong src sinh ra CSS — dùng `animate-out` / `slide-out-to-*` / `zoom-out`
 * (chưa có) sẽ đỏ ở đây thay vì lặng lẽ không có tác dụng.
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

// Họ class của `tailwindcss-animate` (không cài). Cả hướng "ra" (`animate-out`, `*-out-*`) cũng nằm trong mẫu: plugin nội tuyến
// chưa làm hiệu ứng ra, nên dùng chúng phải đỏ. (?<![\w-]) để `animate-fade-in` / `animate-fade-in-up` (class riêng ở index.css)
// không bị tính là `fade-in`.
const ANIMATE_FAMILY_RE =
  /(?<![\w-])(?:animate-(?:in|out)|(?:fade|zoom|spin)-(?:in|out)(?:-[\w/.]+)?|slide-(?:in-from|out-to)-(?:top|bottom|left|right)(?:-[\w/.]+)?)(?![\w-])/g;

async function compileUtilities(candidates, extraCss = '') {
  const result = await postcss([tailwindcss({ ...tailwindConfig, content: [{ raw: candidates.join(' ') }] })]).process(
    `@tailwind utilities;${extraCss}`,
    { from: undefined }
  );
  return result.css;
}

// Selector CSS của một class: thoát mọi ký tự ngoài [\w-] (`slide-in-from-top-1/2` → `.slide-in-from-top-1\/2`).
const cssSelector = (token) => `.${token.replace(/[^\w-]/g, '\\$&')}`;

describe('tailwindClassesExist — họ animate-in (plugin nội tuyến thay tailwindcss-animate)', () => {
  it('các class đang dùng (animate-in / fade-in / zoom-in-95 / slide-in-from-top-1 / duration-*) sinh CSS đúng', async () => {
    const css = await compileUtilities(
      ['animate-in', 'fade-in', 'fade-in-50', 'zoom-in-95', 'slide-in-from-top-1', 'duration-150', 'animate-spin'],
      '.btn { @apply transition-all duration-200; }'
    );
    // keyframes `enter` + class chạy nó
    expect(css).toMatch(/@keyframes enter\b/);
    expect(css).toMatch(/\.animate-in\s*\{[^}]*animation-name:\s*enter/);
    // các class đặt biến mà keyframes đọc
    expect(css).toMatch(/\.fade-in\s*\{[^}]*--tw-enter-opacity:\s*0/);
    expect(css).toMatch(/\.fade-in-50\s*\{[^}]*--tw-enter-opacity:\s*0?\.5/);
    expect(css).toMatch(/\.zoom-in-95\s*\{[^}]*--tw-enter-scale:\s*\.95/);
    expect(css).toMatch(/\.slide-in-from-top-1\s*\{[^}]*--tw-enter-translate-y:\s*-0?\.25rem/);
    // `duration-N` đi kèm animate-in đổi được thời lượng hiệu ứng (chỉ khi cùng phần tử có animate-in)
    expect(css).toMatch(/\.animate-in\[class~="duration-150"\]\s*\{[^}]*animation-duration:\s*150ms/);
    // không kéo rác theo `@apply duration-200` (`.btn`, `.transition-base`...) và không đụng animate-spin
    expect(css).not.toMatch(/\.animate-in\.[\w-]/);
    expect(css).not.toMatch(/\.animate-spin\s*\{[^}]*enter/);
  });

  it('MỌI class animate-in / fade-in / zoom-in / slide-in-from-* đang dùng trong src đều sinh CSS', async () => {
    const used = new Map(); // token → "tệp:dòng" đầu tiên
    for (const file of listSourceFiles(SRC)) {
      const rel = path.relative(SRC, file);
      fs.readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          for (const match of line.matchAll(ANIMATE_FAMILY_RE)) {
            if (!used.has(match[0])) used.set(match[0], `${rel}:${index + 1}`);
          }
        });
    }
    // Tự chứng minh bộ quét thấy được class đang dùng — không thì chốt này rỗng và xanh vô nghĩa.
    expect(used.has('animate-in'), 'bộ quét không thấy `animate-in` nào trong src (mẫu regex hỏng?)').toBe(true);

    const css = await compileUtilities([...used.keys()]);
    const missing = [...used.entries()]
      .filter(([token]) => !css.includes(cssSelector(token)))
      .map(([token, where]) => `${where}: ${token}`);
    expect(
      missing,
      `Class thuộc họ tailwindcss-animate mà tailwind.config.js (animateInPlugin) không sinh CSS — lặng lẽ không có tác dụng. Thêm vào plugin hoặc đổi sang class có sẵn:\n${missing.join('\n')}`
    ).toEqual([]);
  });
});
