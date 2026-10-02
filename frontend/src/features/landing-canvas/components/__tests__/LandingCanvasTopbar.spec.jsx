/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, review PR-5b-2b (16/09) → PR-5b-2c mục 4.
 *
 * Link "Mở Biểu mẫu của trang này" (`/app/forms/:id/edit`) chỉ hiện khi `form.linkedFormId` có
 * giá trị (PR-5b-2b mục 7) đã ĐÚNG code từ trước, nhưng chưa có file spec nào cho
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

const baseForm = { title: 'Landing test', linkedFormId: null };

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
  it('form.linkedFormId có giá trị → hiện link, trỏ đúng /app/forms/:id/edit, mở tab mới', () => {
    renderTopbar({ ...baseForm, linkedFormId: 42 });
    const link = screen.getByTitle('landingCanvas.topbar.openLinkedForm');
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/app/forms/42/edit');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('form.linkedFormId là null → KHÔNG hiện link', () => {
    renderTopbar({ ...baseForm, linkedFormId: null });
    expect(screen.queryByTitle('landingCanvas.topbar.openLinkedForm')).toBeNull();
  });

  it('form.linkedFormId undefined (trang mới, chưa nạp) → KHÔNG hiện link', () => {
    renderTopbar({ title: 'Landing mới' });
    expect(screen.queryByTitle('landingCanvas.topbar.openLinkedForm')).toBeNull();
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
    expect(screen.getByTitle('Thu gọn chat để xem toàn cảnh')).toBeDefined();
  });
});
