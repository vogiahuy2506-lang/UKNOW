import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../../i18n';
import CanvasEditor from '../CanvasEditor';
import HtmlFullPageEditor from '../HtmlFullPageEditor';

/**
 * BỐ CỤC MỚI (11/10/2026): thanh trên kiểu "Tạo landing page"; chế độ soạn + trạng thái hiển thị nằm trong modal Cài đặt;
 * hành động phụ nằm trong menu Công cụ. Ca ở đây khoá những điều bố cục mới hứa — còn hợp đồng dữ liệu nằm ở
 * `*.contract.spec.jsx`.
 */

vi.mock('../../services/landingCustomizerApi.service', () => ({
  default: {
    getOverrides: vi.fn(),
    saveOverrides: vi.fn(),
    getHtmlMode: vi.fn(),
    saveHtmlMode: vi.fn(),
    generateHomepageHtmlWithAi: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import api from '../../services/landingCustomizerApi.service';

const echo = (payload) => ({ data: { data: payload } });
const renderWith = (ui) => render(<I18nProvider>{ui}</I18nProvider>);
const selectElement = (editId) => act(() => {
  window.dispatchEvent(new MessageEvent('message', { data: { type: 'ELEMENT_CLICK', editId } }));
});

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  window.alert = vi.fn();
  api.getOverrides.mockResolvedValue({ data: { overrides: [] } });
  api.saveOverrides.mockResolvedValue({ data: {} });
  api.getHtmlMode.mockResolvedValue(echo({ displayMode: 'default', htmlContentVi: '<p>x</p>', htmlContentEn: '', cssContent: '' }));
  api.saveHtmlMode.mockImplementation(async (page, payload) => echo(payload));
});

describe('Canva Editor — bố cục thanh trên + Cài đặt', () => {
  it('thanh trên có tiêu đề, 3 trang, nút Cài đặt/Công cụ/Lưu; không còn khối tiêu đề to hay chữ tiếng Anh cứng', async () => {
    renderWith(<CanvasEditor />);
    await waitFor(() => expect(api.getOverrides).toHaveBeenCalled());
    expect(screen.getByText('Tuỳ chỉnh trang chủ')).toBeInTheDocument();
    expect(screen.getAllByRole('tab', { name: 'Trang Chủ' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('tab', { name: 'Trang Liên Hệ' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('tab', { name: 'Trang Bảng Giá' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Cài đặt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Công cụ/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeInTheDocument();
    for (const cu of ['Landing Page Editor', 'Click on any element', 'Preview Mode', 'Editor Mode']) {
      expect(screen.queryByText(new RegExp(cu))).not.toBeInTheDocument();
    }
  });

  it('chưa có thay đổi thì Lưu khoá; có thay đổi thì mở khoá (giống nút Lưu cũ chỉ hiện khi có thay đổi)', async () => {
    renderWith(<CanvasEditor />);
    await waitFor(() => expect(api.getOverrides).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled();
    selectElement('hero.tagline');
    fireEvent.change(await screen.findByPlaceholderText('Nhập nội dung...'), { target: { value: 'A' } });
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeEnabled();
  });

  it('Cài đặt: chọn "HTML Full" gọi onEditorModeChange("html"); thẻ chế độ đang dùng ở trạng thái pressed', async () => {
    const onMode = vi.fn();
    renderWith(<CanvasEditor editorMode="canva" onEditorModeChange={onMode} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cài đặt' }));
    const dialog = await screen.findByRole('dialog');
    const canva = within(dialog).getByRole('button', { name: /Canva Editor/ });
    const html = within(dialog).getByRole('button', { name: /HTML Full/ });
    expect(canva).toHaveAttribute('aria-pressed', 'true');
    expect(html).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(canva);
    expect(onMode).not.toHaveBeenCalled();
    fireEvent.click(html);
    expect(onMode).toHaveBeenCalledWith('html');
  });

  it('Cài đặt: hỏi (chỉ đọc) trang đang hiển thị bản nào; trang đang dùng HTML tuỳ chỉnh thì cảnh báo + lối sang HTML Full', async () => {
    api.getHtmlMode.mockResolvedValue(echo({ displayMode: 'html' }));
    const onMode = vi.fn();
    renderWith(<CanvasEditor editorMode="canva" onEditorModeChange={onMode} />);
    // chưa mở Cài đặt thì không gọi thêm API nào ngoài nạp giá trị
    await waitFor(() => expect(api.getOverrides).toHaveBeenCalled());
    expect(api.getHtmlMode).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cài đặt' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(api.getHtmlMode).toHaveBeenCalledWith('hero'));
    expect(await within(dialog).findByText('HTML tuỳ chỉnh')).toBeInTheDocument();
    expect(within(dialog).getByText(/chưa hiện ra/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mở HTML Full' }));
    expect(onMode).toHaveBeenCalledWith('html');
    expect(api.saveHtmlMode).not.toHaveBeenCalled(); // chỉ đọc, không ghi
  });

  it('lỗi hỏi trạng thái hiển thị không chặn gì: hiện "Chưa xác định"', async () => {
    api.getHtmlMode.mockRejectedValue(new Error('x'));
    renderWith(<CanvasEditor editorMode="canva" onEditorModeChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cài đặt' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Chưa xác định')).toBeInTheDocument();
  });

  it('menu Công cụ có Đặt lại (khoá khi chưa có thay đổi) và Mở trang công khai', async () => {
    renderWith(<CanvasEditor />);
    await waitFor(() => expect(api.getOverrides).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Công cụ/ }));
    expect(screen.getByRole('menuitem', { name: /Đặt lại thay đổi/ })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: /Mở trang công khai/ })).toBeEnabled();
  });

  it('chọn phần tử thì bảng thuộc tính hiện nhãn + ID; chưa chọn thì có gợi ý một dòng ở dải trên xem trước', async () => {
    renderWith(<CanvasEditor />);
    await waitFor(() => expect(api.getOverrides).toHaveBeenCalled());
    expect(screen.getByText(/Bấm vào chữ, nút hoặc màu trên trang để sửa/)).toBeInTheDocument();
    selectElement('hero.titleLine1');
    expect(await screen.findByText('ID: hero.titleLine1')).toBeInTheDocument();
    expect(screen.getByText('Đang chọn:')).toBeInTheDocument();
  });

  it('không còn alert() chặn trang khi lưu: báo bằng toast', async () => {
    renderWith(<CanvasEditor />);
    await waitFor(() => expect(api.getOverrides).toHaveBeenCalled());
    selectElement('hero.tagline');
    fireEvent.change(await screen.findByPlaceholderText('Nhập nội dung...'), { target: { value: 'A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(api.saveOverrides).toHaveBeenCalledTimes(2));
    expect(window.alert).not.toHaveBeenCalled();
  });
});

describe('HTML Full — bố cục thanh trên + Cài đặt', () => {
  const waitLoaded = () => waitFor(() => expect(screen.getByPlaceholderText(/Dán HTML Tiếng Việt/)).toHaveValue('<p>x</p>'));

  it('thanh trên: trang ở giữa; Cài đặt, Công cụ, Lưu, Lưu & bật HTML bên phải', async () => {
    renderWith(<HtmlFullPageEditor />);
    await waitLoaded();
    expect(screen.getByText('Tuỳ chỉnh trang chủ')).toBeInTheDocument();
    expect(screen.getAllByRole('tab', { name: 'Trang Chủ' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Cài đặt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Công cụ/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lưu & bật HTML/ })).toBeInTheDocument();
    // hàng nút phụ cũ đã vào Công cụ
    expect(screen.queryByRole('button', { name: 'Tải lại' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tạo bằng AI/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Công cụ/ }));
    for (const ten of [/^Lưu /, /Tạo bằng AI/, /Hiển thị mặc định/, /Tải lại/]) {
      expect(screen.getByRole('menuitem', { name: ten })).toBeInTheDocument();
    }
  });

  it('Cài đặt: trạng thái hiển thị của trang + nút bật/tắt (Lưu & bật HTML / Hiển thị mặc định) đúng payload và tự đóng modal', async () => {
    renderWith(<HtmlFullPageEditor editorMode="html" onEditorModeChange={() => {}} />);
    await waitLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Cài đặt' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Mặc định (React)')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /Lưu & bật HTML/ }));
    await waitFor(() => expect(api.saveHtmlMode).toHaveBeenCalledWith('hero', expect.objectContaining({ displayMode: 'html' })));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu' })).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: 'Cài đặt' }));
    const again = await screen.findByRole('dialog');
    expect(await within(again).findByText('HTML tuỳ chỉnh')).toBeInTheDocument();
    fireEvent.click(within(again).getByRole('button', { name: /Hiển thị mặc định/ }));
    await waitFor(() => expect(api.saveHtmlMode).toHaveBeenLastCalledWith('hero', expect.objectContaining({ displayMode: 'default' })));
  });

  it('Cài đặt: chọn "Canva Editor" gọi onEditorModeChange("canva")', async () => {
    const onMode = vi.fn();
    renderWith(<HtmlFullPageEditor editorMode="html" onEditorModeChange={onMode} />);
    await waitLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Cài đặt' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: /HTML Full/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(dialog).getByRole('button', { name: /Canva Editor/ }));
    expect(onMode).toHaveBeenCalledWith('canva');
  });

  it('đứng riêng (không có onEditorModeChange) thì Cài đặt không hiện phần đổi chế độ soạn', async () => {
    renderWith(<HtmlFullPageEditor />);
    await waitLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Cài đặt' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: /Canva Editor/ })).not.toBeInTheDocument();
  });

  it('xem trước và ô HTML cùng hiện (xếp dọc dưới lg, không còn ẩn xem trước ở màn hẹp)', async () => {
    renderWith(<HtmlFullPageEditor />);
    await waitLoaded();
    const frame = document.querySelector('iframe[title="HTML preview"]');
    expect(frame).not.toBeNull();
    expect(frame.closest('section')?.className).not.toMatch(/\bhidden\b/);
  });
});
