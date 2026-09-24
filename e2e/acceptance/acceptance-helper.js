import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_BASE_DIR = path.resolve(__dirname, '..', 'acceptance-results');
const AUTH_FILE = path.resolve(__dirname, '..', '.auth', 'acceptance.json');

/**
 * Lấy thư mục kết quả của phiên chạy hiện tại (được tiến trình chính khởi tạo trong config)
 */
export function getRunDir() {
  if (process.env.ACCEPTANCE_RUN_DIR && fs.existsSync(process.env.ACCEPTANCE_RUN_DIR)) {
    return process.env.ACCEPTANCE_RUN_DIR;
  }
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const runDir = path.join(RESULTS_BASE_DIR, timestamp);
  fs.mkdirSync(runDir, { recursive: true });
  process.env.ACCEPTANCE_RUN_DIR = runDir;
  return runDir;
}

export function getReportFilePath() {
  return path.join(getRunDir(), 'report.json');
}

/**
 * Đọc access token Bearer từ file storageState (mục origins[].localStorage)
 * KHÔNG BAO GIỜ in token này ra log hoặc ghi vào report.json
 */
export function getStoredAccessToken() {
  if (!fs.existsSync(AUTH_FILE)) return null;
  try {
    const raw = fs.readFileSync(AUTH_FILE, 'utf8');
    const data = JSON.parse(raw);
    for (const origin of data.origins || []) {
      const match = origin.localStorage?.find((item) => item.name === 'accessToken');
      if (match?.value) return match.value;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Tài khoản chưa có SĐT: hộp thoại "Bổ sung số điện thoại" (vi.js phoneRequired.title/.later,
 * PhoneRequiredModal.jsx) bật lên ở MỖI lần tải trang và chặn mọi cú bấm. Đăng ký một handler để
 * Playwright tự bấm "Để sau" trước bất kỳ thao tác nào khi hộp thoại đó hiện — không nhập gì.
 * (Chạy production 25/09: bản cũ tìm nút theo /Đóng|Close|X|×/i nên bấm nhầm "Xác nhận" — chữ X.)
 * @param {import('@playwright/test').Page} page
 */
export async function dismissPhoneReminder(page) {
  const modal = page.locator('.modal-overlay').filter({ hasText: 'Bổ sung số điện thoại' });
  await page.addLocatorHandler(modal, async (overlay) => {
    await overlay.getByRole('button', { name: 'Để sau', exact: true }).click();
  });
}

/**
 * Tạo một request context của Playwright có gắn header Authorization: Bearer <token>
 * @param {import('@playwright/test').Playwright} playwright
 * @param {string} baseURL
 */
export async function createAuthenticatedContext(playwright, baseURL) {
  const token = getStoredAccessToken();
  if (!token) {
    throw new Error('Chưa có token đăng nhập trong storageState! Hãy chắc chắn project setup đã chạy thành công.');
  }
  return await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: {
      Authorization: `Bearer ${token}`,
    },
  });
}

/**
 * Ghi hoặc cập nhật một mục vào report.json
 * @param {object} item
 * @param {string} item.kichBan - 'A' | 'B' | 'C' | 'HE_THONG'
 * @param {string} item.buoc - tên bước kiểm tra
 * @param {'dat'|'khong_dat'|'skipped'|'cho_doi_chieu'} item.ketQua - kết quả
 * @param {string} [item.lyDo] - lý do nếu không đạt hoặc bỏ qua
 * @param {object} [item.ids] - danh sách ID (landing, form, submission, lịch...)
 * @param {object} [item.extra] - thông tin bổ sung (counts, credit, findings, rows...)
 */
export function recordReport(item) {
  const reportPath = getReportFilePath();
  let reports = [];
  if (fs.existsSync(reportPath)) {
    try {
      const content = fs.readFileSync(reportPath, 'utf8');
      reports = JSON.parse(content);
      if (!Array.isArray(reports)) reports = [reports];
    } catch {
      reports = [];
    }
  }

  // Cập nhật mục cũ nếu cùng kichBan và buoc, hoặc thêm mới
  const existingIdx = reports.findIndex((r) => r.kichBan === item.kichBan && r.buoc === item.buoc);
  const entry = {
    ...item,
    thoiGian: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    reports[existingIdx] = entry;
  } else {
    reports.push(entry);
  }

  fs.writeFileSync(reportPath, JSON.stringify(reports, null, 2), 'utf8');
  return entry;
}

/**
 * Chụp ảnh màn hình và lưu vào thư mục run
 * @param {import('@playwright/test').Page} page
 * @param {string} filename - tên file .png
 * @param {string} [description] - ghi chú ảnh
 */
export async function captureScreenshot(page, filename, description = '') {
  const runDir = getRunDir();
  const filePath = path.join(runDir, filename);
  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`[Ảnh chụp] ${filename}${description ? ` — ${description}` : ''}`);
  return filePath;
}

