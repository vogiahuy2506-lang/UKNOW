import axios from 'axios';

/**
 * Đẩy 1 thành viên đăng ký sang Google Sheet qua Apps Script Web App (POST /exec).
 * Xem PLAN_SDT_BAT_BUOC_SYNC_SHEET_2026-09-02.md mục 2.2-2.3.
 *
 * BẮT BUỘC gọi KHÔNG `await` từ nơi gọi — y hệt cách `sendSystemEmail` được gọi ở
 * `auth.controller.js:128-139` (`.catch()` không `await`). Sheet chậm hoặc chết
 * không được phép làm chậm response đăng ký dù chỉ 1 giây, không chỉ là không lỗi.
 *
 * Thiếu MEMBER_SHEET_WEBHOOK_URL → tắt tính năng im lặng, resolve ngay, không gọi mạng.
 */

const TIMEOUT_MS = 5000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Che 4 số cuối — không log SĐT đầy đủ ra console (Bẫy #8 trong plan). */
function maskPhone(phone) {
  const s = String(phone || '');
  if (s.length <= 4) return '*'.repeat(s.length);
  return `${'*'.repeat(s.length - 4)}${s.slice(-4)}`;
}

/**
 * @param {{ email: string, phone: string, fullName?: string|null, createdAt?: string|Date|null }} member
 * @returns {Promise<void>}
 */
export async function pushMemberToSheet({ email, phone, fullName, createdAt }) {
  const url = process.env.MEMBER_SHEET_WEBHOOK_URL;
  const secret = process.env.MEMBER_SHEET_WEBHOOK_SECRET;

  if (!url) {
    // Tính năng tắt im lặng — chưa cấu hình URL từ Apps Script.
    return;
  }

  const body = new URLSearchParams({
    secret: secret || '',
    email: String(email || ''),
    phone: String(phone || ''),
    fullName: String(fullName || ''),
    createdAt: createdAt ? new Date(createdAt).toISOString() : new Date().toISOString(),
  });

  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      await axios.post(url, body, { timeout: TIMEOUT_MS });
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  throw new Error(
    `[MemberSheet] push thất bại sau ${MAX_RETRIES + 1} lần cho ${maskPhone(phone)}: ${lastErr?.message || lastErr}`
  );
}
