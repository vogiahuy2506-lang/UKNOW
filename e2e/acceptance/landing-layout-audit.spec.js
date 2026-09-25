/**
 * Kịch bản B — Landing tự kiểm hiển thị (N1–N5, N7).
 * Nguồn: _internal/PLAN_LANDING_TU_KIEM_HIEN_THI_TU_SUA_2026-09-20.md §13 "Kịch bản nghiệm thu production".
 * Lệnh sửa: _internal/LENH_GIAO_SUA_NGHIEM_THU_PLAYWRIGHT_2026-09-24.md mục A1, A7, A8, A9, A10, B3, B4.
 *
 * Chạy tuần tự (serial) theo thứ tự rẻ → đắt:
 * N7 (dán trang lỗi) → N3 (than phiền trong phiên đó) → N5 (Hoàn tác về bản đã dán)
 * → N7-sạch → N1 & N2 (HD45 + credit) → N4 (trang đơn giản).
 * N7 hỏng thì dừng ngay toàn bộ kịch bản, không đốt credit.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  captureScreenshot,
  recordReport,
  createAuthenticatedContext,
  dismissPhoneReminder,
} from './acceptance-helper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures/layout-audit');
const MODULE_FILE = path.resolve(__dirname, '../../frontend/src/features/ai/utils/layoutAudit.js');

const I18N = {
  layoutChecking: 'Đang kiểm tra hiển thị…', // vi.js:6904
  layoutOk: 'Đã kiểm tra hiển thị ✓', // vi.js:6905
  relayoutSection: 'Trình bày lại phần này · dùng 1 lượt AI', // vi.js:6909
  undo: 'Hoàn tác', // vi.js:6912
  undone: 'Đã quay lại bản trước', // vi.js:6913
  layoutAutoFixedPrefix: 'Đã chỉnh hiển thị:', // vi.js:4307
  layoutAutoFixedPlain: 'Mình đã chỉnh lại phần hiển thị của trang để chữ không bị che hay cắt.', // vi.js:4308
};

/**
 * Chạy runLayoutAudit trên một đoạn HTML bằng Chromium engine độc lập
 */
async function auditHtml(context, htmlSource, options = {}) {
  const auditPage = await context.newPage();
  try {
    const ORIGIN = 'http://acceptance-audit.local';
    const moduleCode = fs.readFileSync(MODULE_FILE, 'utf8');

    await auditPage.route(`${ORIGIN}/**`, (route) => {
      const { pathname } = new URL(route.request().url());
      if (pathname === '/layoutAudit.js') {
        return route.fulfill({ contentType: 'text/javascript', body: moduleCode });
      }
      if (pathname === '/host.html') {
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' });
      }
      return route.abort();
    });

    await auditPage.goto(`${ORIGIN}/host.html`);

    const result = await auditPage.evaluate(
      async ({ html, opts }) => {
        const { runLayoutAudit } = await import('/layoutAudit.js');
        return await runLayoutAudit(html, opts);
      },
      { html: htmlSource, opts: options }
    );
    return result;
  } finally {
    await auditPage.close();
  }
}

/**
 * Đọc số credit AI đã dùng từ GET /api/users/profile bằng Authenticated Request
 */
async function getAiCreditsUsed(authRequest, baseURL) {
  const res = await authRequest.get(`${baseURL}/api/users/profile`);
  if (!res.ok()) {
    throw new Error(`Không đọc được profile để lấy số credit AI: HTTP ${res.status()}`);
  }
  const body = await res.json();
  const used = Number(body?.data?.aiCreditsUsed ?? 0);
  const limit = body?.data?.aiCreditsPerPeriod ?? null;
  return { used, limit };
}

/**
 * Ghi lại MỌI nội dung dải kiểm hiển thị (`data-testid="landing-layout-strip"`) từng xuất hiện kể từ lúc
 * gọi. ✓ chỉ hiện 4 giây rồi tự ẩn (LandingPageCard.jsx, okStripHidden) — đọc một lần, hay chờ SAU một bước
 * chậm, sẽ bắt hụt. Đã hụt thật ở N1 production 25/09: chat tự tạo trang, trang sạch, "Đang kiểm tra…" →
 * ✓ trong 0,6 giây rồi ẩn sau 4 giây — tất cả xảy ra trong lúc kịch bản còn chờ bảng hỏi 10 giây, nên báo
 * "Không thấy ✓" dù sản phẩm đúng. Gọi SAU khi tải trang (tải lại trang là mất bộ ghi).
 */
