/**
 * Chốt chặn cấu trúc cho các iframe hiển thị HTML do tenant/AI/bên thứ ba soạn (landing, email
 * template, bản xem trước). Luật:
 * - mọi iframe đều có thuộc tính `sandbox`;
 * - không bao giờ kết hợp `allow-scripts` với `allow-same-origin` (hai cờ này cùng nhau cho script
 *   trong trang chạy với origin của app, tức là bỏ sandbox);
 * - bản xem trước email/template không được có `allow-scripts`.
 *
 * Trình soạn landing của nền tảng (landing-customizer/CanvasEditor.jsx) chỉ hiển thị trang do nền
 * tảng sở hữu nên không nằm trong danh sách này.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PREVIEW_FILES = [
  { file: 'features/landing-canvas/components/CanvasPreviewView.jsx', scriptsAllowed: true },
  { file: 'features/landing-pages/components/LandingVersionModal.jsx', scriptsAllowed: true },
  { file: 'pages/public/components/MockChatbot.jsx', scriptsAllowed: true },
  { file: 'features/templates/components/EmailTemplatePreviewModal.jsx', scriptsAllowed: false },
  { file: 'features/templates/components/EmailTemplateEditorModal.jsx', scriptsAllowed: false },
  { file: 'features/campaigns/components/NodeConfigTemplatePreviewModal.jsx', scriptsAllowed: false },
  { file: 'features/ai/components/AiChatbotCards.jsx', scriptsAllowed: false },
];

const readIframes = (relPath) => {
  const full = path.join(SRC, relPath);
  expect(fs.existsSync(full), `Không tìm thấy ${relPath} — file đã đổi tên? Cập nhật danh sách trong test này.`).toBe(true);
  return fs.readFileSync(full, 'utf8').match(/<iframe\b[\s\S]*?\/>/g) || [];
};

describe('iframe xem trước HTML của tenant luôn có sandbox chặt', () => {
  it.each(PREVIEW_FILES)('$file', ({ file, scriptsAllowed }) => {
    const iframes = readIframes(file);
    expect(iframes.length).toBeGreaterThan(0);
    for (const tag of iframes) {
      const sandbox = tag.match(/\bsandbox="([^"]*)"/);
      expect(sandbox, `iframe thiếu sandbox:\n${tag}`).not.toBeNull();
      const tokens = sandbox[1].split(/\s+/).filter(Boolean);
      expect(tokens.includes('allow-scripts') && tokens.includes('allow-same-origin')).toBe(false);
      if (!scriptsAllowed) expect(tokens).not.toContain('allow-scripts');
    }
  });

  it('thẻ nháp template của trợ lý AI không chèn HTML bằng dangerouslySetInnerHTML', () => {
    const source = fs.readFileSync(path.join(SRC, 'features/ai/components/AiChatbotCards.jsx'), 'utf8');
    expect(source).not.toMatch(/dangerouslySetInnerHTML/);
  });
});
