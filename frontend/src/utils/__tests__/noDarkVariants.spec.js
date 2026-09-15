/**
 * Chốt chặn tái diễn: app Founder AI chỉ có giao diện sáng (`tailwind.config.js` khai
 * `darkMode: 'class'`, không có công tắc nào bật lớp `dark` trên `<html>`). Trước sửa gốc
 * `663f0e40`, Tailwind mặc định `darkMode: 'media'` khiến ba màn hình đối tác tự đổi giao
 * diện theo chế độ tối của hệ điều hành người dùng — nền xanh đen giữa app nền trắng, chữ
 * vàng nhạt trên nền be không đủ tương phản. Xem
 * `_internal/PLAN_THIET_KE_LAI_TRANG_DOI_TAC_VA_KHUON_CHUNG_2026-09-15.md` mục 1.
 *
 * Quét TOÀN BỘ `src/**\/*.jsx` (trừ `__tests__`) tìm class Tailwind `dark:`.
 *
 * Regex phân biệt bằng CÁCH GÕ: class Tailwind trong className không bao giờ có khoảng
 * trắng ngay sau dấu `:` (`dark:bg-gray-800`, `dark:hover:text-white`) — Tailwind sẽ không
 * nhận diện được nếu có khoảng trắng ở đó. Một key object JS thì luôn có khoảng trắng sau
 * dấu `:` khi định dạng chuẩn (`dark: qrColor,`) — đây là trường hợp của thư viện QRCode
 * (tham số `color: { dark, light }` là màu tiền cảnh/nền của mã QR, không liên quan
 * Tailwind) ở `ChatbotSettingsComponents.jsx` và `ShareModal.jsx`. Không cần liệt kê
 * ngoại lệ theo tên file — cách gõ tự phân biệt đúng cả hai.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../..');

const DARK_CLASS_RE = /\bdark:[a-zA-Z0-9[]/;

function listJsxFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listJsxFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.jsx')) {
      out.push(full);
    }
  }
  return out;
}

describe('không còn class Tailwind dark: trong toàn bộ src (app chỉ có giao diện sáng)', () => {
  const files = listJsxFiles(SRC);

  it('quét được số file hợp lý (chốt chặn không âm thầm quét rỗng)', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it.each(files.map((f) => [path.relative(SRC, f), f]))('%s không có class dark:', (_rel, full) => {
    const source = fs.readFileSync(full, 'utf8');
    const matches = source.match(new RegExp(DARK_CLASS_RE, 'g'));
    expect(matches, `Còn class dark: trong ${path.relative(SRC, full)}: ${JSON.stringify(matches)}`).toBeNull();
  });

  it('không báo động nhầm object QR color {dark,light} — ChatbotSettingsComponents.jsx và ShareModal.jsx vẫn còn key đó', () => {
    const chatbotSettings = fs.readFileSync(
      path.join(SRC, 'features/chatbot/components/ChatbotSettingsComponents.jsx'),
      'utf8'
    );
    const shareModal = fs.readFileSync(
      path.join(SRC, 'features/forms/components/ShareModal.jsx'),
      'utf8'
    );
    expect(chatbotSettings).toMatch(/dark:\s*qrColor/);
    expect(shareModal).toMatch(/dark:\s*['"]#/);
  });
});