async function startLayoutStripRecorder(page) {
  await page.evaluate(() => {
    window.__layoutStripSeen = [];
    const record = () => {
      document.querySelectorAll('[data-testid="landing-layout-strip"]').forEach((el) => {
        const text = el.innerText.trim().replace(/\s+/g, ' ');
        if (text && !window.__layoutStripSeen.includes(text)) window.__layoutStripSeen.push(text);
      });
    };
    record();
    window.__layoutStripObserver?.disconnect();
    window.__layoutStripObserver = new MutationObserver(record);
    window.__layoutStripObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  return {
    seen: () => page.evaluate(() => window.__layoutStripSeen || []).catch(() => []),
    /** true nếu ĐÃ TỪNG thấy một dải chứa `text` (kể cả khi nay đã ẩn), chờ tối đa `timeout` ms. */
    waitFor: (text, timeout) => page.waitForFunction(
      (t) => (window.__layoutStripSeen || []).some((s) => s.includes(t)),
      text,
      { timeout },
    ).then(() => true).catch(() => false),
  };
}

/**
 * Trợ lý gọi startNewChat() khi danh sách phiên tải xong (AiChatbot.jsx, effect `isOpen`). Gửi tin TRƯỚC
 * lúc đó thì khung chat bị xoá trắng — thấy khi chẩn đoán 25/09. Đăng ký TRƯỚC `goto`, chờ SAU `goto`.
 */
function waitForSessionList(page) {
  return page.waitForResponse(
    (res) => /\/api\/ai\/sessions(\?|$)/.test(res.url()) && res.request().method() === 'GET',
    { timeout: 30_000 },
  ).catch(() => null);
}

/**
 * Trợ lý thường hiện bảng hỏi "Thiết kế Landing Page" (ask_landing_details) TRƯỚC khi tạo trang. Chọn
 * lựa chọn đầu tiên của mỗi nhóm rồi bấm tạo — khuôn này đã chạy đúng trên production (N4, 25/09).
 * @param {import('@playwright/test').Page} page
 * @param {{ beforeGenerate?: () => Promise<void> }} [opts] chạy NGAY TRƯỚC khi bấm tạo (vd đọc mốc credit)
 * @returns {Promise<{ shown: boolean, sessionId: any, messageId: any }>}
 */
async function answerLandingWizardIfShown(page, { beforeGenerate } = {}) {
  const wizardCard = page.locator('.bg-gradient-to-br').filter({ hasText: /Thiết kế Landing Page|Design Landing Page/i }).last();
  const shown = await wizardCard.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false);
  if (!shown) return { shown: false, sessionId: null, messageId: null };

  console.log('[Kịch bản B] Bot hiển thị wizard hỏi thông tin, tự động chọn các lựa chọn...');
  const optionGroups = wizardCard.locator('.flex.flex-wrap.gap-2');
  const groupCount = await optionGroups.count();
  for (let i = 0; i < groupCount; i++) {
    const firstOptBtn = optionGroups.nth(i).locator('button').first();
    if (await firstOptBtn.isVisible().catch(() => false)) {
      await firstOptBtn.click();
      await page.waitForTimeout(300);
    }
  }

  const submitLandingBtn = wizardCard.locator('button.w-full');
  await expect(submitLandingBtn).toBeVisible({ timeout: 5000 });
  await expect(submitLandingBtn).toBeEnabled({ timeout: 5000 });
  if (beforeGenerate) await beforeGenerate();

  const generateHtmlPromise = page.waitForResponse(
    (res) => res.url().includes('/api/ai/generate-landing-html') && res.request().method() === 'POST',
    { timeout: 120_000 }
  ).catch(() => null);
  console.log('[Kịch bản B] Bấm nút "Tạo landing page theo lựa chọn này"...');
  await submitLandingBtn.click();

  let sessionId = null;
  let messageId = null;
  const htmlRes = await generateHtmlPromise;
  if (htmlRes && htmlRes.ok()) {
    const body = await htmlRes.json().catch(() => null);
    sessionId = body?.data?.sessionId ?? null;
    messageId = body?.data?.messageId ?? null;
  }
  return { shown: true, sessionId, messageId };
}

// Chạy nối tiếp (serial) — nếu N7 hỏng thì dừng ngay các bài sau để không đốt credit
test.describe.configure({ mode: 'serial' });

test.describe('Kịch bản B — Landing tự kiểm hiển thị', () => {
  let sharedPage;
  let sharedAuthRequest;
  let sharedSessionId = null;
  let sharedMessageId = null;
  let originalPastedHtml = null;
  let pastedSrcDoc = null;

  test.beforeAll(async ({ browser, playwright, baseURL }) => {
    sharedAuthRequest = await createAuthenticatedContext(playwright, baseURL);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'vi-VN',
      timezoneId: 'Asia/Ho_Chi_Minh',
    });
    sharedPage = await context.newPage();
    await dismissPhoneReminder(sharedPage);
  });

  test.afterAll(async () => {
    if (sharedPage) await sharedPage.context().close();
    if (sharedAuthRequest) await sharedAuthRequest.dispose();
  });

  // ── Chuỗi 1: N7 (dán) → N3 (than phiền) → N5 (Hoàn tác về bản dán) ───────

  test('B_N7: Dán timeline-de-chu.html → thẻ hiện lỗi che chữ + nút Trình bày lại, KHÔNG tự sửa', async ({ baseURL }) => {
    console.log('[Kịch bản B] Bước N7: Dán HTML có lỗi đè chữ...');
    originalPastedHtml = fs.readFileSync(path.join(FIXTURES_DIR, 'timeline-de-chu.html'), 'utf8');

    await sharedPage.goto('/app');
    await sharedPage.waitForLoadState('domcontentloaded');

    const initialIframeCount = await sharedPage.locator('iframe[title="Landing Page Preview"]').count();

    const chatInput = sharedPage.locator('textarea').first();
    await expect(chatInput).toBeVisible({ timeout: 15_000 });

    // Đón response POST /api/ai/landing-from-html để lấy sessionId và messageId (mục B3)
    const landingResponsePromise = sharedPage.waitForResponse(
      (res) =>
        res.url().includes('/api/ai/landing-from-html') &&
        res.request().method() === 'POST' &&
        res.status() === 200,
      { timeout: 25_000 }
    ).catch(() => null);

    await chatInput.fill(originalPastedHtml);
    await chatInput.press('Enter');

    const landingResponse = await landingResponsePromise;
    expect(landingResponse).not.toBeNull();
    if (landingResponse) {
      try {
        const body = await landingResponse.json();
        sharedSessionId = body?.data?.sessionId;
        sharedMessageId = body?.data?.message?.id;
        console.log(`[Kịch bản B] Đã nhận landing từ HTML: sessionId=${sharedSessionId}, messageId=${sharedMessageId}`);
      } catch {
        // Bỏ qua
      }
    }

    // Chờ số iframe Landing Page Preview tăng lên (A2: bỏ hoàn toàn text=Landing Page)
    await expect(sharedPage.locator('iframe[title="Landing Page Preview"]')).toHaveCount(initialIframeCount + 1, { timeout: 30_000 });
    const landingCard = sharedPage.locator('iframe[title="Landing Page Preview"]').last();

    // Chụp lại srcdoc ngay sau N7 để dùng cho N5 so sánh (B1)
    pastedSrcDoc = await landingCard.getAttribute('srcdoc');

    // Kiểm tra dải trạng thái và nút Trình bày lại. Bộ đo chạy NỀN sau khi thẻ hiện (vài giây, tải
    // Tailwind trong iframe ẩn) — production 25/09 chấm ngay lúc thẻ vừa hiện nên chỉ thấy "Đang kiểm
    // tra…" và báo nhầm "không chạy kiểm". isVisible() không chờ; phải CHỜ kết quả.
    const landingStrip = sharedPage.locator('[data-testid="landing-layout-strip"]').first();
    const hasLandingStrip = await landingStrip.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
    const relayoutBtn = sharedPage.getByRole('button', { name: I18N.relayoutSection });
    const hasRelayoutBtn = await relayoutBtn.waitFor({ state: 'visible', timeout: 30_000 }).then(() => true).catch(() => false);

    // Kiểm tra KHÔNG có tin nhắn tự sửa ở cả 2 dạng: layoutAutoFixed và layoutAutoFixedPlain
    const autoFixMsg1 = sharedPage.locator(`text=${I18N.layoutAutoFixedPrefix}`);
    const autoFixMsg2 = sharedPage.locator(`text=${I18N.layoutAutoFixedPlain}`);
    const hasAutoFix1 = await autoFixMsg1.isVisible({ timeout: 1000 }).catch(() => false);
    const hasAutoFix2 = await autoFixMsg2.isVisible({ timeout: 1000 }).catch(() => false);
    const hasAnyAutoFix = hasAutoFix1 || hasAutoFix2;

    await captureScreenshot(sharedPage, 'B_N7_timeline_de_chu.png', 'Thẻ hiển thị sau khi dán timeline-de-chu.html');

    // Đường dán chạy kiểm hiển thị từ 3d2baa70. Không đạt thì nói rõ đứt ở khâu nào.
    const pass = hasLandingStrip && hasRelayoutBtn && !hasAnyAutoFix;
    recordReport({
      kichBan: 'B',
      buoc: 'N7_pasted_broken_html',
      ketQua: pass ? 'dat' : 'khong_dat',
      lyDo: pass
        ? undefined
        : hasAnyAutoFix
          ? 'Trang dán bị tự sửa miễn phí (không đúng thiết kế chống lợi dụng)'
          : !hasLandingStrip
            ? 'Không hiện dải kiểm hiển thị trên trang dán'
            : 'Có dải kiểm nhưng sau 30 giây không hiện nút "Trình bày lại" cho trang lỗi',
      ids: {
        sessionId: sharedSessionId,
        messageId: sharedMessageId,
      },
      extra: {
        landingCardVisible: true,
        landingStripVisible: hasLandingStrip,
        relayoutButtonVisible: hasRelayoutBtn,
        autoFixTriggered: hasAnyAutoFix,
      },
    });

    expect(hasAnyAutoFix).toBe(false);
  });

  test('B_N3: Than phiền "chỗ này bị đè, sửa giúp tôi" trong chính phiên đó → không lộ từ kỹ thuật', async ({ baseURL }) => {
    console.log('[Kịch bản B] Bước N3: Than phiền bằng lời trong chính phiên N7...');
    expect(sharedSessionId).toBeTruthy();

    const chatInput = sharedPage.locator('textarea').first();
    await expect(chatInput).toBeVisible({ timeout: 15_000 });

    // Đón response sửa HTML
    const editResponsePromise = sharedPage.waitForResponse(
      (res) =>
        res.url().includes('/api/ai/edit-landing-html') &&
        res.request().method() === 'POST' &&
        res.status() === 200,
      { timeout: 35_000 }
    ).catch(() => null);

    await chatInput.fill('chỗ này bị đè, sửa giúp tôi');
    await chatInput.press('Enter');

    const editResponse = await editResponsePromise;
    expect(editResponse).not.toBeNull();
    expect(editResponse.ok()).toBe(true);
    await sharedPage.waitForTimeout(3000); // Chờ UI cập nhật thẻ

    // Quét nội dung tin nhắn của phiên qua GET /api/ai/sessions/:id/messages (A7)
    console.log(`[Kịch bản B] Đọc danh sách tin nhắn của sessionId=${sharedSessionId} qua API backend...`);
    const messagesRes = await sharedAuthRequest.get(`${baseURL}/api/ai/sessions/${sharedSessionId}/messages`);
    expect(messagesRes.ok()).toBe(true);

    const messagesBody = await messagesRes.json();
    const messagesList = Array.isArray(messagesBody?.data) ? messagesBody.data : [];
    console.log(`[Kịch bản B] Số tin nhắn đã quét: ${messagesList.length}`);

    // Bắt buộc khẳng định số tin đã quét ≥ 2 (A7)
    expect(messagesList.length).toBeGreaterThanOrEqual(2);

    // 4 Regex kiểm tra từ kỹ thuật theo đúng mục A7
    const technicalRegexes = [
      { name: 'class=', regex: /class\s*=/i },
      { name: 'px', regex: /\d+\s*px\b/i },
      { name: 'nth-of-type', regex: /nth-of-type/i },
      { name: 'css selector', regex: /[.#][a-z][\w-]*\s*\{/i },
    ];

    const violations = [];
    for (const msg of messagesList) {
      // Chỉ quét phần text content của tin user và assistant, không quét HTML của thẻ
      if (msg.role === 'user' || msg.role === 'assistant') {
        const textContent = String(msg.content || '');
        for (const { name, regex } of technicalRegexes) {
          if (regex.test(textContent)) {
            violations.push({ messageId: msg.id, role: msg.role, pattern: name, snippet: textContent.slice(0, 100) });
          }
        }
      }
    }

    await captureScreenshot(sharedPage, 'B_N3_chat_history.png', 'Lịch sử chat sau khi sửa không có từ ngữ kỹ thuật');

    const pass = violations.length === 0;
    recordReport({
      kichBan: 'B',
      buoc: 'N3_clean_human_language',
      ketQua: pass ? 'dat' : 'khong_dat',
      lyDo: pass ? undefined : `Phát hiện từ ngữ kỹ thuật trong tin nhắn: ${JSON.stringify(violations)}`,
      ids: { sessionId: sharedSessionId },
      extra: {
        scannedMessagesCount: messagesList.length,
        violations,
      },
    });

    expect(violations).toEqual([]);
  });

  test('B_N5: Sau lượt sửa N3, bấm Hoàn tác → toast "Đã quay lại bản trước", HTML về đúng bản trước khi sửa', async () => {
    console.log('[Kịch bản B] Bước N5: Kiểm tra nút Hoàn tác trong chính phiên N7 sau sửa...');

    // Lấy HTML bản sau khi sửa (trước khi hoàn tác)
    const previewIframe = sharedPage.locator('iframe[title="Landing Page Preview"]').first();
    await expect(previewIframe).toBeVisible({ timeout: 15_000 });
    const htmlBeforeUndo = await previewIframe.getAttribute('srcdoc');

    // Nút Hoàn tác phải hiển thị
    const undoBtn = sharedPage.getByRole('button', { name: I18N.undo });
    await expect(undoBtn).toBeVisible({ timeout: 15_000 });

    await undoBtn.click();

    // Verify toast "Đã quay lại bản trước" xuất hiện
    const toast = sharedPage.locator(`text=${I18N.undone}`).first();
    await expect(toast).toBeVisible({ timeout: 10_000 });

    await sharedPage.waitForTimeout(1000);
    const htmlAfterUndo = await previewIframe.getAttribute('srcdoc');

    // Kiểm tra: HTML sau Hoàn tác khác bản đã sửa VÀ quay về bản ban đầu (B1: so với srcdoc ngay sau N7)
    expect(htmlAfterUndo).not.toEqual(htmlBeforeUndo);

    const normalize = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const isRevertedToInitial = normalize(htmlAfterUndo) === normalize(pastedSrcDoc);

    await captureScreenshot(sharedPage, 'B_N5_undone.png', 'Đã bấm Hoàn tác và HTML quay lại bản ban đầu');

    recordReport({
      kichBan: 'B',
      buoc: 'N5_revert_undo',
      ketQua: isRevertedToInitial ? 'dat' : 'khong_dat',
      ids: { sessionId: sharedSessionId },
      extra: {
        toastSeen: true,
        htmlRevertedToInitial: isRevertedToInitial,
      },
    });

    expect(isRevertedToInitial).toBe(true);
  });

  // ── Phần 2: N7-sạch ────────────────────────────────────────────────────────

  test('B_N7_sach: Dán sach.html → chỉ hiện layoutOk, không có layoutAutoFixed hay layoutAutoFixedPlain', async () => {
    console.log('[Kịch bản B] Bước N7-sạch: Dán HTML sach.html...');
    const htmlContent = fs.readFileSync(path.join(FIXTURES_DIR, 'sach.html'), 'utf8');

    // Mở /app tạo phiên mới
    const sessionListLoaded = waitForSessionList(sharedPage);
    await sharedPage.goto('/app');
    await sharedPage.waitForLoadState('domcontentloaded');
    await sessionListLoaded;

    const initialIframeCount = await sharedPage.locator('iframe[title="Landing Page Preview"]').count();

    const chatInput = sharedPage.locator('textarea').first();
    await expect(chatInput).toBeVisible({ timeout: 15_000 });

    const pastePromise = sharedPage.waitForResponse(
      (res) =>
        res.url().includes('/api/ai/landing-from-html') &&
        res.request().method() === 'POST' &&
        res.status() === 200,
      { timeout: 25_000 }
    ).catch(() => null);

    await chatInput.fill(htmlContent);
    await chatInput.press('Enter');

    const pasteRes = await pastePromise;
    expect(pasteRes).not.toBeNull();
    let sachSessionId = null;
    let sachMessageId = null;
    if (pasteRes) {
      try {
        const body = await pasteRes.json();
        sachSessionId = body?.data?.sessionId;
        sachMessageId = body?.data?.message?.id;
      } catch {
        // Bỏ qua
      }
    }

    // Chờ số iframe Landing Page Preview tăng lên (A2: bỏ hoàn toàn text=Landing Page)
    await expect(sharedPage.locator('iframe[title="Landing Page Preview"]')).toHaveCount(initialIframeCount + 1, { timeout: 30_000 });

    // Đo dải trạng thái layoutOk (không gán cứng, A1). CHỜ tới 30 giây: bộ đo chạy nền sau khi thẻ
    // hiện; ✓ tự ẩn sau 4 giây nên phải bắt trong lúc chờ (xem ghi chú ở N7).
    const layoutOkBadge = sharedPage.locator(`text=${I18N.layoutOk}`).first();
    const hasLayoutOk = await layoutOkBadge.waitFor({ state: 'visible', timeout: 30_000 }).then(() => true).catch(() => false);
    const sachStillBroken = await sharedPage.getByRole('button', { name: I18N.relayoutSection })
      .isVisible().catch(() => false);

    // Không có tin nhắn layoutAutoFixed hay layoutAutoFixedPlain
    const hasFix1 = await sharedPage.locator(`text=${I18N.layoutAutoFixedPrefix}`).isVisible({ timeout: 1000 }).catch(() => false);
    const hasFix2 = await sharedPage.locator(`text=${I18N.layoutAutoFixedPlain}`).isVisible({ timeout: 1000 }).catch(() => false);
    const hasAnyFix = hasFix1 || hasFix2;

    await captureScreenshot(sharedPage, 'B_N7_sach.png', 'Trang sạch: thẻ hiển thị đầy đủ, không có tin tự sửa');

    const pass = hasLayoutOk && !hasAnyFix;
    recordReport({
      kichBan: 'B',
      buoc: 'N7_pasted_clean_html',
      ketQua: pass ? 'dat' : 'khong_dat',
      lyDo: pass
        ? undefined
        : hasAnyFix
          ? 'Trang sạch mà vẫn có tin tự sửa'
          : sachStillBroken
            ? 'Bộ đo báo trang sạch có lỗi (hiện nút Trình bày lại)'
            : 'Sau 30 giây không thấy ✓ trên trang dán sạch',
      ids: {
        sessionId: sachSessionId,
        messageId: sachMessageId,
      },
      extra: { layoutOk: hasLayoutOk, relayoutButtonVisible: sachStillBroken, autoFixTriggered: hasAnyFix },
    });

    expect(hasAnyFix).toBe(false);
  });

  // ── Phần 3: N1 & N2 (tốn 1 credit) ────────────────────────────────────────

  test('B_N1_N2: Gắn file HD45 sinh infographic, đo 0 finding ở 1280 & 390, credit chỉ trừ 1', async ({ context, baseURL }) => {
    console.log('[Kịch bản B] Bước N1 & N2: Sinh trang từ file HD45 và đo credit...');
    const hd45Path = process.env.ACCEPTANCE_HD45_FILE;

    if (!hd45Path || !fs.existsSync(hd45Path)) {
      console.warn(`[Kịch bản B] SKIPPED N1/N2: thiếu file HD45 qua biến ACCEPTANCE_HD45_FILE (${hd45Path || 'chưa đặt'})`);
      recordReport({
        kichBan: 'B',
        buoc: 'N1_N2_hd45_generate_and_credit',
        ketQua: 'skipped',
        lyDo: 'thiếu file HD45 (biến ACCEPTANCE_HD45_FILE chưa được cung cấp hoặc file không tồn tại)',
      });
      test.skip(true, 'Thiếu file HD45');
      return;
    }

    test.setTimeout(300_000);

    // Mốc credit đầu bước (chỉ để ghi lại) — mốc dùng để CHẤM là ngay trước lượt tạo trang, xem dưới.
    const creditBefore = await getAiCreditsUsed(sharedAuthRequest, baseURL);
    console.log(`[Kịch bản B] Credit trước N1: used=${creditBefore.used}, limit=${creditBefore.limit}`);

    const sessionListLoaded = waitForSessionList(sharedPage);
    await sharedPage.goto('/app');
    await sharedPage.waitForLoadState('domcontentloaded');
    await sessionListLoaded;
    const iframeLocator = sharedPage.locator('iframe[title="Landing Page Preview"]');
    const initialIframeCount = await iframeLocator.count();
    const strip = await startLayoutStripRecorder(sharedPage);

    const layoutAuditLogs = [];
    const onConsole = (msg) => {
      const text = msg.text();
      if (text.includes('[LayoutAudit]')) layoutAuditLogs.push(text.slice(0, 300));
    };
    sharedPage.on('console', onConsole);

    // Gắn file và CHỜ tải lên xong — gửi tin khi file chưa lên thì AI không thấy tệp.
    const uploadPromise = sharedPage.waitForResponse(
      (res) => res.url().includes('/uploads/temp') && res.request().method() === 'POST',
      { timeout: 60_000 }
    ).catch(() => null);
    await sharedPage.locator('input[type="file"]').first().setInputFiles(hd45Path);
    const uploadRes = await uploadPromise;
    const uploadOk = Boolean(uploadRes && uploadRes.ok());

    // Câu lệnh nguyên văn của plan §13 N1 (câu thật khách đã gõ khi gặp lỗi đè chữ).
    const promptText = 'thiết kế trang infographic về các ngày lễ như đính kèm';
    const chatInput = sharedPage.locator('textarea').first();
    const chatPromise = sharedPage.waitForResponse(
      (res) => (res.url().includes('/api/ai/chat') || res.url().includes('/api/ai/generate-landing-html'))
        && res.request().method() === 'POST',
      { timeout: 120_000 }
    ).catch(() => null);
    await chatInput.fill(promptText);
    await chatInput.press('Enter');
    console.log('[Kịch bản B] Đã gửi yêu cầu sinh trang, chờ AI...');

    let n1SessionId = null;
    let n1MessageId = null;
    const chatRes = await chatPromise;
    if (chatRes && chatRes.ok()) {
      const body = await chatRes.json().catch(() => null);
      n1SessionId = body?.data?.sessionId ?? null;
      n1MessageId = body?.data?.messageId ?? body?.data?.message?.id ?? null;
    }

    // N2 chấm credit của LƯỢT TẠO TRANG: tin chat hỏi thông tin (bảng hỏi) là một lượt AI trả lời
    // riêng, cũng trừ 1 theo chính sách credit — đo từ đầu bước sẽ ra 2 và báo sai. Mốc chấm = ngay
    // trước khi bấm tạo; không có bảng hỏi thì dùng mốc đầu bước.
    let creditBeforeGenerate = null;
    const wizard = await answerLandingWizardIfShown(sharedPage, {
      beforeGenerate: async () => { creditBeforeGenerate = await getAiCreditsUsed(sharedAuthRequest, baseURL); },
    });
    if (wizard.sessionId) n1SessionId = wizard.sessionId;
    if (wizard.messageId) n1MessageId = wizard.messageId;

    const iframeIncreased = await expect(iframeLocator)
      .toHaveCount(initialIframeCount + 1, { timeout: 150_000 })
      .then(() => true)
      .catch(() => false);
    // Đọc từ bộ ghi (đã từng hiện), không nhìn một lần — xem startLayoutStripRecorder. Kỳ vọng ✓ (sạch
    // ngay, hoặc đã tự sửa xong — plan N1).
    const sawChecking = iframeIncreased ? await strip.waitFor(I18N.layoutChecking, 5_000) : false;
    const hasLayoutOk = iframeIncreased ? await strip.waitFor(I18N.layoutOk, 60_000) : false;
    const stripSeen = await strip.seen();
    const hasRelayoutBtn = await sharedPage.getByRole('button', { name: I18N.relayoutSection })
      .isVisible().catch(() => false);
    const autoFixed = (await sharedPage.locator(`text=${I18N.layoutAutoFixedPrefix}`).isVisible().catch(() => false))
      || (await sharedPage.locator(`text=${I18N.layoutAutoFixedPlain}`).isVisible().catch(() => false));
    sharedPage.off('console', onConsole);

    // Đo lại HTML cuối bằng bộ đo của sản phẩm, độc lập với vòng tự kiểm trong app (B4).
    let auditResult = null;
    let isClean = false;
    if (iframeIncreased) {
      const finalHtml = await iframeLocator.last().getAttribute('srcdoc').catch(() => null);
      if (finalHtml) {
        console.log('[Kịch bản B] Chạy runLayoutAudit trên HTML cuối ở widths: [1280, 390]...');
        auditResult = await auditHtml(context, finalHtml, { widths: [1280, 390] });
        isClean = (auditResult?.findings?.length ?? 0) === 0
          && auditResult?.timedOut === false
          && (auditResult?.errors?.length ?? 0) === 0;
      }
    }

    const creditAfter = await getAiCreditsUsed(sharedAuthRequest, baseURL);
    const creditBaseline = creditBeforeGenerate ?? creditBefore;
    const creditDeducted = creditAfter.used - creditBaseline.used;
    // Tài khoản không có hạn mức credit (aiCreditsPerPeriod null — vd `admin` production 25/09: used
    // luôn 0) thì không đo được N2; đừng chấm "trừ 0 thay vì 1" là lỗi.
    const creditTracked = creditBefore.limit != null || creditAfter.used !== creditBefore.used;
    const isCreditCorrect = !creditTracked || creditDeducted === 1;
    console.log(`[Kịch bản B] Credit: đầu bước=${creditBefore.used}, trước lượt tạo=${creditBeforeGenerate?.used ?? '—'}, sau=${creditAfter.used} → lượt tạo trừ ${creditDeducted}`);

    await captureScreenshot(sharedPage, 'B_N1_generated_page.png', `Infographic sinh từ HD45. isClean=${isClean}, creditDeducted=${creditDeducted}`);

    const lyDo = !uploadOk
      ? 'Tải file HD45 lên không thành công'
      : !iframeIncreased
        ? 'AI không tạo ra trang (không có thẻ landing mới) — xem ảnh B_N1_generated_page.png'
        : !hasLayoutOk
          ? (hasRelayoutBtn
            ? 'Trang còn lỗi hiển thị sau vòng tự sửa (hiện nút Trình bày lại)'
            : `Không thấy ✓${layoutAuditLogs.length ? ` — bộ đo báo: ${layoutAuditLogs.join(' | ')}` : ''}`)
          : !isClean
            ? `Bộ đo độc lập còn thấy lỗi (findings=${auditResult?.findings?.length}, timedOut=${auditResult?.timedOut}, errors=${auditResult?.errors?.length})`
            : !isCreditCorrect
              ? `Lượt tạo trang trừ ${creditDeducted} credit thay vì đúng 1`
              : undefined;

    recordReport({
      kichBan: 'B',
      buoc: 'N1_N2_hd45_generate_and_credit',
      ketQua: lyDo ? 'khong_dat' : 'dat',
      lyDo,
      ids: { sessionId: n1SessionId, messageId: n1MessageId },
      extra: {
        uploadOk,
        wizardShown: wizard.shown,
        sawChecking,
        layoutOk: hasLayoutOk,
        stripSeen,
        autoFixed,
        relayoutButtonVisible: hasRelayoutBtn,
        layoutAuditLogs,
        creditBefore: creditBefore.used,
        creditBeforeGenerate: creditBeforeGenerate?.used ?? null,
        creditAfter: creditAfter.used,
        creditDeducted,
        creditTracked,
        ...(creditTracked ? {} : { ghiChuCredit: 'Tài khoản không giới hạn credit — N2 chưa đo được, cần chạy bằng tài khoản có hạn mức' }),
        auditResult,
      },
    });
    // Không ném lỗi khi khong_dat: chạy nối tiếp, ném ở đây sẽ bỏ luôn N4. Kết quả nằm ở bảng tổng kết.
  });

  // ── Phần 4: N4 (sinh trang đơn giản) ──────────────────────────────────────

  test('B_N4: Sinh một trang đơn giản → chỉ layoutOk, không có layoutAutoFixed hay layoutAutoFixedPlain', async () => {
    test.setTimeout(180_000);
    console.log('[Kịch bản B] Bước N4: Sinh trang đơn giản...');

    // Mở /app tạo phiên mới
    const sessionListLoaded = waitForSessionList(sharedPage);
    await sharedPage.goto('/app');
    await sharedPage.waitForLoadState('domcontentloaded');
    await sessionListLoaded;

    const initialIframeCount = await sharedPage.locator('iframe[title="Landing Page Preview"]').count();
    const strip = await startLayoutStripRecorder(sharedPage);

    // Hook tự kiểm im lặng khi "chưa kiểm được" (không hiện gì trên thẻ) nhưng có in một dòng
    // `[LayoutAudit] …` ra console (useLandingLayoutAutoFix.js:71, :94, :113, :121) — bắt lại để
    // một lượt khong_dat luôn kèm lý do thật, không phải đoán.
    const layoutAuditLogs = [];
    const onConsole = (msg) => {
      const text = msg.text();
      if (text.includes('[LayoutAudit]')) layoutAuditLogs.push(text.slice(0, 300));
    };
    sharedPage.on('console', onConsole);

    const chatInput = sharedPage.locator('textarea').first();
    await expect(chatInput).toBeVisible({ timeout: 15_000 });

    const generatePromise = sharedPage.waitForResponse(
      (res) =>
        (res.url().includes('/api/ai/chat') || res.url().includes('/api/ai/generate-landing-html')) &&
        res.request().method() === 'POST',
      { timeout: 90_000 }
    ).catch(() => null);

    // Câu lệnh đơn giản, không gợi ý thư viện ngoài: plan §13 N4 là "trang đơn giản". Phải nói rõ
    // "landing page" — đo local 25/09: "thiết kế trang giới thiệu…" bị trợ lý hiểu thành tạo
    // chiến dịch (hỏi "gửi qua kênh nào?") và không sinh trang.
    await chatInput.fill('Tạo landing page giới thiệu ngắn về quán cà phê Mộc');
    await chatInput.press('Enter');

    const genRes = await generatePromise;
    let n4SessionId = null;
    let n4MessageId = null;
    if (genRes && genRes.ok()) {
      try {
        const body = await genRes.json();
        n4SessionId = body?.data?.sessionId;
        n4MessageId = body?.data?.message?.id || body?.data?.messageId;
      } catch {
        // Bỏ qua
      }
    }

    // Nếu bot trả về card câu hỏi (ask_landing_details), tự động chọn options và bấm tạo
    const wizard = await answerLandingWizardIfShown(sharedPage);
    if (wizard.sessionId) n4SessionId = wizard.sessionId;
    if (wizard.messageId) n4MessageId = wizard.messageId;

    // Chờ số iframe Landing Page Preview tăng lên (A2: bỏ hoàn toàn text=Landing Page)
    const iframeLocator = sharedPage.locator('iframe[title="Landing Page Preview"]');
    const iframeIncreased = await expect(iframeLocator)
      .toHaveCount(initialIframeCount + 1, { timeout: 60_000 })
      .then(() => true)
      .catch(() => false);

    // Chờ dải trạng thái layoutOk (vòng kiểm nền đo 1280 & 390 trong iframe ẩn). ✓ tự ẩn sau 4 giây và
    // AI có thể tạo trang ngay trong lượt chat (không bảng hỏi) → ✓ hiện/ẩn trong lúc
    // answerLandingWizardIfShown còn chờ 10 giây; đọc từ bộ ghi, không nhìn một lần.
    const sawChecking = iframeIncreased ? await strip.waitFor(I18N.layoutChecking, 3_000) : false;
    const hasLayoutOk = iframeIncreased ? await strip.waitFor(I18N.layoutOk, 45_000) : false;
    const hasRelayoutBtn = await sharedPage.getByRole('button', { name: I18N.relayoutSection })
      .isVisible({ timeout: 1000 }).catch(() => false);
    sharedPage.off('console', onConsole);

    // Kiểm tra không có cả 2 dạng tin nhắn tự sửa
    const hasFix1 = await sharedPage.locator(`text=${I18N.layoutAutoFixedPrefix}`).isVisible({ timeout: 1000 }).catch(() => false);
    const hasFix2 = await sharedPage.locator(`text=${I18N.layoutAutoFixedPlain}`).isVisible({ timeout: 1000 }).catch(() => false);
    const hasAnyAutoFix = hasFix1 || hasFix2;

    await captureScreenshot(sharedPage, 'B_N4_simple_page.png', 'Trang đơn giản: kiểm tra không có tin tự sửa');

    // Tìm lỗi hiển thị trên UI nếu có
    let uiError = '';
    const errorMsgLocator = sharedPage.locator('.text-red-500, [role="alert"]').first();
    if (await errorMsgLocator.isVisible({ timeout: 1000 }).catch(() => false)) {
      uiError = await errorMsgLocator.innerText().catch(() => '');
    }

    // N4 đạt khi và chỉ khi thấy layoutOk VÀ không có tin tự sửa (A2)
    const pass = iframeIncreased && hasLayoutOk && !hasAnyAutoFix;
    recordReport({
      kichBan: 'B',
      buoc: 'N4_simple_page_layout',
      ketQua: pass ? 'dat' : 'khong_dat',
      lyDo: !pass
        ? (!iframeIncreased
            ? `Không tạo được iframe landing page (${uiError || 'AI không trả về HTML hợp lệ hoặc timeout'})`
            : hasAnyAutoFix
              ? 'Xuất hiện tin layoutAutoFixed trên trang đơn giản'
              : hasRelayoutBtn
                ? 'Trang AI sinh còn lỗi hiển thị (hiện nút Trình bày lại)'
                : layoutAuditLogs.length
                  ? `Không thấy ✓ — bộ đo báo: ${layoutAuditLogs.join(' | ')}`
                  : 'Không thấy nhãn layoutOk sau khi sinh trang')
        : undefined,
      ids: {
        sessionId: n4SessionId,
        messageId: n4MessageId,
      },
      extra: {
        landingIframeCount: await iframeLocator.count().catch(() => 0),
        sawChecking,
        layoutOk: hasLayoutOk,
        stripSeen: await strip.seen(),
        relayoutButtonVisible: hasRelayoutBtn,
        autoFixTriggered: hasAnyAutoFix,
        layoutAuditLogs,
        error: uiError || undefined,
      },
    });

    expect(iframeIncreased, `Kỳ vọng sinh được iframe landing page: ${uiError}`).toBe(true);
    expect(hasAnyAutoFix, 'Không được có tin tự sửa trên trang đơn giản').toBe(false);
  });
});
