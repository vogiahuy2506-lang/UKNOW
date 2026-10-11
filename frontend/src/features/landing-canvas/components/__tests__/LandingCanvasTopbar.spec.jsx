/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, review PR-5b-2b (16/09) → PR-5b-2c mục 4.
 *
 * Link "Mở Biểu mẫu của trang này" (`/app/forms/:id/edit`) chỉ hiện khi `form.linkedForms` (PR-6: danh sách,
 * trước đó khoá đơn `linkedFormId`) có phần tử (PR-5b-2b mục 7) đã ĐÚNG code từ trước, nhưng chưa có file spec nào cho
 * `LandingCanvasTopbar.jsx` (grep xác nhận trước khi viết) — đột biến ẩn/hiện sai điều kiện không
 * có ca nào bắt được. Bịt lỗ coverage này, không viết lại toàn bộ topbar.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import LandingCanvasTopbar from '../LandingCanvasTopbar.jsx';

vi.mock('../../../../i18n', () => ({
  useI18n: (namespace = null) => {
    const t = (key) => (namespace ? `${namespace}.${key}` : key);
    if (namespace) return t;
    return { t, locale: 'vi' };
  },
}));

const baseForm = { title: 'Landing test', linkedForms: [] };

const renderTopbar = (form) =>
  render(
    <LandingCanvasTopbar
      form={form}
      setForm={vi.fn()}
      editingId={1}
      saving={false}
      onClose={vi.fn()}
      onSave={vi.fn()}
      onOpenSettingTab={vi.fn()}
      onOpenTemplateGallery={vi.fn()}
      onOpenVisualEditor={vi.fn()}
      onOpenVersionHistory={vi.fn()}
      onOpenSaveTemplate={vi.fn()}
      onOpenImportHtml={vi.fn()}
    />
  );

describe('LandingCanvasTopbar — link Biểu mẫu gắn landing (PR-5b-2b mục 7)', () => {
  it('đúng MỘT biểu mẫu trong form.linkedForms → hiện link, trỏ đúng /app/forms/:id/edit, mở tab mới', () => {
    renderTopbar({ ...baseForm, linkedForms: [{ id: 42, title: 'Form A', publicKey: 'KA' }] });
    const link = screen.getByTitle('landingCanvas.topbar.openLinkedForm');
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/app/forms/42/edit');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  // PR-6: trang có NHIỀU biểu mẫu → không đoán "biểu mẫu nào", mở mục Biểu mẫu (danh sách đầy đủ ở Cài đặt trang).
  it('NHIỀU biểu mẫu → link trỏ /app/forms (danh sách), không phải biểu mẫu đầu tiên', () => {
    renderTopbar({
      ...baseForm,
      linkedForms: [
        { id: 42, title: 'Form A', publicKey: 'KA' },
        { id: 43, title: 'Form B', publicKey: 'KB' },
      ],
    });
    expect(screen.queryByTitle('landingCanvas.topbar.openLinkedForm')).toBeNull();
    const link = screen.getByTitle('landingCanvas.topbar.openLinkedForms');
    expect(link.getAttribute('href')).toBe('/app/forms');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('form.linkedForms rỗng → KHÔNG hiện link', () => {
    renderTopbar({ ...baseForm, linkedForms: [] });
    expect(screen.queryByTitle('landingCanvas.topbar.openLinkedForm')).toBeNull();
    expect(screen.queryByTitle('landingCanvas.topbar.openLinkedForms')).toBeNull();
  });

  it('form.linkedForms undefined (trang mới, chưa nạp) → KHÔNG hiện link', () => {
    renderTopbar({ title: 'Landing mới' });
    expect(screen.queryByTitle('landingCanvas.topbar.openLinkedForm')).toBeNull();
    expect(screen.queryByTitle('landingCanvas.topbar.openLinkedForms')).toBeNull();
  });

  it('showPreviewControls=true → render bộ điều khiển Xem trước, Mã HTML, Zoom, và nút Toàn cảnh', () => {
    render(
      <LandingCanvasTopbar
        form={{ title: 'Landing test' }}
        setForm={vi.fn()}
        showPreviewControls={true}
        previewMode="view"
        onPreviewModeChange={vi.fn()}
        viewport="desktop"
        onViewportChange={vi.fn()}
        zoom={1}
        onZoomChange={vi.fn()}
        isFitToScreen={false}
        onToggleFitToScreen={vi.fn()}
        isChatCollapsed={false}
        onToggleChat={vi.fn()}
      />
    );

    expect(screen.getByTitle('landingCanvas.canvasPreview.view')).toBeDefined();
    expect(screen.getByTitle('landingCanvas.canvasPreview.code')).toBeDefined();
    expect(screen.getByText('Fit')).toBeDefined();
    expect(screen.getByText('100%')).toBeDefined();
    expect(screen.getByTitle('landingCanvas.topbar.collapseChatTooltip')).toBeDefined();
  });
});
