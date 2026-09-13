import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsModal from '../SettingsModal.jsx';
import api from '../../../../services/api.js';
import * as landingPagesAdminApi from '../../../landing-pages/services/landingPagesAdminApi.service.js';

vi.mock('../../../../services/api.js');

vi.mock('../../../landing-pages/services/landingPagesAdminApi.service.js', async () => {
  const actual = await vi.importActual('../../../landing-pages/services/landingPagesAdminApi.service.js');
  return {
    ...actual,
    uploadLandingAsset: vi.fn(),
  };
});

vi.mock('../../../../i18n', () => ({
  useI18n: (namespace = null) => {
    const t = (key) => {
      if (namespace === 'landingCanvas.settingsModal') {
        const dict = {
          'sections.images.title': 'Ảnh của trang',
          'sections.images.hint': 'Muốn ảnh nằm đúng chỗ thì đính kèm trong chat',
          'sections.images.upload': 'Tải ảnh lên',
          'sections.images.uploading': 'Đang tải lên...',
          'sections.images.inPage': 'Đang có trong trang',
          'sections.images.justUploaded': 'Vừa tải lên',
          'sections.images.copyUrl': 'Sao chép URL',
          'sections.images.copied': 'Đã sao chép',
          'sections.images.insert': 'Chèn vào trang',
          'sections.images.inserted': 'Đã chèn',
          'sections.images.empty': 'Chưa có ảnh nào trong trang',
          'sections.images.onlyImages': 'Chỉ nhận file ảnh PNG, JPG, JPEG, WebP',
        };
        return dict[key] || key;
      }
      return namespace ? `${namespace}.${key}` : key;
    };
    if (namespace) return t;
    return { t, locale: 'vi' };
  },
}));

vi.mock('../../../storage/useStorageQuota', () => ({
  default: () => ({ usage: null }),
}));

vi.mock('../../../storage/storageEvents', () => ({
  notifyStorageQuotaRefresh: vi.fn(),
}));

vi.mock('../LeadFormConfigPanel.jsx', () => ({
  default: () => <div data-testid="lead-form-config-panel" />,
}));

describe('SettingsModal - Section Ảnh của trang (PR-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('html có 2 URL asset → liệt kê 2 trong danh sách "Đang có trong trang"', () => {
    const form = {
      title: 'Test page',
      slug: 'test-page',
      htmlContent: `
        <!DOCTYPE html>
        <html>
          <body>
            <img src="https://founderai.biz/lp-assets/uploads/1/landing/123_abc_logo.png" alt="logo" />
            <div class="banner">
              <img src="https://founderai.biz/lp-assets/uploads/1/landing/456_def_hero-banner.webp" />
            </div>
          </body>
        </html>
      `,
    };

    render(
      <SettingsModal
        open={true}
        onClose={vi.fn()}
        form={form}
        setForm={vi.fn()}
        editingId={10}
      />
    );

    expect(screen.getByText('Ảnh của trang')).toBeDefined();
    expect(screen.getByText('Đang có trong trang')).toBeDefined();
    expect(screen.getByText('logo.png')).toBeDefined();
    expect(screen.getByText('hero-banner.webp')).toBeDefined();
  });

  it('upload mock trả URL → xuất hiện ở "Vừa tải lên" và có thể sao chép URL', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          tempId: 'temp_img_123',
          originalName: 'new-product.jpg',
          contentType: 'image/jpeg',
          size: 1024,
        },
      },
    });

    vi.mocked(landingPagesAdminApi.uploadLandingAsset).mockResolvedValueOnce({
      url: 'https://founderai.biz/lp-assets/uploads/1/landing/789_xyz_new-product.jpg',
      storageKey: 'uploads/1/landing/789_xyz_new-product.jpg',
      originalName: 'new-product.jpg',
      sizeBytes: 1024,
    });

    const form = {
      title: 'Test page',
      slug: 'test-page',
      htmlContent: '<html><body><h1>No images yet</h1></body></html>',
    };

    render(
      <SettingsModal
        open={true}
        onClose={vi.fn()}
        form={form}
        setForm={vi.fn()}
        editingId={10}
      />
    );

    const file = new File(['fake-jpg'], 'new-product.jpg', { type: 'image/jpeg' });
    const fileInput = document.querySelector('input[type="file"][accept*=".png"]');
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Vừa tải lên')).toBeDefined();
      expect(screen.getByText('new-product.jpg')).toBeDefined();
    });

    // Test bấm "Sao chép URL"
    const copyBtn = screen.getByText('Sao chép URL');
    fireEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'https://founderai.biz/lp-assets/uploads/1/landing/789_xyz_new-product.jpg'
    );

  });

  it('bấm "Chèn vào trang" → htmlContent chứa <img src="<url>" trước </body>', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          tempId: 'temp_img_456',
          originalName: 'feature.png',
          contentType: 'image/png',
          size: 2048,
        },
      },
    });

    vi.mocked(landingPagesAdminApi.uploadLandingAsset).mockResolvedValueOnce({
      url: 'https://founderai.biz/lp-assets/uploads/1/landing/999_xyz_feature.png',
      storageKey: 'uploads/1/landing/999_xyz_feature.png',
      originalName: 'feature.png',
      sizeBytes: 2048,
    });

    const setForm = vi.fn();
    const form = {
      title: 'Test page',
      slug: 'test-page',
      htmlContent: '<!DOCTYPE html><html><body><h1>Title</h1></body></html>',
    };

    render(
      <SettingsModal
        open={true}
        onClose={vi.fn()}
        form={form}
        setForm={setForm}
        editingId={10}
      />
    );

    const file = new File(['fake-png'], 'feature.png', { type: 'image/png' });
    const fileInput = document.querySelector('input[type="file"][accept*=".png"]');

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Chèn vào trang')).toBeDefined();
    });

    const insertBtn = screen.getByText('Chèn vào trang');
    fireEvent.click(insertBtn);

    expect(setForm).toHaveBeenCalled();
    const updater = setForm.mock.calls[0][0];
    const updated = typeof updater === 'function' ? updater(form) : updater;

    expect(updated.htmlContent).toContain(
      '<img src="https://founderai.biz/lp-assets/uploads/1/landing/999_xyz_feature.png" alt="feature.png" class="mx-auto max-w-full h-auto" />'
    );
    // Khẳng định thẻ img được chèn TRƯỚC </body>
    const imgIndex = updated.htmlContent.indexOf('<img src="https://founderai.biz/lp-assets/uploads/1/landing/999_xyz_feature.png"');
    const bodyCloseIndex = updated.htmlContent.indexOf('</body>');
    expect(imgIndex).toBeGreaterThan(-1);
    expect(bodyCloseIndex).toBeGreaterThan(imgIndex);
  });
});
