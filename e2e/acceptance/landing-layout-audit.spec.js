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

    // Kiểm tra dải trạng thái và nút Trình bày lại nếu có
    const landingStrip = sharedPage.locator('[data-testid="landing-layout-strip"]').first();
    const hasLandingStrip = await landingStrip.isVisible({ timeout: 3000 }).catch(() => false);
    const relayoutBtn = sharedPage.getByRole('button', { name: I18N.relayoutSection });
    const hasRelayoutBtn = await relayoutBtn.isVisible({ timeout: 2000 }).catch(() => false);

    // Kiểm tra KHÔNG có tin nhắn tự sửa ở cả 2 dạng: layoutAutoFixed và layoutAutoFixedPlain
    const autoFixMsg1 = sharedPage.locator(`text=${I18N.layoutAutoFixedPrefix}`);
    const autoFixMsg2 = sharedPage.locator(`text=${I18N.layoutAutoFixedPlain}`);
    const hasAutoFix1 = await autoFixMsg1.isVisible({ timeout: 1000 }).catch(() => false);
    const hasAutoFix2 = await autoFixMsg2.isVisible({ timeout: 1000 }).catch(() => false);
    const hasAnyAutoFix = hasAutoFix1 || hasAutoFix2;

    await captureScreenshot(sharedPage, 'B_N7_timeline_de_chu.png', 'Thẻ hiển thị sau khi dán timeline-de-chu.html');

    // N7: Lỗi sản phẩm ở đường dán HTML không chạy kiểm hiển thị -> ghi khong_dat (A1)
    const pass = hasLandingStrip && hasRelayoutBtn && !hasAnyAutoFix;
    recordReport({
      kichBan: 'B',
      buoc: 'N7_pasted_broken_html',
      ketQua: pass ? 'dat' : 'khong_dat',
      lyDo: pass ? undefined : 'đường dán HTML không chạy kiểm hiển thị',
      ids: {
        sessionId: sharedSessionId,
        messageId: sharedMessageId,
      },
      extra: {
        landingCardVisible: true,
        landingStripVisible: hasLandingStrip,
        relayoutButtonVisible: hasRelayoutBtn,
        autoFixTriggered: hasAnyAutoFix,
        ghiChu: 'Lỗ sản phẩm: handleLandingHtmlPaste không gọi runLandingLayoutCheck',
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
    await sharedPage.goto('/app');
    await sharedPage.waitForLoadState('domcontentloaded');

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

    // Đo dải trạng thái layoutOk (không gán cứng, A1)
    const layoutOkBadge = sharedPage.locator(`text=${I18N.layoutOk}`).first();
    const hasLayoutOk = await layoutOkBadge.isVisible({ timeout: 3000 }).catch(() => false);

    // Không có tin nhắn layoutAutoFixed hay layoutAutoFixedPlain
    const hasFix1 = await sharedPage.locator(`text=${I18N.layoutAutoFixedPrefix}`).isVisible({ timeout: 1000 }).catch(() => false);
    const hasFix2 = await sharedPage.locator(`text=${I18N.layoutAutoFixedPlain}`).isVisible({ timeout: 1000 }).catch(() => false);
    const hasAnyFix = hasFix1 || hasFix2;

    await captureScreenshot(sharedPage, 'B_N7_sach.png', 'Trang sạch: thẻ hiển thị đầy đủ, không có tin tự sửa');

    // N7-sạch: Lỗi sản phẩm ở đường dán HTML không chạy kiểm hiển thị -> ghi khong_dat (A1)
    const pass = hasLayoutOk && !hasAnyFix;
    recordReport({
      kichBan: 'B',
      buoc: 'N7_pasted_clean_html',
      ketQua: pass ? 'dat' : 'khong_dat',
      lyDo: pass ? undefined : 'đường dán HTML không chạy kiểm hiển thị',
      ids: {
        sessionId: sachSessionId,
        messageId: sachMessageId,
      },
      extra: { layoutOk: hasLayoutOk, autoFixTriggered: hasAnyFix },
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

    // Đọc số credit AI trước khi sinh trang qua authenticated request (A1)
    const creditBefore = await getAiCreditsUsed(sharedAuthRequest, baseURL);
    console.log(`[Kịch bản B] Credit trước khi sinh trang: used=${creditBefore.used}, limit=${creditBefore.limit}`);

    await sharedPage.goto('/app');
    await sharedPage.waitForLoadState('domcontentloaded');

    const fileInput = sharedPage.locator('input[type="file"]').first();
    await fileInput.setInputFiles(hd45Path);
    await sharedPage.waitForTimeout(1000);

    const promptText = 'thiết kế trang infographic về các ngày lễ như đính kèm';
    const chatInput = sharedPage.locator('textarea').first();

    const generatePromise = sharedPage.waitForResponse(
      (res) =>
        res.url().includes('/api/ai/chat') &&
        res.request().method() === 'POST' &&
        res.status() === 200,
      { timeout: 90_000 }
    ).catch(() => null);

    await chatInput.fill(promptText);
    await chatInput.press('Enter');

    console.log('[Kịch bản B] Đã gửi yêu cầu sinh trang, chờ AI tạo và kiểm tra hiển thị...');

    const genRes = await generatePromise;
    let n1SessionId = null;
    let n1MessageId = null;
    if (genRes) {
      try {
        const body = await genRes.json();
        n1SessionId = body?.data?.sessionId;
        n1MessageId = body?.data?.message?.id;
      } catch {
        // Bỏ qua
      }
    }

    const landingStrip = sharedPage.locator('[data-testid="landing-layout-strip"]').first();
    await expect(landingStrip).toBeVisible({ timeout: 90_000 });

    // Kỳ vọng hoàn tất kiểm tra hiển thị ✓
    const layoutOkBadge = sharedPage.locator(`text=${I18N.layoutOk}`).first();
    await expect(layoutOkBadge).toBeVisible({ timeout: 45_000 });

    const previewIframe = sharedPage.locator('iframe[title="Landing Page Preview"]').first();
    await expect(previewIframe).toBeVisible({ timeout: 15_000 });
    const finalHtml = await previewIframe.getAttribute('srcdoc');
    expect(finalHtml).toBeTruthy();

    // Chạy bộ đo hình học runLayoutAudit độc lập với widths: [1280, 390] (B4)
    console.log('[Kịch bản B] Chạy runLayoutAudit trên HTML cuối ở widths: [1280, 390]...');
    const auditResult = await auditHtml(context, finalHtml, { widths: [1280, 390] });
    console.log('[Kịch bản B] Kết quả runLayoutAudit:', JSON.stringify(auditResult));

    // Điều kiện sạch chuẩn (B4): findings.length === 0 && !timedOut && errors.length === 0
    const isClean =
      (auditResult?.findings?.length ?? 0) === 0 &&
      auditResult?.timedOut === false &&
      (auditResult?.errors?.length ?? 0) === 0;

    // Đọc số credit sau khi hoàn thành N1 qua authenticated request
    const creditAfter = await getAiCreditsUsed(sharedAuthRequest, baseURL);
    const creditDeducted = creditAfter.used - creditBefore.used;
    console.log(`[Kịch bản B] Credit sau N1: used=${creditAfter.used}. Đã trừ: ${creditDeducted}`);

    await captureScreenshot(sharedPage, 'B_N1_generated_page.png', `Infographic sinh từ HD45. isClean=${isClean}, CreditDeducted=${creditDeducted}`);

    const isCreditCorrect = creditDeducted === 1;

    recordReport({
      kichBan: 'B',
      buoc: 'N1_N2_hd45_generate_and_credit',
      ketQua: isClean && isCreditCorrect ? 'dat' : 'khong_dat',
      lyDo: !isClean
        ? `Bộ đo hình học chưa sạch (findings=${auditResult?.findings?.length}, timedOut=${auditResult?.timedOut}, errors=${auditResult?.errors?.length})`
        : !isCreditCorrect
        ? `Credit bị trừ ${creditDeducted} thay vì đúng 1`
        : undefined,
      ids: {
        sessionId: n1SessionId,
        messageId: n1MessageId,
      },
      extra: {
        creditBefore: creditBefore.used,
        creditAfter: creditAfter.used,
        creditDeducted,
        auditResult,
      },
    });

    expect(isClean).toBe(true);
    expect(creditDeducted).toBe(1);
  });

  // ── Phần 4: N4 (sinh trang đơn giản) ──────────────────────────────────────

  test('B_N4: Sinh một trang đơn giản → chỉ layoutOk, không có layoutAutoFixed hay layoutAutoFixedPlain', async () => {
    test.setTimeout(180_000);
    console.log('[Kịch bản B] Bước N4: Sinh trang đơn giản...');

    // Mở /app tạo phiên mới
    await sharedPage.goto('/app');
    await sharedPage.waitForLoadState('domcontentloaded');

    const initialIframeCount = await sharedPage.locator('iframe[title="Landing Page Preview"]').count();

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
    const wizardCard = sharedPage.locator('.bg-gradient-to-br').filter({ hasText: /Thiết kế Landing Page|Design Landing Page/i }).last();
    if (await wizardCard.isVisible({ timeout: 10_000 }).catch(() => false)) {
      console.log('[Kịch bản B] Bot hiển thị wizard hỏi thông tin, tự động chọn các lựa chọn...');
      const optionGroups = wizardCard.locator('.flex.flex-wrap.gap-2');
      const groupCount = await optionGroups.count();
      for (let i = 0; i < groupCount; i++) {
        const firstOptBtn = optionGroups.nth(i).locator('button').first();
        if (await firstOptBtn.isVisible().catch(() => false)) {
          await firstOptBtn.click();
          await sharedPage.waitForTimeout(300);
        }
      }

      const submitLandingBtn = wizardCard.locator('button.w-full');
      await expect(submitLandingBtn).toBeVisible({ timeout: 5000 });
      await expect(submitLandingBtn).toBeEnabled({ timeout: 5000 });

      const generateHtmlPromise = sharedPage.waitForResponse(
        (res) =>
          res.url().includes('/api/ai/generate-landing-html') &&
          res.request().method() === 'POST',
        { timeout: 90_000 }
      ).catch(() => null);

      console.log('[Kịch bản B] Bấm nút "Tạo landing page theo lựa chọn này"...');
      await submitLandingBtn.click();

      const htmlRes = await generateHtmlPromise;
      if (htmlRes && htmlRes.ok()) {
        try {
          const body = await htmlRes.json();
          if (body?.data?.sessionId) n4SessionId = body.data.sessionId;
          if (body?.data?.messageId) n4MessageId = body.data.messageId;
        } catch {
          // Bỏ qua
        }
      }
    }

    // Chờ số iframe Landing Page Preview tăng lên (A2: bỏ hoàn toàn text=Landing Page)
    const iframeLocator = sharedPage.locator('iframe[title="Landing Page Preview"]');
    const iframeIncreased = await expect(iframeLocator)
      .toHaveCount(initialIframeCount + 1, { timeout: 60_000 })
      .then(() => true)
      .catch(() => false);

    // Chờ dải trạng thái layoutOk xuất hiện (chờ background audit đo 1280 & 390 trong hidden iframe).
    // ✓ tự ẩn sau 4 giây nên phải bắt trong lúc chờ, không đọc một lần sau cùng.
    const checkingBadge = sharedPage.locator(`text=${I18N.layoutChecking}`).first();
    const sawChecking = iframeIncreased
      ? await checkingBadge.isVisible({ timeout: 3000 }).catch(() => false)
      : false;
    const layoutOkBadge = sharedPage.locator(`text=${I18N.layoutOk}`).first();
    const hasLayoutOk = iframeIncreased
      ? await expect(layoutOkBadge)
          .toBeVisible({ timeout: 45_000 })
          .then(() => true)
          .catch(() => false)
      : false;
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
