/**
 * Kịch bản C — Form đặt lịch trên iPhone (project iphone, WebKit).
 * Nguồn: _internal/PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md §7.
 * Lệnh sửa: _internal/LENH_GIAO_SUA_NGHIEM_THU_PLAYWRIGHT_2026-09-24.md mục A1, A2, A3, A4, A5, A6, B5, C.
 *
 * Tách HAI form:
 * - Form 1 (Đặt lịch, KHÔNG thu tiền) → C1 và C2 (bài nộp confirmed, có thư nhắc sau 24h).
 * - Form 2 (Đặt lịch + Thu tiền QR thật) → C3 (bài nộp pending_payment, có VietQR chuẩn).
 *
 * Cả hai form đều được giữ lại (skipAutoDelete), không xoá ở afterAll.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  getRunDir,
  captureScreenshot,
  recordReport,
  registerCleanup,
  executeCleanup,
  createAuthenticatedContext,
  parseEmvco,
  crc16CcittFalse,
} from './acceptance-helper.js';

let authRequest = null;
let form1Id = null;
let form1Key = null;

let form2Id = null;
let form2Key = null;

const RESPONDENT_EMAIL = process.env.ACCEPTANCE_RESPONDENT_EMAIL || null;
const BANK_BIN = process.env.ACCEPTANCE_BANK_BIN || null;
const BANK_ACCOUNT = process.env.ACCEPTANCE_BANK_ACCOUNT || null;
const BANK_NAME = process.env.ACCEPTANCE_BANK_NAME || null;

test.describe('Kịch bản C — Form đặt lịch trên iPhone (WebKit)', () => {
  test.beforeAll(async ({ playwright, baseURL }) => {
    if (!RESPONDENT_EMAIL) {
      throw new Error('Biến ACCEPTANCE_RESPONDENT_EMAIL là bắt buộc theo lệnh giao để kiểm tra gửi và nhắc lịch thật.');
    }
    authRequest = await createAuthenticatedContext(playwright, baseURL);

    // Một test đỏ làm Playwright dựng worker mới và chạy LẠI beforeAll cho các test sau — production
    // 25/09 vì thế tạo 4 form thay vì 2. Ghi form đã tạo vào thư mục lượt chạy, lần sau dùng lại.
    const formsCachePath = path.join(getRunDir(), 'forms.json');
    if (fs.existsSync(formsCachePath)) {
      ({ form1Id, form1Key, form2Id, form2Key } = JSON.parse(fs.readFileSync(formsCachePath, 'utf8')));
      console.log(`[Kịch bản C] Dùng lại form đã tạo trong lượt này: Form 1=${form1Id}, Form 2=${form2Id ?? '—'}`);
      registerCleanup({ type: 'form', id: form1Id, skipAutoDelete: true, note: 'Form 1 (lịch C2) — giữ lại để kiểm thư nhắc hôm sau.' });
      if (form2Id) registerCleanup({ type: 'form', id: form2Id, skipAutoDelete: true, note: 'Form 2 (QR C3) — giữ lại để quét QR thật.' });
      return;
    }

    // ── Tạo Form 1: Đặt lịch KHÔNG thu tiền (cho C1 và C2) ──────────────────
    console.log('[Kịch bản C] Chuẩn bị Form 1 (đặt lịch, không thu tiền cho C1/C2)...');
    const weeklySlotsAllDays = {
      '0': ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'],
      '1': ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'],
      '2': ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'],
      '3': ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'],
      '4': ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'],
      '5': ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'],
      '6': ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'],
    };

    const form1Res = await authRequest.post(`${baseURL}/api/forms`, {
      data: {
        title: 'Nghiệm thu Đặt lịch Hẹn iPhone (Không thu tiền)',
        description: 'Biểu mẫu phục vụ nghiệm thu tự động C1 & C2 (lịch hẹn confirmed để kiểm tra email nhắc lịch)',
        fields: [
          { key: 'name', label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
          { key: 'email', label: 'Email', type: 'email', required: true, role: 'email' },
          { key: 'phone', label: 'Số điện thoại', type: 'phone', required: true, role: 'phone' },
        ],
        bookingConfig: {
          enabled: true,
          weeklySlots: weeklySlotsAllDays,
          daysAhead: 14,
          minNoticeMinutes: 15,
        },
        paymentConfig: null, // Không thu tiền → bài nộp confirmed
        settings: {
          notifyOwner: true,
          sendConfirmation: true,
          consentEnabled: true,
          submitButtonText: 'Xác nhận đặt lịch',
        },
      },
    });

    if (!form1Res.ok()) {
      const errText = await form1Res.text();
      throw new Error(`Không tạo được Form 1: HTTP ${form1Res.status()} - ${errText}`);
    }

    const form1Body = await form1Res.json();
    form1Id = form1Body?.data?.id;
    form1Key = form1Body?.data?.publicKey;

    // Xuất bản Form 1
    const pub1Res = await authRequest.put(`${baseURL}/api/forms/${form1Id}/publish`, {
      data: { isPublished: true },
    });
    if (!pub1Res.ok()) throw new Error(`Không xuất bản được Form 1: HTTP ${pub1Res.status()}`);

    console.log(`[Kịch bản C] Form 1 đã tạo thành công: ID=${form1Id}, publicKey=${form1Key}`);

    // Giữ Form 1 lại cho cron nhắc lịch C2 hôm sau
    registerCleanup({
      type: 'form',
      id: form1Id,
      skipAutoDelete: true,
      note: 'Form 1 chứa bài nộp C2 (lịch 25h). Giữ lại để Claude kiểm cron_job_runs form_booking_reminder vào hôm sau.',
    });

    // ── Tạo Form 2: Đặt lịch + Thu tiền QR thật (cho C3) nếu có đủ biến ─────
    if (BANK_BIN && BANK_ACCOUNT && BANK_NAME) {
      console.log('[Kịch bản C] Chuẩn bị Form 2 (đặt lịch + thu tiền QR thật cho C3)...');
      const form2Res = await authRequest.post(`${baseURL}/api/forms`, {
        data: {
          title: 'Nghiệm thu Thanh toán QR iPhone (Có thu tiền)',
          description: 'Biểu mẫu phục vụ nghiệm thu tự động C3 (quét QR thật và chuyển 2.000đ)',
          fields: [
            { key: 'name', label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
            { key: 'email', label: 'Email', type: 'email', required: true, role: 'email' },
            { key: 'phone', label: 'Số điện thoại', type: 'phone', required: true, role: 'phone' },
          ],
          bookingConfig: {
            enabled: true,
            weeklySlots: weeklySlotsAllDays,
            daysAhead: 14,
            minNoticeMinutes: 15,
          },
          paymentConfig: {
            enabled: true,
            method: 'bank',
            amount: 2000,
            bankBin: BANK_BIN,
            accountNumber: BANK_ACCOUNT,
            accountName: BANK_NAME,
            holdMinutes: 30,
          },
          settings: {
            notifyOwner: true,
            sendConfirmation: true,
            consentEnabled: true,
            submitButtonText: 'Tiến hành đặt lịch & Thanh toán',
          },
        },
      });

      if (form2Res.ok()) {
        const form2Body = await form2Res.json();
        form2Id = form2Body?.data?.id;
        form2Key = form2Body?.data?.publicKey;

        await authRequest.put(`${baseURL}/api/forms/${form2Id}/publish`, {
          data: { isPublished: true },
        });

        console.log(`[Kịch bản C] Form 2 đã tạo thành công: ID=${form2Id}, publicKey=${form2Key}`);

        registerCleanup({
          type: 'form',
          id: form2Id,
          skipAutoDelete: true,
          note: 'Form 2 phục vụ quét QR và chuyển 2.000đ thật trên production.',
        });
      } else {
        console.warn('[Kịch bản C] Không tạo được Form 2:', await form2Res.text());
      }
    } else {
      console.log('[Kịch bản C] Chưa cung cấp biến ngân hàng thật (ACCEPTANCE_BANK_BIN, ACCEPTANCE_BANK_ACCOUNT, ACCEPTANCE_BANK_NAME), Form 2 sẽ bỏ qua.');
    }

    fs.writeFileSync(formsCachePath, JSON.stringify({ form1Id, form1Key, form2Id, form2Key }, null, 2));
  });

  test.afterAll(async ({ baseURL }) => {
    if (authRequest) {
      await executeCleanup(authRequest, baseURL);
      await authRequest.dispose();
    }
  });

  test('C1: Mở form ở cửa sổ ẩn danh, điền và nộp → chuyển hướng tới trang trạng thái', async ({ browser, baseURL }) => {
    console.log('[Kịch bản C] Bước C1 (PR-1): Mở Form 1 trong context ẩn danh iPhone...');
    expect(form1Key).toBeTruthy();

    // beforeAll đã dừng nếu thiếu ACCEPTANCE_RESPONDENT_EMAIL — không có địa chỉ dự phòng.
    const respondentEmail = RESPONDENT_EMAIL.replace('@', '+c1@');

    const context = await browser.newContext({
      locale: 'vi-VN',
      timezoneId: 'Asia/Ho_Chi_Minh',
      storageState: undefined,
    });

    const page = await context.newPage();
    try {
      await page.goto(`${baseURL}/f/${form1Key}`);
      await page.waitForLoadState('domcontentloaded');

      await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });

      // Điền thông tin (tránh dính honeypot _hp_website)
      const nameInput = page.getByLabel(/Họ và tên/i).or(page.locator('input[name="name"], #field-name, input[type="text"]:not([name*="_hp"])')).first();
      await nameInput.fill('Người Thử Nghiệm C1');

      const emailInput = page.getByLabel(/Email/i).or(page.locator('input[type="email"], #field-email')).first();
      await emailInput.fill(respondentEmail);

      const phoneInput = page.getByLabel(/Số điện thoại/i).or(page.locator('input[type="tel"], #field-phone')).first();
      if (await phoneInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await phoneInput.fill('0901234567');
      }

      // Chọn 1 slot bất kỳ hiển thị trên form (nếu ban đêm hôm nay hết slot thì bấm Tuần sau)
      let slotButton = page.locator('button[type="button"]:not([disabled])').filter({ hasText: /^\s*\d{2}:\d{2}/ }).first();
      if (!(await slotButton.isVisible({ timeout: 1500 }).catch(() => false))) {
        const nextWeekBtn = page.getByRole('button', { name: /Tuần sau/i });
        if (await nextWeekBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await nextWeekBtn.click();
          await page.waitForTimeout(500);
        }
        slotButton = page.locator('button[type="button"]:not([disabled])').filter({ hasText: /^\s*\d{2}:\d{2}/ }).first();
      }
      if (await slotButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await slotButton.click();
        await page.waitForTimeout(300);
      }

      const consentCheckbox = page.locator('input[type="checkbox"]').first();
      if (await consentCheckbox.isVisible({ timeout: 1000 }).catch(() => false)) {
        await consentCheckbox.check();
      }

      await captureScreenshot(page, 'C1_form_filled.png', 'Form C1 đã điền thông tin đầy đủ');

      // Đón response POST /submissions 201 để lấy accessToken
      const submitResponsePromise = page.waitForResponse(
        (res) =>
          res.url().match(/\/api\/public\/forms\/[^/]+\/submissions/) &&
          res.request().method() === 'POST' &&
          res.status() === 201,
        { timeout: 25_000 }
      );

      const submitBtn = page.locator('button[type="submit"]').first();
      await submitBtn.scrollIntoViewIfNeeded();
      await submitBtn.click();

      const submitRes = await submitResponsePromise;
      const submitBody = await submitRes.json();
      const accessToken = submitBody?.data?.accessToken;
      expect(accessToken).toBeTruthy();

      // Form 1 không thu tiền: hiển thị màn hình thành công trên cùng URL
      await expect(
        page.locator('text=✓')
          .or(page.getByText('thành công', { exact: false }))
          .or(page.getByRole('heading', { level: 3 }))
          .first()
      ).toBeVisible({ timeout: 15_000 });

      // Mở trang trạng thái /f/:publicKey/s/:accessToken để kiểm tra và chụp ảnh trạng thái
      const statusUrl = `${baseURL}/f/${form1Key}/s/${accessToken}`;
      await page.goto(statusUrl);
      await page.waitForLoadState('domcontentloaded');

      await captureScreenshot(page, 'C1_status_page.png', 'Trang trạng thái bài nộp C1');

      recordReport({
        kichBan: 'C',
        buoc: 'C1_submit_form',
        ketQua: 'dat',
        ids: {
          formId: form1Id,
          formKey: form1Key,
          accessToken,
          emailSentTo: respondentEmail,
        },
        extra: { statusUrl },
      });
    } finally {
      await context.close();
    }
  });

  test('C2: Đặt lịch cách ít nhất 25 giờ trên Form 1 → ghi ID, KHÔNG dọn lịch này ở afterAll', async ({ browser, baseURL, request }) => {
    console.log('[Kịch bản C] Bước C2 (PR-2): Tìm khung giờ cách ít nhất 25 giờ và đặt lịch...');
    expect(form1Key).toBeTruthy();

    const respondentEmail = RESPONDENT_EMAIL.replace('@', '+c2@');

    // Gọi API public lấy danh sách slots để tìm slot cách >= 25 giờ (A6)
    const now = Date.now();
    const pad = (n) => String(n).padStart(2, '0');
    const todayStr = new Date(now).toISOString().split('T')[0];

    console.log(`[Kịch bản C] Gọi GET /api/public/forms/${form1Key}/slots để lấy danh sách giờ hẹn...`);
    const slotsRes = await request.get(`${baseURL}/api/public/forms/${form1Key}/slots?from=${todayStr}&days=14`);
    expect(slotsRes.ok()).toBe(true);

    const slotsBody = await slotsRes.json();
    const allSlots = Array.isArray(slotsBody?.data?.slots) ? slotsBody.data.slots : [];
    console.log(`[Kịch bản C] API trả về ${allSlots.length} khung giờ`);

    // Lọc các slot có thời gian cách hiện tại >= 25 giờ
    const validCandidateSlots = [];
    for (const slot of allSlots) {
      if (slot.remaining === 0) continue;
      // Tạo timestamp giờ Việt Nam (UTC+7)
      const slotTimeMs = new Date(`${slot.date}T${slot.time}:00+07:00`).getTime();
      const diffHours = (slotTimeMs - now) / (3600 * 1000);
      if (diffHours >= 25.0) {
        validCandidateSlots.push({ ...slot, slotTimeMs, diffHours });
      }
    }

    validCandidateSlots.sort((a, b) => a.slotTimeMs - b.slotTimeMs);

    if (validCandidateSlots.length === 0) {
      throw new Error('Không tìm thấy khung giờ nào cách thời điểm hiện tại ít nhất 25 giờ!');
    }

    const chosenSlot = validCandidateSlots[0];
    console.log(`[Kịch bản C] Đã chọn slot mục tiêu: Ngày=${chosenSlot.date}, Giờ=${chosenSlot.time} (cách hiện tại ${chosenSlot.diffHours.toFixed(1)} giờ)`);

    // Mở form trên WebKit iPhone trong context ẩn danh
    const context = await browser.newContext({
      locale: 'vi-VN',
      timezoneId: 'Asia/Ho_Chi_Minh',
      storageState: undefined,
    });

    const page = await context.newPage();
    try {
      await page.goto(`${baseURL}/f/${form1Key}`);
      await page.waitForLoadState('domcontentloaded');

      // Điền thông tin (tránh dính honeypot _hp_website)
      const nameInput = page.getByLabel(/Họ và tên/i).or(page.locator('input[name="name"], #field-name, input[type="text"]:not([name*="_hp"])')).first();
      await nameInput.fill('Khách Hẹn C2 Nhắc Lịch');

      const emailInput = page.getByLabel(/Email/i).or(page.locator('input[type="email"], #field-email')).first();
      await emailInput.fill(respondentEmail);

      const phoneInput = page.getByLabel(/Số điện thoại/i).or(page.locator('input[type="tel"], #field-phone')).first();
      if (await phoneInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await phoneInput.fill('0909888999');
      }

      // Tìm nút của đúng ngày chosenSlot.date (nằm trong card ngày tương ứng, A6)
      // Trên giao diện hiển thị dạng dd/mm (ví dụ "Thứ Bảy, 26/09/2026")
      const [y, m, d] = chosenSlot.date.split('-');
      const dateLabelShort = `${d}/${m}`;
      // Chờ bộ chọn giờ tải xong (có ít nhất một nút giờ) RỒI mới xét ngày. Production 25/09: danh sách
      // giờ về chậm hơn 1,5 giây, kịch bản tưởng ngày không có ở tuần này, bấm "Tuần sau" và lạc tuần.
      const anySlotButton = page.locator('div.rounded-xl.border.border-gray-200 button[type="button"]')
        .filter({ hasText: /^\s*\d{2}:\d{2}/ }).first();
      await anySlotButton.waitFor({ state: 'visible', timeout: 20_000 });
      let dateCard = page.locator('div.rounded-xl.border.border-gray-200').filter({ hasText: dateLabelShort });
      if (!(await dateCard.isVisible({ timeout: 1500 }).catch(() => false))) {
        const nextWeekBtn = page.getByRole('button', { name: /Tuần sau/i });
        if (await nextWeekBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          console.log('[Kịch bản C] Bấm "Tuần sau" để tìm ngày đặt lịch...');
          await nextWeekBtn.click();
          await page.waitForTimeout(1000);
        }
        dateCard = page.locator('div.rounded-xl.border.border-gray-200').filter({ hasText: dateLabelShort });
      }

      // Chọn đúng nút giờ trong khối ngày đó
      const slotButton = dateCard.locator('button[type="button"]:not([disabled])')
        .filter({ hasText: new RegExp(`^\\s*${chosenSlot.time}`) })
        .first();

      await expect(slotButton).toBeVisible({ timeout: 10_000 });
      await slotButton.click();
      await page.waitForTimeout(400);

      const consentCheckbox = page.locator('input[type="checkbox"]').first();
      if (await consentCheckbox.isVisible({ timeout: 1000 }).catch(() => false)) {
        await consentCheckbox.check();
      }

      // Đón response POST /submissions 201
      const submitResponsePromise = page.waitForResponse(
        (res) =>
          res.url().match(/\/api\/public\/forms\/[^/]+\/submissions/) &&
          res.request().method() === 'POST' &&
          res.status() === 201,
        { timeout: 25_000 }
      );

      // Bấm nút gửi
      const submitBtn = page.locator('button[type="submit"]').first();
      await submitBtn.scrollIntoViewIfNeeded();
      await submitBtn.click();

      const submitRes = await submitResponsePromise;
      const submitBody = await submitRes.json();
      const accessToken = submitBody?.data?.accessToken;
      expect(accessToken).toBeTruthy();

      // Form 1 không thu tiền: hiển thị màn hình thành công
      await expect(
        page.locator('text=✓')
          .or(page.getByText('thành công', { exact: false }))
          .first()
      ).toBeVisible({ timeout: 15_000 });

      const statusUrl = `${baseURL}/f/${form1Key}/s/${accessToken}`;
      await page.goto(statusUrl);
      await page.waitForLoadState('domcontentloaded');

      // Đọc trạng thái bài nộp qua API public để lấy appointment_at thật và status thật đã lưu trong DB (A3)
      const subStatusRes = await request.get(`${baseURL}/api/public/forms/${form1Key}/submissions/${accessToken}`);
      expect(subStatusRes.ok()).toBe(true);

      const subStatusBody = await subStatusRes.json();
      const actualAppointmentAt = subStatusBody?.data?.appointmentAt;
      const actualStatus = subStatusBody?.data?.status;

      expect(actualAppointmentAt).toBeTruthy();
      expect(actualStatus).toBe('confirmed');

      const actualTimeMs = new Date(actualAppointmentAt).getTime();
      const actualDiffHours = (actualTimeMs - now) / (3600 * 1000);

      console.log(`[Kịch bản C] Giờ hẹn thật đã lưu trong DB: ${actualAppointmentAt}, trạng thái: ${actualStatus} (cách hiện tại ${actualDiffHours.toFixed(2)} giờ)`);

      // Khẳng định giờ hẹn ít nhất cách hiện tại 24h15' (A6)
      const isTimeGapValid = actualDiffHours >= 24.25;

      await captureScreenshot(page, 'C2_booking_25h.png', `Lịch hẹn cách ${actualDiffHours.toFixed(1)}h: token=${accessToken}`);

      recordReport({
        kichBan: 'C',
        buoc: 'C2_booking_25h',
        ketQua: isTimeGapValid ? 'dat' : 'khong_dat',
        lyDo: !isTimeGapValid ? `Giờ hẹn chỉ cách hiện tại ${actualDiffHours.toFixed(2)}h (yêu cầu >= 24h15')` : undefined,
        ids: {
          formId: form1Id,
          formKey: form1Key,
          accessToken,
          appointmentAt: actualAppointmentAt,
          status: actualStatus,
          respondentEmail,
        },
        extra: {
          luuY: 'KHÔNG XOÁ BÀI NỘP VÀ FORM NÀY. Lịch đã mang trạng thái confirmed và phải sống qua 24h để Claude kiểm cron_job_runs (form_booking_reminder) vào hôm sau.',
          actualDiffHours,
          statusUrl,
        },
      });

      expect(isTimeGapValid).toBe(true);
    } finally {
      await context.close();
    }
  });

  test('C3: Trang trạng thái hiện QR thanh toán — kiểm tra nội dung EMVCo VietQR, DOM và responsive trên iPhone', async ({ browser, baseURL, request }) => {
    console.log('[Kịch bản C] Bước C3 (PR-3): Kiểm tra QR thanh toán và responsive trên iPhone...');

    if (!form2Key || !BANK_BIN || !BANK_ACCOUNT || !BANK_NAME) {
      console.warn('[Kịch bản C] SKIPPED C3: thiếu biến ngân hàng thật (ACCEPTANCE_BANK_BIN, ACCEPTANCE_BANK_ACCOUNT, ACCEPTANCE_BANK_NAME)');
      recordReport({
        kichBan: 'C',
        buoc: 'C3_payment_qr_validation',
        ketQua: 'skipped',
        lyDo: 'thiếu cấu hình ngân hàng thật qua biến môi trường ACCEPTANCE_BANK_BIN, ACCEPTANCE_BANK_ACCOUNT, ACCEPTANCE_BANK_NAME',
      });
      test.skip(true, 'Thiếu cấu hình ngân hàng thật');
      return;
    }

    const context = await browser.newContext({
      locale: 'vi-VN',
      timezoneId: 'Asia/Ho_Chi_Minh',
      storageState: undefined,
    });

    const page = await context.newPage();
    try {
      await page.goto(`${baseURL}/f/${form2Key}`);
      await page.waitForLoadState('domcontentloaded');

      // Điền thông tin (tránh dính honeypot _hp_website)
      const nameInput = page.getByLabel(/Họ và tên/i).or(page.locator('input[name="name"], #field-name, input[type="text"]:not([name*="_hp"])')).first();
      await nameInput.fill('Khách Thanh Toán QR Thật');

      const emailInput = page.getByLabel(/Email/i).or(page.locator('input[type="email"], #field-email')).first();
      await emailInput.fill(RESPONDENT_EMAIL.replace('@', '+c3@'));

      const phoneInput = page.getByLabel(/Số điện thoại/i).or(page.locator('input[type="tel"], #field-phone')).first();
      if (await phoneInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await phoneInput.fill('0912345678');
      }

      let slotBtn = page.locator('button[type="button"]:not([disabled])').filter({ hasText: /^\s*\d{2}:\d{2}/ }).first();
      if (!(await slotBtn.isVisible({ timeout: 1500 }).catch(() => false))) {
        const nextWeekBtn = page.getByRole('button', { name: /Tuần sau/i });
        if (await nextWeekBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await nextWeekBtn.click();
          await page.waitForTimeout(500);
        }
        slotBtn = page.locator('button[type="button"]:not([disabled])').filter({ hasText: /^\s*\d{2}:\d{2}/ }).first();
      }
      if (await slotBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await slotBtn.click();
        await page.waitForTimeout(300);
      }

      // Đón response submit từ API public (B5)
      const submitResponsePromise = page.waitForResponse(
        (res) =>
          res.url().match(/\/api\/public\/forms\/[^/]+\/submissions/) &&
          res.request().method() === 'POST' &&
          res.status() === 201,
        { timeout: 25_000 }
      );

      const submitBtn = page.locator('button[type="submit"]').first();
      await submitBtn.scrollIntoViewIfNeeded();
      await submitBtn.click();

      const submitResponse = await submitResponsePromise;
      const submitBody = await submitResponse.json();
      let paymentData = submitBody?.data?.payment;
      let accessToken = submitBody?.data?.accessToken;

      // Chờ chuyển sang trang trạng thái hoặc mở trực tiếp nếu cần
      if (accessToken) {
        await page.waitForURL(new RegExp(`/f/${form2Key}/s/`), { timeout: 10_000 }).catch(async () => {
          await page.goto(`${baseURL}/f/${form2Key}/s/${accessToken}`);
        });
      }
      await page.waitForLoadState('domcontentloaded');

      if (!paymentData) {
        const token = page.url().split('/s/')[1]?.split('?')[0];
        // Đường đúng là /api/public/forms (B5)
        const statusRes = await request.get(`${baseURL}/api/public/forms/${form2Key}/submissions/${token}`);
        if (statusRes.ok()) {
          const body = await statusRes.json();
          paymentData = body?.data?.payment;
          accessToken = token;
        }
      }

      expect(paymentData).toBeTruthy();
      expect(paymentData.method).toBe('bank');
      expect(paymentData.amount).toBe(2000);
      expect(paymentData.code).toBeTruthy();
      expect(paymentData.qrString).toBeTruthy();

      // Kiểm tra chuẩn EMVCo TLV của chuỗi VietQR (B5)
      const emvTags = parseEmvco(paymentData.qrString);
      console.log('[Kịch bản C] Đã phân tích các tag EMVCo TLV:', Object.keys(emvTags));

      // Tag 54: Số tiền phải bằng 2000
      expect(emvTags['54']).toBe('2000');

      // Tag 38: Thông tin tài khoản nhận tiền phải chứa BIN và số tài khoản ngân hàng thật
      expect(emvTags['38']).toContain(BANK_BIN);
      expect(emvTags['38']).toContain(BANK_ACCOUNT);

      // Tag 62: Nội dung chuyển khoản phải chứa mã đặt lịch payment.code
      expect(emvTags['62']).toContain(paymentData.code);

      // Tag 63: CRC 4 ký tự - tính CRC-16/CCITT-FALSE trên chuỗi từ đầu tới hết '6304' (B4)
      expect(emvTags['63']).toBeTruthy();
      expect(emvTags['63'].length).toBe(4);
      const qrWithoutCrc = paymentData.qrString.slice(0, -4);
      const calculatedCrc = crc16CcittFalse(qrWithoutCrc);
      expect(emvTags['63'].toUpperCase()).toBe(calculatedCrc);

      // Kiểm tra hiển thị ảnh QR trên DOM iPhone (khớp với i18n publicForm.payment.qrAlt = "Mã QR chuyển khoản")
      const qrImg = page.locator('img[alt*="QR"]').or(page.locator('img[alt*="chuyển khoản"]')).first();
      await expect(qrImg).toBeVisible({ timeout: 15_000 });

      // Kiểm tra hiển thị các text trên DOM
      await expect(page.locator(`text=${paymentData.code}`).first()).toBeVisible({ timeout: 5000 });
      await expect(page.locator(`text=${BANK_ACCOUNT}`).first()).toBeVisible({ timeout: 5000 });

      // Kiểm tra responsive iPhone: không bị tràn ngang
      const isOverflowing = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 2;
      });
      expect(isOverflowing).toBe(false);

      await captureScreenshot(page, 'C3_payment_qr_iphone.png', 'Trang thanh toán QR hiển thị đẹp và chuẩn trên iPhone');

      recordReport({
        kichBan: 'C',
        buoc: 'C3_payment_qr_validation',
        ketQua: 'dat',
        ids: {
          formId: form2Id,
          formKey: form2Key,
          accessToken,
          paymentCode: paymentData.code,
        },
        extra: {
          qrStringHeader: paymentData.qrString.slice(0, 30),
          bankBin: paymentData.bankBin,
          bankName: paymentData.bankName,
          accountNumber: paymentData.accountNumber,
          accountName: paymentData.accountName,
          amount: paymentData.amount,
          emvTagsVerified: true,
          responsivePassed: !isOverflowing,
          luuY: 'Form 2 và bài nộp C3 được giữ lại để người dùng quét QR và chuyển 2.000đ thật kiểm tra đối soát.',
        },
      });
    } finally {
      await context.close();
    }
  });
});
