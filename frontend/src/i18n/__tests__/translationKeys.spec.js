import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vi from '../vi.js';
import en from '../en.js';

/**
 * Ngày 07/09/2026, commit 1a992e76 mang tên "fix(lint)" xoá 130 khoá dịch khỏi vi.js và en.js.
 * Vì t() rơi về chính chuỗi khoá khi tra hụt (index.jsx), giao diện không vỡ mà chỉ hiện chuỗi
 * thô — không test nào đỏ, CI xanh, và bản thiếu lên thẳng production.
 *
 * Ba tính năng gãy vì đúng commit đó, phát hiện rời rạc trong ba ngày: modal "Bổ sung số điện
 * thoại" (chặn cả app, 09/09), modal xin đồng ý Nghị định 330, và toàn bộ trang Đối tác
 * Affiliate (115 khoá, 145 điểm gọi). Mỗi lần lại vá riêng một khoá.
 *
 * Test này thay cách vá đó: quét mọi lời gọi t('a.b') tĩnh trong frontend/src rồi đối chiếu với
 * từ điển. KNOWN_MISSING là hiện trạng đo được — danh sách chỉ được phép ngắn đi. Thêm một khoá
 * gọi mà quên khai báo, hoặc xoá một khoá đang có người gọi, đều đỏ ngay.
 *
 * ── Hai điểm mù đã sửa (10/09/2026) ──────────────────────────────────────────────────────────
 *
 * Bản đầu của phép quét báo 66 khoá vỡ ở vi. Đo lại thì 53 trong số đó là dương tính giả:
 *
 *   1. **`useI18n('<namespace>')` tự thêm tiếp đầu ngữ lúc runtime** (index.jsx:79-88). Sáu
 *      trang marketplace gọi `const t = useI18n('marketplace')`, nên `t('detail.loadError')`
 *      thật ra tra `marketplace.detail.loadError` — khoá đã có đủ ở cả hai ngôn ngữ. Phép quét
 *      cũ chỉ đọc chuỗi literal truyền vào `t(...)` rồi tra ở gốc từ điển nên luôn báo "vỡ".
 *      Nay `collectCallSites()` ghi lại các namespace mà mỗi file scope hoá, và `isResolvable()`
 *      nhận khoá là hợp lệ nếu giải được ở gốc HOẶC dưới bất kỳ namespace nào của file đó.
 *      Chấp nhận cả hai cách giải là cố ý: ba file dùng lẫn `useI18n()` và `useI18n('ns')`
 *      trong cùng một file, nên không suy ra được lời gọi nào thuộc `t` nào bằng regex.
 *
 *   2. **Dòng comment cũng bị quét.** `leadFormConfig.xxx` chỉ xuất hiện trong một câu chú thích
 *      ở landing-canvas/components/SettingsModal.jsx, không phải lời gọi thật. Nay bỏ qua dòng
 *      mở đầu bằng `//`, `*` hoặc `/*`.
 *
 * Nới phép giải khoá KHÔNG làm yếu cổng chặn với chính sự việc 07/09: các khoá bị xoá hôm đó
 * (`affiliate.*`, `phoneRequired.later`, `accountProfileModal.consent*`) nằm ở những file KHÔNG
 * scope hoá, nên chỉ có một cách giải duy nhất. Đã thử đột biến hai chiều để chắc: xoá
 * `affiliate.title` → đỏ; xoá `marketplace.detail.loadError` → cũng đỏ, tức bản sửa này còn
 * MỞ RỘNG vùng phủ chứ không chỉ dọn nhiễu (trước đây xoá khoá đó không ai biết).
 */

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Khoá đang được gọi nhưng chưa có bản dịch. Sửa được khoá nào thì xoá khoá đó khỏi đây —
// nhánh test thứ ba bên dưới sẽ đỏ nếu quên. Rỗng kể từ 10/09/2026: 13 khoá thiếu cả vi/en
// (chatbot.clone/cloneIncludes/cloneNote/cloneSubtitle/emailPlaceholder/recipientEmail,
// common.cloning/loadFailed/syncing, createListing.chatbotLoadError,
// quickSend.retryQuotaBlocked/retrying, aiChatbot.wizardMaxRecipientsReached) đã có bản dịch;
// 13 khoá landingLeads.* vốn chỉ thiếu en.js cũng đã thêm.
const KNOWN_MISSING = {
  vi: [],
  en: [],
};

