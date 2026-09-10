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
 * từ điển. KNOWN_MISSING là hiện trạng đo được lúc viết test — danh sách chỉ được phép ngắn đi.
 * Thêm một khoá gọi mà quên khai báo, hoặc xoá một khoá đang có người gọi, đều đỏ ngay.
 */

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Khoá đang được gọi nhưng chưa có bản dịch, tính đến 10/09/2026. Phần lớn thuộc Marketplace —
// tính năng lên route thật nhưng chưa ai dịch. Sửa được khoá nào thì xoá khoá đó khỏi đây.
const KNOWN_MISSING = {
  vi: [
  'accountProfileModal.addonsRemaining',
  'accountProfileModal.addonsRolloverNote',
  'aiChatbot.wizardMaxRecipientsReached',
  'browse.clearSearch',
  'browse.close',
  'browse.headerSubtitle',
  'browse.headerTitle',
  'browse.postListing',
  'browse.priceCreditsShort',
  'browse.priceFree',
  'browse.searchPlaceholder',
  'browse.sortNewest',
  'browse.sortPopular',
  'browse.sortPriceAsc',
  'browse.sortPriceDesc',
  'browse.sortRating',
  'browse.tabBrowse',
  'browse.tabMine',
  'browse.viewGrid',
  'browse.viewList',
  'chatbot.clone',
  'chatbot.cloneIncludes',
  'chatbot.cloneIncludesList',
  'chatbot.cloneLimitReached',
  'chatbot.cloneNote',
  'chatbot.cloneSubtitle',
  'chatbot.emailPlaceholder',
  'chatbot.recipientEmail',
  'common.cloning',
  'common.loadError',
  'common.loadFailed',
  'common.logout',
  'common.syncing',
  'createListing.chatbotLoadError',
  'createListing.createError',
  'createListing.createSuccess',
  'createListing.invalidForm',
  'createListing.loadError',
  'detail.campaignLimitExceeded',
  'detail.copyLinkError',
  'detail.copyLinkSuccess',
  'detail.favoriteAddSuccess',
  'detail.favoriteError',
  'detail.favoriteRemoveSuccess',
  'detail.loadError',
  'detail.purchaseError',
  'detail.purchaseSuccess',
  'favorites.emptyDesc',
  'favorites.emptyTitle',
  'favorites.free',
  'favorites.loadError',
  'favorites.removeError',
  'favorites.removeSuccess',
  'favorites.removeTitle',
  'favorites.subtitle',
  'favorites.title',
  'leadFormConfig.xxx',
  'myListings.deleteError',
  'myListings.deleteSuccess',
  'myListings.loadError',
  'myListings.pauseError',
  'myListings.pauseSuccess',
  'myListings.publishError',
  'myListings.publishSuccess',
  'pricing.actionBlocked',
  'purchases.emptyDesc',
  'purchases.emptyTitle',
  'purchases.loadError',
  'purchases.subtitle',
  'purchases.title',
  'quickSend.failedRecipientCount',
  'quickSend.retryFailed',
  'quickSend.retryQuotaBlocked',
  'quickSend.retrySuccess',
  'quickSend.retrying',
  ],
  en: [
  'accountProfileModal.addonsRemaining',
  'accountProfileModal.addonsRolloverNote',
  'aiChatbot.wizardMaxRecipientsReached',
  'browse.clearSearch',
  'browse.close',
  'browse.headerSubtitle',
  'browse.headerTitle',
  'browse.postListing',
  'browse.priceCreditsShort',
  'browse.priceFree',
  'browse.searchPlaceholder',
  'browse.sortNewest',
  'browse.sortPopular',
  'browse.sortPriceAsc',
  'browse.sortPriceDesc',
  'browse.sortRating',
  'browse.tabBrowse',
  'browse.tabMine',
  'browse.viewGrid',
  'browse.viewList',
  'chatbot.clone',
  'chatbot.cloneIncludes',
  'chatbot.cloneIncludesList',
  'chatbot.cloneLimitReached',
  'chatbot.cloneNote',
  'chatbot.cloneSubtitle',
  'chatbot.emailPlaceholder',
  'chatbot.recipientEmail',
  'common.cloning',
  'common.loadError',
  'common.loadFailed',
  'common.logout',
  'common.syncing',
  'createListing.chatbotLoadError',
  'createListing.createError',
  'createListing.createSuccess',
  'createListing.invalidForm',
  'createListing.loadError',
  'detail.campaignLimitExceeded',
  'detail.copyLinkError',
  'detail.copyLinkSuccess',
  'detail.favoriteAddSuccess',
  'detail.favoriteError',
  'detail.favoriteRemoveSuccess',
  'detail.loadError',
  'detail.purchaseError',
  'detail.purchaseSuccess',
  'favorites.emptyDesc',
  'favorites.emptyTitle',
  'favorites.free',
  'favorites.loadError',
  'favorites.removeError',
  'favorites.removeSuccess',
  'favorites.removeTitle',
  'favorites.subtitle',
  'favorites.title',
  'landingLeads.clearSearch',
  'landingLeads.clearThis',
  'landingLeads.closeFilter',
  'landingLeads.loadingCustomFields',
  'landingLeads.loadingOptions',
  'landingLeads.noMatchInPage',
  'landingLeads.noOptionsMatch',
  'landingLeads.preset30Days',
  'landingLeads.preset7Days',
  'landingLeads.presetToday',
  'landingLeads.quickSearchPlaceholder',
  'landingLeads.searchOptionPlaceholder',
  'landingLeads.showingOf',
  'leadFormConfig.xxx',
  'myListings.deleteError',
  'myListings.deleteSuccess',
  'myListings.loadError',
  'myListings.pauseError',
  'myListings.pauseSuccess',
  'myListings.publishError',
  'myListings.publishSuccess',
  'pricing.actionBlocked',
  'purchases.emptyDesc',
  'purchases.emptyTitle',
  'purchases.loadError',
  'purchases.subtitle',
  'purchases.title',
  'quickSend.failedRecipientCount',
  'quickSend.retryFailed',
  'quickSend.retryQuotaBlocked',
  'quickSend.retrySuccess',
  'quickSend.retrying',
  ],
};

