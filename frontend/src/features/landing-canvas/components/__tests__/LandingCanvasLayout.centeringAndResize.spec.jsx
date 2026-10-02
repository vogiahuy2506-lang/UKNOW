import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LandingCanvasLayout from '../LandingCanvasLayout.jsx';

vi.mock('../../../../i18n', () => ({
  useI18n: (namespace = null) => {
    const t = (key) => {
      if (namespace === 'landingCanvas.chat') {
        if (key === 'title') return 'AI Assistant';
        if (key === 'send') return 'Gửi';
        if (key === 'placeholder') return 'Mô tả thay đổi bạn muốn…';
      }
      return namespace ? `${namespace}.${key}` : key;
    };
    if (namespace) return t;
    return { t, locale: 'vi' };
  },
}));

vi.mock('../../landing-pages/services/landingPagesAdminApi.service.js', () => ({
  generateLandingHtmlWithAi: vi.fn(),
  editLandingHtmlWithAi: vi.fn(),
}));

vi.mock('../../../storage/useStorageQuota', () => ({
  default: () => ({ usage: null }),
}));

vi.mock('../../../storage/storageEvents', () => ({
  notifyStorageQuotaRefresh: vi.fn(),
}));

describe('LandingCanvasLayout — Centered Chat & Resizable Panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('khi form.htmlContent rỗng và chưa có tin nhắn → hiển thị giao diện studio ở giữa trang', () => {
    const form = { title: 'Trang mới', htmlContent: '', slug: 'trang-moi' };
    const setForm = vi.fn();

    render(
      <LandingCanvasLayout
        form={form}
        setForm={setForm}
        editingId={null}
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
        activeModalTab={null}
        onOpenSettingTab={vi.fn()}
        onOpenTemplateGallery={vi.fn()}
        onOpenVisualEditor={vi.fn()}
        onOpenVersionHistory={vi.fn()}
        onOpenSaveTemplate={vi.fn()}
        onOpenImportHtml={vi.fn()}
      />
    );

    // Kiểm tra có badge studio và tiêu đề lớn ở giữa
    expect(screen.getByText('Trợ lý AI Thiết kế Landing Page')).toBeDefined();
    expect(screen.getByText('Bạn muốn tạo Landing Page gì hôm nay?')).toBeDefined();
    expect(screen.getByText('Tạo trang')).toBeDefined();

    // Có 6 thẻ gợi ý mẫu
    expect(screen.getByText('SaaS / Phần mềm')).toBeDefined();
    expect(screen.getByText('Khóa học online')).toBeDefined();

    // Có 2 nút tùy chọn khác
    expect(screen.getByText('Dán mã HTML')).toBeDefined();
    expect(screen.getByText('Thư viện mẫu')).toBeDefined();
  });

  it('khi form.htmlContent đã có nội dung → lùi về bên trái, xuất hiện thanh resizer và khu vực preview', () => {
    const form = {
      title: 'Trang đã có nội dung',
      htmlContent: '<div><h1>Trang giới thiệu sản phẩm</h1></div>',
      slug: 'trang-da-co-noi-dung',
    };
    const setForm = vi.fn();

    render(
      <LandingCanvasLayout
        form={form}
        setForm={setForm}
        editingId="lp-123"
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
        activeModalTab={null}
        onOpenSettingTab={vi.fn()}
        onOpenTemplateGallery={vi.fn()}
        onOpenVisualEditor={vi.fn()}
        onOpenVersionHistory={vi.fn()}
        onOpenSaveTemplate={vi.fn()}
        onOpenImportHtml={vi.fn()}
      />
    );

    // Không còn tiêu đề studio giữa trang
    expect(screen.queryByText('Bạn muốn tạo Landing Page gì hôm nay?')).toBeNull();

    // Xuất hiện header chat bên trái
    expect(screen.getByText('AI Assistant')).toBeDefined();

    // Xuất hiện thanh resizer phân cách
    const resizer = screen.getByRole('separator');
    expect(resizer).toBeDefined();
    expect(resizer.getAttribute('title')).toContain('Kéo để thay đổi kích thước khung chat');
  });

  it('thanh resizer cho phép kéo thay đổi độ rộng và lưu vào localStorage', () => {
    const form = {
      title: 'Trang test kéo',
      htmlContent: '<p>Nội dung trang</p>',
      slug: 'trang-test-keo',
    };

    render(
      <LandingCanvasLayout
        form={form}
        setForm={vi.fn()}
        editingId="lp-999"
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
        activeModalTab={null}
        onOpenSettingTab={vi.fn()}
        onOpenTemplateGallery={vi.fn()}
        onOpenVisualEditor={vi.fn()}
        onOpenVersionHistory={vi.fn()}
        onOpenSaveTemplate={vi.fn()}
        onOpenImportHtml={vi.fn()}
      />
    );

    const resizer = screen.getByRole('separator');

    // Giả lập mousedown, mousemove, mouseup
    fireEvent.mouseDown(resizer, { preventDefault: vi.fn() });
    fireEvent.mouseMove(window, { clientX: 520 });
    fireEvent.mouseUp(window);

    // Giá trị được lưu vào localStorage
    const savedWidth = localStorage.getItem('founder_ai_landing_canvas_chat_width');
    expect(savedWidth).toBeDefined();

    // Double click để reset về mặc định 460
    fireEvent.doubleClick(resizer);
    expect(localStorage.getItem('founder_ai_landing_canvas_chat_width')).toBe('460');
  });
});