/** `const t = useI18n('marketplace')` — namespace được thêm vào trước mọi khoá của file đó. */
const SCOPED_NS_RE = /useI18n\(\s*['"]([A-Za-z0-9_]+)['"]\s*\)/g;
const KEY_RE = /\bt\(\s*(['"])([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)\1/g;
const COMMENT_LINE_RE = /^\s*(?:\/\/|\*|\/\*)/;

/**
 * @returns {Map<string, { files: Set<string>, namespaces: Set<string> }>}
 */
function collectCallSites() {
  const sites = new Map();
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!/node_modules|dist/.test(full)) walk(full);
        continue;
      }
      if (!/\.jsx?$/.test(entry.name) || full.includes(`${path.sep}i18n${path.sep}`)) continue;

      const code = fs.readFileSync(full, 'utf8');
      const fileNamespaces = [...code.matchAll(SCOPED_NS_RE)].map((m) => m[1]);
      const relative = path.relative(SRC_DIR, full);

      for (const line of code.split('\n')) {
        if (COMMENT_LINE_RE.test(line)) continue;
        let m;
        KEY_RE.lastIndex = 0;
        while ((m = KEY_RE.exec(line)) !== null) {
          if (!sites.has(m[2])) sites.set(m[2], { files: new Set(), namespaces: new Set() });
          const site = sites.get(m[2]);
          site.files.add(relative);
          fileNamespaces.forEach((ns) => site.namespaces.add(ns));
        }
      }
    }
  })(SRC_DIR);
  return sites;
}

function resolveKey(dict, key) {
  return key.split('.').reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), dict);
}
const isTranslated = (value) => typeof value === 'string' || Array.isArray(value);

/** Hợp lệ nếu giải được ở gốc từ điển, hoặc dưới bất kỳ namespace nào mà file gọi đã scope hoá. */
function isResolvable(dict, key, namespaces) {
  if (isTranslated(resolveKey(dict, key))) return true;
  return [...namespaces].some((ns) => isTranslated(resolveKey(dict, `${ns}.${key}`)));
}

const CALL_SITES = collectCallSites();