function collectCallSites() {
  const sites = new Map();
  const re = /\bt\(\s*(['"])([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)\1/g;
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!/node_modules|dist/.test(full)) walk(full);
      } else if (/\.jsx?$/.test(entry.name) && !full.includes(`${path.sep}i18n${path.sep}`)) {
        const code = fs.readFileSync(full, 'utf8');
        let m;
        while ((m = re.exec(code)) !== null) {
          if (!sites.has(m[2])) sites.set(m[2], new Set());
          sites.get(m[2]).add(path.relative(SRC_DIR, full));
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

const CALL_SITES = collectCallSites();

describe('i18n — mọi khoá được gọi phải có bản dịch', () => {
  it('quét được lượng điểm gọi hợp lý (đối chứng dương cho chính phép quét)', () => {
    expect(CALL_SITES.size).toBeGreaterThan(3000);
  });

  it.each([
    ['vi', vi],
    ['en', en],
  ])('%s: không có khoá vỡ nào ngoài danh sách đã biết', (locale, dict) => {
    const allowed = new Set(KNOWN_MISSING[locale]);
    const broken = [];
    for (const [key, files] of CALL_SITES) {
      if (allowed.has(key)) continue;
      if (!isTranslated(resolveKey(dict, key))) broken.push(`${key}  ← ${[...files].join(', ')}`);
    }
    expect(broken).toEqual([]);
  });

  it.each([
    ['vi', vi],
    ['en', en],
  ])('%s: danh sách đã biết không chứa khoá đã sửa xong hoặc đã hết người gọi', (locale, dict) => {
    const stale = KNOWN_MISSING[locale].filter(
      (key) => !CALL_SITES.has(key) || isTranslated(resolveKey(dict, key)),
    );
    expect(stale).toEqual([]);
  });
});
