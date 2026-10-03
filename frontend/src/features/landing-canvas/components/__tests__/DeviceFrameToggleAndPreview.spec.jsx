import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DeviceFrameToggle from '../DeviceFrameToggle.jsx';
import CanvasPreviewView from '../CanvasPreviewView.jsx';

vi.mock('../../../../i18n', () => ({
  useI18n: (namespace = null) => {
    const t = (key) => (namespace ? `${namespace}.${key}` : key);
    if (namespace) return t;
    return { t, locale: 'vi' };
  },
}));

describe('DeviceFrameToggle — Dropdown chọn thiết bị', () => {
  it('mặc định hiển thị nút chọn thiết bị hiện tại (Desktop)', () => {
    render(<DeviceFrameToggle value="desktop" onChange={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /desktop/i });
    expect(trigger).toBeDefined();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('click vào nút kích hoạt sẽ mở dropdown với đầy đủ 3 thiết bị và độ phân giải', () => {
    render(<DeviceFrameToggle value="desktop" onChange={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /desktop/i });
    fireEvent.click(trigger);

    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeDefined();
    expect(screen.getByText('1280 × 800 px')).toBeDefined();
    expect(screen.getByText('768 × 1024 px')).toBeDefined();
    expect(screen.getByText('375 × 667 px')).toBeDefined();
  });

  it('chọn một thiết bị khác (Mobile) sẽ gọi onChange("mobile") và đóng dropdown', () => {
    const onChange = vi.fn();
    render(<DeviceFrameToggle value="desktop" onChange={onChange} />);

    // Mở dropdown
    fireEvent.click(screen.getByRole('button', { name: /desktop/i }));

    // Click Mobile option
    const mobileOption = screen.getByRole('option', { name: /mobile/i });
    fireEvent.click(mobileOption);

    expect(onChange).toHaveBeenCalledWith('mobile');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('nhấn Escape sẽ đóng dropdown', () => {
    render(<DeviceFrameToggle value="desktop" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /desktop/i }));
    expect(screen.getByRole('listbox')).toBeDefined();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('CanvasPreviewView — Bố cục độ phân giải & Mở trong tab mới', () => {
  const dummyViewport = {
    key: 'desktop',
    width: 1280,
    height: 800,
    label: 'Desktop',
  };

  it('hiển thị thông số 1280 × 800 ở header trên cùng ngang hàng với Mở trong tab mới', () => {
    const { container } = render(
      <CanvasPreviewView
        srcDoc="<html><body>Hello</body></html>"
        viewport={dummyViewport}
        zoom={1}
        publicUrl="https://example.com/p/demo"
      />
    );

    // Kích thước 1280 × 800 có mặt ở phần trên
    expect(screen.getByText('1280 × 800')).toBeDefined();

    // Link mở trong tab mới có mặt
    const link = screen.getByText('landingCanvas.canvasPreview.openNewTab');
    expect(link).toBeDefined();
    expect(link.closest('a')?.getAttribute('href')).toBe('https://example.com/p/demo');

    // Không còn phần tử text-[11px] thừa thãi ở dưới iframe (iframe nằm ở phần tử con cuối cùng)
    const directChildren = container.firstChild.childNodes;
    // directChildren[0] là header chứa 1280 x 800 & link, directChildren[1] là iframe wrapper
    expect(directChildren.length).toBe(2);
  });

  it('khi publicUrl là null, vẫn hiển thị thông số ở header trên cùng và không có rác ở chân', () => {
    const { container } = render(
      <CanvasPreviewView
        srcDoc="<html><body>Hello</body></html>"
        viewport={dummyViewport}
        zoom={1}
        publicUrl={null}
      />
    );

    expect(screen.getByText('1280 × 800')).toBeDefined();
    expect(screen.queryByText('landingCanvas.canvasPreview.openNewTab')).toBeNull();
    expect(container.firstChild.childNodes.length).toBe(2);
  });
});
