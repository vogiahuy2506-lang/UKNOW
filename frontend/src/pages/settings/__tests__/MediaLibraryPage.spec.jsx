import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { I18nProvider } from '../../../i18n';
import { STORAGE_CATEGORIES } from '../../../features/storage/storageCategories';
import MediaLibraryPage from '../MediaLibraryPage';

/**
 * Thư viện media phân loại theo "tệp dùng cho việc gì", không theo kênh:
 *  - tab "Tất cả tệp" (sổ lưu trữ, có dung lượng) — mọi category đều có nhãn;
 *  - tab "Tệp khách gửi" thay "Zalo / Facebook": huy hiệu nền tảng từng tệp, nói thật tệp nào nằm trên hệ thống;
 *  - tab "Tệp tin nhắn" đã gỡ (trùng category "Tin nhắn chat" của tab 1).
 * Mock api ở ranh giới đúng hình dạng thật `{ data: { success, data, categorySummary, pagination } }`.
 */
const mocks = vi.hoisted(() => ({ get: vi.fn(), del: vi.fn() }));

vi.mock('../../../services/api', () => ({ default: { get: mocks.get, delete: mocks.del } }));
// Chủ workspace (không phải nhân viên): được quản lý tệp. authStore thật kéo theo interceptor của api nên giả mỏng.
vi.mock('../../../stores/authStore', () => ({
  useAuthStore: (selector) => selector({ activeContext: null }),
}));

const pagination = { total: 1, page: 1, limit: 24, pages: 1 };
const reply = (body) => ({ data: { success: true, pagination, ...body } });

const allCategorySummary = STORAGE_CATEGORIES.map((item, index) => ({
  category: item.value, count: index + 1, totalBytes: (index + 1) * 1024,
}));

const channelItems = [
  { type: 'image', url: 'https://app.test/file/tele/download?preview=true', name: 'tele.png', platform: 'telegram', stored: true, size: 2048, messageId: 1 },
  { type: 'file', url: 'https://app.test/file/wa', name: 'bao-gia.pdf', platform: 'whatsapp', stored: true, size: 4096, messageId: 2 },
  { type: 'image', url: 'https://cdn.zalo.test/a.jpg', name: 'a.jpg', platform: 'zalo_personal', stored: false, messageId: 3 },
  { type: 'image', url: 'https://cdn.zalo.test/oa.jpg', name: 'oa.jpg', platform: 'zalo_oa', stored: false, messageId: 4 },
  { type: 'image', url: 'https://cdn.example/fb.jpg', name: 'fb.jpg', platform: 'facebook', stored: false, messageId: 5 },
];

const renderPage = () => render(
  <I18nProvider>
    <MediaLibraryPage />
  </I18nProvider>
);

describe('MediaLibraryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockImplementation(async (path) => {
      if (path === '/media-library/channels') return reply({ data: channelItems });
      return reply({ data: [], categorySummary: allCategorySummary });
    });
  });

  it('chỉ còn hai tab: "Tất cả tệp" và "Tệp khách gửi" — không còn "Tệp tin nhắn" / "Zalo / Facebook"', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: 'Tất cả tệp (Dung lượng)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tệp khách gửi' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tệp tin nhắn' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Zalo \/ Facebook/ })).toBeNull();
    // bộ lọc "nguồn" của tab cũ cũng đi theo: lọc theo danh mục là đủ
    expect(screen.queryByText('Tất cả nguồn')).toBeNull();
  });

  it('nhãn mọi category: thẻ tổng hợp và ô lọc không hiện mã thô', async () => {
    renderPage();
    // landing_asset / form_asset là hai category từng hiện mã thô
    expect((await screen.findAllByText('Ảnh landing page')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Tệp biểu mẫu').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Mẫu tin nhắn').length).toBeGreaterThan(0);
    expect(screen.queryByText('Mẫu Zalo')).toBeNull();

    for (const { value } of STORAGE_CATEGORIES) {
      expect(screen.queryByText(value), `category ${value} hiện mã thô`).toBeNull();
    }

    const select = screen.getByRole('combobox');
    const optionLabels = within(select).getAllByRole('option').map((option) => option.textContent);
    expect(optionLabels).toHaveLength(STORAGE_CATEGORIES.length + 1); // + "Tất cả danh mục"
    for (const { value } of STORAGE_CATEGORIES) {
      expect(within(select).getByRole('option', { name: (_, element) => element.value === value })).toBeInTheDocument();
    }
  });

  it('chọn một category trong ô lọc gọi API với đúng category', async () => {
    renderPage();
    await screen.findAllByText('Ảnh landing page');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'landing_asset' } });
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith(
      '/media-library/objects',
      { params: expect.objectContaining({ category: 'landing_asset' }) }
    ));
  });

  it('tab "Tệp khách gửi": mỗi tệp có huy hiệu nền tảng Telegram / WhatsApp / Zalo / Zalo OA (+ Facebook cũ)', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Tệp khách gửi' }));

    await waitFor(() => expect(screen.getAllByTestId('platform-badge')).toHaveLength(5));
    expect(screen.getAllByTestId('platform-badge').map((badge) => badge.textContent))
      .toEqual(['Telegram', 'WhatsApp', 'Zalo', 'Zalo OA', 'Facebook']);
    expect(mocks.get).toHaveBeenCalledWith('/media-library/channels', expect.anything());
  });

  it('nói đúng sự thật từng loại: Telegram/WhatsApp nằm trên hệ thống và tính dung lượng; Zalo chỉ là link', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Tệp khách gửi' }));
    await screen.findByText('tele.png');

    expect(screen.getAllByText(/Lưu trên hệ thống · tính dung lượng/)).toHaveLength(2);
    expect(screen.getByText(/Lưu trên hệ thống · tính dung lượng \(2\.0 KB\)|Lưu trên hệ thống · tính dung lượng \(2 KB\)/)).toBeInTheDocument();
    expect(screen.getAllByText('Link nền tảng · không tính dung lượng')).toHaveLength(3);

    const note = screen.getByText(/Tệp khách gửi qua Zalo và Zalo OA chỉ là link/);
    expect(note).toHaveTextContent('Telegram và WhatsApp được lưu trên hệ thống và có tính vào dung lượng');
    // không nhắc Facebook như kênh đang hỗ trợ
    expect(note.textContent).not.toMatch(/Facebook/);
  });

  it('không còn gọi endpoint của tab cũ GET /media-library', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Tệp khách gửi' }));
    await screen.findByText('tele.png');
    const paths = new Set(mocks.get.mock.calls.map(([path]) => path));
    expect([...paths].sort()).toEqual(['/media-library/channels', '/media-library/objects']);
  });
});
