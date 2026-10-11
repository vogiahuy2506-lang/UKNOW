import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../../i18n';
import CanvasEditor from '../CanvasEditor';
import { invoke } from './invoke';

/**
 * HỢP ĐỒNG DỮ LIỆU của trình soạn Canva (Tuỳ chỉnh Landing). 10/10/2026 một bản viết lại bố cục đã làm hỏng đúng chuỗi này
 * (đổi chữ ký `onChange(id, lang, value)` của PropertiesPanel, gọi `saveOverrides` thiếu `lang`) nên gõ/lưu không chạy.
 *
 * Ca ở đây chứng minh: chọn phần tử (tin ELEMENT_CLICK từ iframe) → gõ ở PropertiesPanel → giá trị vào state đúng
 * id + ngôn ngữ (đọc qua localStorage xem trước `landing_overrides_<page>` mà iframe dùng) → Lưu gọi
 * `landingCustomizerApiService.saveOverrides(page, lang, { [id]: { valueVi, valueEn } })` — mỗi ngôn ngữ một lần.
 * Test KHÔNG bám bố cục: nút Lưu/Đặt lại lộ trên thanh trên hay nằm trong menu Công cụ đều qua `invoke`.
 */

vi.mock('../../services/landingCustomizerApi.service', () => ({
  default: {
    getOverrides: vi.fn(),
    saveOverrides: vi.fn(),
    getHtmlMode: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import api from '../../services/landingCustomizerApi.service';
import toast from 'react-hot-toast';

const renderEditor = () => render(<I18nProvider><CanvasEditor /></I18nProvider>);

const selectElement = (editId) => {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'ELEMENT_CLICK', editId } }));
  });
};

const previewStore = (page) => JSON.parse(window.localStorage.getItem(`landing_overrides_${page}`) || '{}');

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.alert = vi.fn();
  api.getOverrides.mockResolvedValue({
    data: { overrides: [{ key: 'hero.tagline', valueVi: 'Cũ', valueEn: 'Old' }] },
  });
  api.saveOverrides.mockResolvedValue({ data: {} });
  api.getHtmlMode.mockResolvedValue({ data: { data: { displayMode: 'default' } } });
});