describe('i18n — mọi khoá được gọi phải có bản dịch', () => {
  it('quét được lượng điểm gọi hợp lý (đối chứng dương cho chính phép quét)', () => {
    expect(CALL_SITES.size).toBeGreaterThan(3000);
  });

  it('nhận diện được namespace scope hoá (nếu hỏng, cả phép quét thành vô nghĩa)', () => {
    // Không có ca này thì một lỗi làm SCOPED_NS_RE ngừng khớp sẽ chỉ hiện ra dưới dạng
    // "nhiều khoá bỗng vỡ", và người sửa dễ đi thêm bản dịch trùng thay vì sửa phép quét.
    const marketplaceKey = CALL_SITES.get('detail.loadError');
    expect(marketplaceKey?.namespaces.has('marketplace')).toBe(true);
    expect(isResolvable(vi, 'detail.loadError', marketplaceKey.namespaces)).toBe(true);
  });

  it.each([
    ['vi', vi],
    ['en', en],
  ])('%s: không có khoá vỡ nào ngoài danh sách đã biết', (locale, dict) => {
    const allowed = new Set(KNOWN_MISSING[locale]);
    const broken = [];
    for (const [key, site] of CALL_SITES) {
      if (allowed.has(key)) continue;
      if (!isResolvable(dict, key, site.namespaces)) {
        broken.push(`${key}  ← ${[...site.files].join(', ')}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('placeholder phải khớp giữa vi và en trên mọi khoá có ở cả hai ngôn ngữ', () => {
    // Loại lỗi này đi qua được MỌI cổng chặn khác: khoá tồn tại ở cả hai ngôn ngữ nên phép quét
    // trên bảo "có bản dịch", nhưng t() thay tham số theo TÊN — `value.replace(/\{(\w+)\}/g,
    // (_, p) => params[p] ?? `{${p}}`)` (index.jsx) — nên một tên placeholder lệch sẽ in nguyên
    // văn `{tên}` ra giao diện.
    //
    // Bắt được thật ngày 10/09/2026: `adminDeliveryMonitor.kpi.runBreakdown` dùng `{running}` ở
    // en.js trong khi AdminDeliveryMonitorPage.jsx truyền `completed`, nên admin xem tiếng Anh
    // thấy "12 total · 3 failed · {running} running". Bản tiếng Việt vẫn đúng, nên lỗi sống
    // được vì gần như không ai đổi sang tiếng Anh.
    const placeholders = (value) =>
      typeof value === 'string' ? [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',') : null;

    const flatten = (obj, prefix = '', out = new Map()) => {
      for (const [k, v] of Object.entries(obj ?? {})) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
        else out.set(key, v);
      }
      return out;
    };

    const viLeaves = flatten(vi);
    const enLeaves = flatten(en);
    const shared = [...viLeaves.keys()].filter((k) => enLeaves.has(k));
    expect(shared.length).toBeGreaterThan(5000); // đối chứng dương cho chính phép so

    const mismatched = shared
      .map((key) => ({ key, viPh: placeholders(viLeaves.get(key)), enPh: placeholders(enLeaves.get(key)) }))
      .filter(({ viPh, enPh }) => viPh !== null && enPh !== null && viPh !== enPh)
      .map(({ key, viPh, enPh }) => `${key}  vi{${viPh}} ≠ en{${enPh}}`);

    expect(mismatched).toEqual([]);
  });

  it.each([
    ['vi', vi],
    ['en', en],
  ])('%s: danh sách đã biết không chứa khoá đã sửa xong hoặc đã hết người gọi', (locale, dict) => {
    const stale = KNOWN_MISSING[locale].filter((key) => {
      const site = CALL_SITES.get(key);
      return !site || isResolvable(dict, key, site.namespaces);
    });
    expect(stale).toEqual([]);
  });
});

/**
 * ── Hai lỗ của phép quét trên, bịt ngày 21/09/2026 ───────────────────────────────────────────
 *
 * Sếp gửi ảnh chụp giao diện hiện nguyên văn một chuỗi ICU. Đào ra thì phép quét ở trên tuy
 * đúng ý tưởng nhưng có hai chỗ hụt, và cả hai đều để lỗi thật lên tới màn hình khách:
 *
 *   1. **Gom namespace THEO KHOÁ, không theo FILE.** `CALL_SITES` khoá theo chuỗi khoá và trộn
 *      namespace của mọi file dùng chung khoá đó. `createListing.createSuccess` được gọi ở hai
 *      file: một file `useI18n('marketplace')` (đúng) và MarketplaceListingModal.jsx dùng `t`
 *      gốc (thiếu tiền tố). Namespace `marketplace` của file đúng che cho file sai, nên toast
 *      hiện ra chữ "createListing.createSuccess".
 *
 *   2. **Chấp nhận giải ở GỐC cho cả file chỉ dùng `useI18n('ns')`.** `common.view` có ở gốc từ
 *      điển nên `isResolvable` cho qua, nhưng MarketplaceContent.jsx dùng
 *      `useI18n('marketplace')` — lúc chạy LUÔN thêm tiền tố và không bao giờ tra gốc, nên nút
 *      hiện chữ "common.view". Gốc chỉ được phép dùng khi file CÓ một `useI18n()` trần.
 *
 * Đã đo sau khi vá 6 chỗ: 6.535 điểm gọi, 0 vỡ. Thử đột biến hai chiều: xoá
 * `marketplace.common.view` → đỏ 2 ca; trả khoá về dạng thiếu tiền tố → đỏ 1 ca.
 */
const BARE_USE_I18N_RE = /useI18n\(\s*\)/;

/** @returns {Array<{ file: string, line: number, key: string, namespaces: string[], allowRoot: boolean }>} */
function collectStrictSites() {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!/node_modules|dist/.test(full)) walk(full);
        continue;
      }
      if (!/\.jsx?$/.test(entry.name) || full.includes(`${path.sep}i18n${path.sep}`)) continue;

      const code = fs.readFileSync(full, 'utf8');
      const namespaces = [...new Set([...code.matchAll(SCOPED_NS_RE)].map((m) => m[1]))];
      // Không scope hoá gì thì mọi `t` là bản gốc; có `useI18n()` trần thì file dùng lẫn cả hai.
      const allowRoot = namespaces.length === 0 || BARE_USE_I18N_RE.test(code);
      const relative = path.relative(SRC_DIR, full);

      code.split('\n').forEach((line, idx) => {
        if (COMMENT_LINE_RE.test(line)) return;
        let m;
        KEY_RE.lastIndex = 0;
        while ((m = KEY_RE.exec(line)) !== null) {
          out.push({ file: relative, line: idx + 1, key: m[2], namespaces, allowRoot });
        }
      });
    }
  })(SRC_DIR);
  return out;
}