/**
 * Giải mã chuỗi EMVCo TLV (Tag-Length-Value) cho VietQR
 * @param {string} qrStr
 * @returns {Record<string, string>}
 */
export function parseEmvco(qrStr) {
  const tags = {};
  if (!qrStr || typeof qrStr !== 'string') return tags;

  let i = 0;
  while (i < qrStr.length - 4) {
    const id = qrStr.slice(i, i + 2);
    const len = parseInt(qrStr.slice(i + 2, i + 4), 10);
    if (Number.isNaN(len) || len <= 0) break;
    const val = qrStr.slice(i + 4, i + 4 + len);
    tags[id] = val;
    i = i + 4 + len;
  }
  // Tag 63 (CRC) là 4 ký tự cuối cùng
  if (i < qrStr.length && qrStr.slice(i, i + 2) === '63') {
    tags['63'] = qrStr.slice(i + 4, i + 8);
  }
  return tags;
}

/**
 * Tính CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF)
 * @param {string} str
 * @returns {string} 4 ký tự hex viết HOA
 */
export function crc16CcittFalse(str) {
  const buf = Buffer.from(String(str), 'utf8');
  let crc = 0xffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i] << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// ── Sổ dọn dẹp (Cleanup Registry) ──────────────────────────────────────────
const cleanupLedger = [];

/**
 * Đăng ký thực thể cần dọn dẹp hoặc theo dõi
 * @param {{ type: 'landing'|'form'|'submission'|'booking', id: string|number, skipAutoDelete?: boolean, note?: string }} entry
 */
export function registerCleanup(entry) {
  cleanupLedger.push({
    ...entry,
    registeredAt: new Date().toISOString(),
    status: entry.skipAutoDelete ? 'kept_for_manual_or_cron' : 'pending',
  });
  console.log(`[Sổ dọn dẹp] Đã đăng ký ${entry.type} ID=${entry.id}${entry.skipAutoDelete ? ' (GIỮ LẠI KHÔNG XOÁ TỰ ĐỘNG)' : ''}`);
}

/**
 * Chạy dọn dẹp các thực thể đã đăng ký qua API của app bằng authenticated request
 * @param {import('@playwright/test').APIRequestContext} authRequest
 * @param {string} baseUrl
 */
export async function executeCleanup(authRequest, baseUrl) {
  console.log('[Sổ dọn dẹp] Bắt đầu dọn dẹp các tài nguyên tạm sau khi kiểm tra...');
  for (const item of cleanupLedger) {
    if (item.skipAutoDelete) {
      console.log(`[Sổ dọn dẹp] Giữ lại ${item.type} ID=${item.id}: ${item.note || 'giữ lại theo yêu cầu'}`);
      continue;
    }

    try {
      if (item.type === 'form') {
        // DELETE /api/forms/:id (CASCADE xoá luôn submissions)
        const res = await authRequest.delete(`${baseUrl}/api/forms/${item.id}`);
        if (res.ok()) {
          item.status = 'deleted';
          console.log(`[Sổ dọn dẹp] Đã xoá form ID=${item.id}`);
        } else {
          item.status = 'delete_failed';
          item.error = `HTTP ${res.status()}`;
          console.warn(`[Sổ dọn dẹp] Không xoá được form ID=${item.id}: HTTP ${res.status()}`);
        }
      } else if (item.type === 'landing') {
        // DELETE /api/admin/landing-pages/:id
        const res = await authRequest.delete(`${baseUrl}/api/admin/landing-pages/${item.id}`);
        if (res.ok()) {
          item.status = 'deleted';
          console.log(`[Sổ dọn dẹp] Đã xoá landing ID=${item.id}`);
        } else {
          item.status = 'delete_failed';
          item.error = `HTTP ${res.status()}`;
          console.warn(`[Sổ dọn dẹp] Không xoá được landing ID=${item.id}: HTTP ${res.status()}`);
        }
      }
    } catch (err) {
      item.status = 'delete_error';
      item.error = err.message;
      console.warn(`[Sổ dọn dẹp] Lỗi khi xoá ${item.type} ID=${item.id}:`, err.message);
    }
  }

  recordReport({
    kichBan: 'HE_THONG',
    buoc: 'cleanup_summary',
    ketQua: cleanupLedger.every((i) => i.status === 'deleted' || i.skipAutoDelete) ? 'dat' : 'khong_dat',
    lyDo: cleanupLedger.some((i) => i.status.includes('failed') || i.status.includes('error'))
      ? 'Có thực thể không xoá tự động được, cần dọn tay'
      : undefined,
    extra: { cleanupLedger },
  });
}