describe('CanvasEditor — hợp đồng dữ liệu chọn → gõ → xem trước → Lưu', () => {
  it('nạp giá trị đã lưu của trang theo ("hero","vi") rồi đổ vào PropertiesPanel khi chọn phần tử', async () => {
    renderEditor();
    await waitFor(() => expect(api.getOverrides).toHaveBeenCalledWith('hero', 'vi'));
    selectElement('hero.tagline');
    expect(await screen.findByPlaceholderText('Nhập nội dung...')).toHaveValue('Cũ');
    expect(screen.getByPlaceholderText('Enter content...')).toHaveValue('Old');
  });

  it('gõ ở ô Tiếng Việt/English ghi đúng id + lang vào state (xem trước), ngôn ngữ kia giữ nguyên', async () => {
    renderEditor();
    await waitFor(() => expect(api.getOverrides).toHaveBeenCalled());
    selectElement('hero.tagline');
    const vi_ = await screen.findByPlaceholderText('Nhập nội dung...');
    const en_ = screen.getByPlaceholderText('Enter content...');
    await waitFor(() => expect(vi_).toHaveValue('Cũ'));

    fireEvent.change(vi_, { target: { value: 'Xin chào mới' } });
    expect(screen.getByPlaceholderText('Nhập nội dung...')).toHaveValue('Xin chào mới');
    expect(previewStore('hero')).toMatchObject({ 'hero.tagline_vi': 'Xin chào mới', 'hero.tagline_en': 'Old' });

    fireEvent.change(en_, { target: { value: 'Hello new' } });
    expect(previewStore('hero')).toMatchObject({ 'hero.tagline_vi': 'Xin chào mới', 'hero.tagline_en': 'Hello new' });
  });

  it('Lưu gọi saveOverrides(page, lang, overrides) đúng chữ ký — một lần cho "vi", một lần cho "en"', async () => {
    renderEditor();
    await waitFor(() => expect(api.getOverrides).toHaveBeenCalled());
    selectElement('hero.tagline');
    const vi_ = await screen.findByPlaceholderText('Nhập nội dung...');
    await waitFor(() => expect(vi_).toHaveValue('Cũ'));
    fireEvent.change(vi_, { target: { value: 'Xin chào mới' } });
    fireEvent.change(screen.getByPlaceholderText('Enter content...'), { target: { value: 'Hello new' } });

    invoke(/^Lưu( thay đổi)?$/);

    await waitFor(() => expect(api.saveOverrides).toHaveBeenCalledTimes(2));
    const expected = { 'hero.tagline': { valueVi: 'Xin chào mới', valueEn: 'Hello new' } };
    expect(api.saveOverrides).toHaveBeenNthCalledWith(1, 'hero', 'vi', expected);
    expect(api.saveOverrides).toHaveBeenNthCalledWith(2, 'hero', 'en', expected);
  });

  it('textarea và màu đi qua cùng handler (id + lang): hero.subtitle, stats.numberColor', async () => {
    renderEditor();
    await waitFor(() => expect(api.getOverrides).toHaveBeenCalled());

    selectElement('hero.subtitle');
    const areaVi = await screen.findByPlaceholderText('Nhập nội dung...');
    fireEvent.change(areaVi, { target: { value: 'Phụ đề mới' } });
    expect(previewStore('hero')['hero.subtitle_vi']).toBe('Phụ đề mới');

    selectElement('stats.numberColor');
    const presets = await screen.findAllByTitle('#ef4444');
    fireEvent.click(presets[0]); // ô đầu = Tiếng Việt
    expect(previewStore('hero')['stats.numberColor_vi']).toBe('#ef4444');
    fireEvent.click(presets[1]); // ô sau = English
    expect(previewStore('hero')['stats.numberColor_en']).toBe('#ef4444');

    invoke(/^Lưu( thay đổi)?$/);
    await waitFor(() => expect(api.saveOverrides).toHaveBeenCalledTimes(2));
    const sent = api.saveOverrides.mock.calls[0][2];
    expect(sent['hero.subtitle']).toMatchObject({ valueVi: 'Phụ đề mới' });
    expect(sent['stats.numberColor']).toEqual({ valueVi: '#ef4444', valueEn: '#ef4444' });
  });

  it('đổi trang: nạp giá trị trang mới, đóng bảng thuộc tính, lưu theo trang đó', async () => {
    renderEditor();
    await waitFor(() => expect(api.getOverrides).toHaveBeenCalledWith('hero', 'vi'));
    selectElement('hero.tagline');
    await screen.findByPlaceholderText('Nhập nội dung...');

    api.getOverrides.mockResolvedValueOnce({ data: { overrides: [{ key: 'contact.title', valueVi: 'Liên hệ cũ', valueEn: 'Contact old' }] } });
    fireEvent.click(screen.getAllByRole('button', { name: /Liên h/i })[0]);

    await waitFor(() => expect(api.getOverrides).toHaveBeenCalledWith('contact', 'vi'));
    expect(screen.queryByPlaceholderText('Nhập nội dung...')).not.toBeInTheDocument();

    selectElement('contact.title');
    const input = await screen.findByPlaceholderText('Nhập nội dung...');
    await waitFor(() => expect(input).toHaveValue('Liên hệ cũ'));
    fireEvent.change(input, { target: { value: 'Liên hệ mới' } });

    invoke(/^Lưu( thay đổi)?$/);
    await waitFor(() => expect(api.saveOverrides).toHaveBeenCalledTimes(2));
    expect(api.saveOverrides).toHaveBeenNthCalledWith(1, 'contact', 'vi', { 'contact.title': { valueVi: 'Liên hệ mới', valueEn: 'Contact old' } });
    expect(api.saveOverrides).toHaveBeenNthCalledWith(2, 'contact', 'en', { 'contact.title': { valueVi: 'Liên hệ mới', valueEn: 'Contact old' } });
  });

  it('Đặt lại xoá thay đổi chưa lưu: không còn gì để lưu', async () => {
    renderEditor();
    await waitFor(() => expect(api.getOverrides).toHaveBeenCalled());
    selectElement('hero.tagline');
    const input = await screen.findByPlaceholderText('Nhập nội dung...');
    await waitFor(() => expect(input).toHaveValue('Cũ'));
    fireEvent.change(input, { target: { value: 'Sắp bỏ' } });

    invoke(/^(Reset|Đặt lại)/);
    expect(screen.getByPlaceholderText('Nhập nội dung...')).toHaveValue('');
    expect(api.saveOverrides).not.toHaveBeenCalled();
  });

  it('lưu lỗi thì báo lỗi (không nuốt) và nút Lưu dùng lại được', async () => {
    api.saveOverrides.mockRejectedValue(new Error('mạng đứt'));
    renderEditor();
    await waitFor(() => expect(api.getOverrides).toHaveBeenCalled());
    selectElement('hero.tagline');
    const input = await screen.findByPlaceholderText('Nhập nội dung...');
    await waitFor(() => expect(input).toHaveValue('Cũ'));
    fireEvent.change(input, { target: { value: 'Mới' } });

    invoke(/^Lưu( thay đổi)?$/);
    await waitFor(() => expect(window.alert.mock.calls.length + toast.error.mock.calls.length).toBeGreaterThan(0));
    const shown = JSON.stringify([...window.alert.mock.calls, ...toast.error.mock.calls]);
    expect(shown).toContain('mạng đứt');
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Lưu( thay đổi)?$/ })[0]).toBeEnabled());
  });
});
