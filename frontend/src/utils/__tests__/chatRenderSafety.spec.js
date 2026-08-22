/**
 * Chốt chặn cấu trúc cho việc render nội dung chat.
 *
 * renderTextWithLinks.spec.jsx đã phủ rất kỹ bản thân helper — nhưng nó KHÔNG bảo vệ
 * được nơi gọi. Ngày 22/08/2026, `PublicChatbotPage.jsx` nhét thẳng `msg.content` vào
 * `dangerouslySetInnerHTML` suốt một thời gian dài mà mọi test vẫn xanh, vì không test
 * nào chạm tới file đó. Trang này CÔNG KHAI, không cần đăng nhập (`/chat/:chatbotId`),
 * còn nội dung thì đến từ câu trả lời AI — thứ phản chiếu cả câu người dùng gõ lẫn tài
 * liệu Knowledge Base.
 *
 * Cùng lỗi đó còn tạo ra triệu chứng "lặp 2 link": nội dung sẵn có thẻ <a href="..."> bị
 * regex bọc thêm một lớp <a> nữa vì URL trong thuộc tính href không chứa dấu cách.
 *
 * Test này khoá ở mức tệp: các màn hình hiển thị tin nhắn không được phép dựng HTML thô.
 * Sửa cách render thì phải qua helper an toàn, đừng nới lỏng test này.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.resolve(SRC, '..');

/** Các nơi render nội dung tin nhắn do người dùng/AI sinh ra. */
const CHAT_RENDER_FILES = [
  'pages/public/PublicChatbotPage.jsx',
  'features/inbox/MessageThread.jsx',
  'pages/studio/ChatMessageArea.jsx',
  'pages/studio/ChatbotStudioPage.jsx',
];

describe('an toàn khi render nội dung chat', () => {
  it.each(CHAT_RENDER_FILES)(
    '%s không dùng dangerouslySetInnerHTML cho nội dung tin nhắn',
    (relPath) => {
      const full = path.join(SRC, relPath);
      expect(fs.existsSync(full), `Không tìm thấy ${relPath} — file đã đổi tên? Cập nhật danh sách trong test này.`).toBe(true);
      const source = fs.readFileSync(full, 'utf8');
      expect(source).not.toMatch(/dangerouslySetInnerHTML/);
    }
  );

  it('widget nhúng không dùng innerHTML để render nội dung tin nhắn', () => {
    // widget.js chạy trên WEBSITE CỦA KHÁCH HÀNG — lỗ XSS ở đây còn khó vá hơn, vì bản
    // widget cũ có thể đã được nhúng sẵn ở nhiều nơi. Nội dung tin phải đi qua
    // createElement + textContent, không bao giờ qua innerHTML.
    const source = fs.readFileSync(path.join(FRONTEND_ROOT, 'public/widget.js'), 'utf8');

    // Cho phép innerHTML dựng khung tĩnh (icon SVG, ô nhập, khung gõ...), nhưng cấm
    // gán biến nội dung tin nhắn vào innerHTML.
    expect(source).not.toMatch(/innerHTML\s*=\s*[^`'"]*\b(content|text|message|msg)\b/);

    // Và phải thật sự dựng link bằng DOM API.
    expect(source).toMatch(/createElement\(['"]a['"]\)/);
    expect(source).toMatch(/rel\s*=\s*['"]noopener noreferrer['"]/);
  });
});
