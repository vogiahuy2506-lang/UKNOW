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