const STRICT_SITES = collectStrictSites();

describe('i18n — phép quét chặt: khoá phải giải được ĐÚNG cách file đó gọi', () => {
  it('quét được lượng điểm gọi hợp lý (đối chứng dương)', () => {
    expect(STRICT_SITES.length).toBeGreaterThan(5000);
  });

  it('phân biệt được file chỉ scope hoá với file dùng `t` gốc (nếu hỏng, cả phép quét vô nghĩa)', () => {
    const scopedOnly = STRICT_SITES.find((s) => s.file.includes('MarketplaceContent'));
    expect(scopedOnly?.namespaces).toContain('marketplace');
    expect(scopedOnly?.allowRoot).toBe(false);
  });

  it.each([
    ['vi', vi],
    ['en', en],
  ])('%s: không khoá nào chỉ giải được bằng đường mà runtime KHÔNG đi', (locale, dict) => {
    const broken = STRICT_SITES.filter((s) => {
      const viaRoot = s.allowRoot && isTranslated(resolveKey(dict, s.key));
      const viaNs = s.namespaces.some((ns) => isTranslated(resolveKey(dict, `${ns}.${s.key}`)));
      return !viaRoot && !viaNs;
    }).map((s) => `${s.file}:${s.line}  ${s.key}  ns=[${s.namespaces.join(',')}] goc=${s.allowRoot}`);

    expect(broken).toEqual([]);
  });
});

describe('i18n — không được dùng cú pháp ICU', () => {
  // Bộ dịch ở index.jsx chỉ chạy `value.replace(/\{(\w+)\}/g, ...)`. Mọi cấu trúc ICU
  // (`{x, select, ...}`, `{x, plural, ...}`) sẽ KHÔNG được xử lý và lọt nguyên văn ra màn hình —
  // đúng thứ sếp chụp được ngày 21/09 ở nhãn "Chạy liên tục".
  //
  // Ca này đọc GIÁ TRỊ trong từ điển, không grep file nguồn: grep sẽ khớp cả dòng chú thích
  // (chính chú thích giải thích lỗi này cũng chứa mẫu ICU).
  const ICU_RE = /\{\s*\w+\s*,\s*(select|plural|selectordinal)\s*,/;

  const leaves = (obj, prefix = '', out = []) => {
    for (const [k, v] of Object.entries(obj ?? {})) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) leaves(v, key, out);
      else if (typeof v === 'string') out.push([key, v]);
    }
    return out;
  };

  it.each([
    ['vi', vi],
    ['en', en],
  ])('%s: không chuỗi dịch nào chứa select/plural', (locale, dict) => {
    const offenders = leaves(dict)
      .filter(([, value]) => ICU_RE.test(value))
      .map(([key, value]) => `${key}  "${value.slice(0, 80)}"`);

    expect(offenders).toEqual([]);
  });
});
