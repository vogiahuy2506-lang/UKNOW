import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../../i18n', async () => (await import('../../../test/realI18n.js')).realI18nModule());

const { useThemeStore } = await import('../../../stores/themeStore');
const { default: ThemeToggleButton } = await import('../ThemeToggleButton');

const TO_DARK = 'Chuyển sang giao diện tối';
const TO_LIGHT = 'Chuyển sang giao diện sáng';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  useThemeStore.setState({ theme: 'light', isDark: false });
});

describe('ThemeToggleButton', () => {
  it('đang sáng -> nhãn "sang tối"; bấm -> lưu uknow_theme=dark, bật html.dark (jsdom ở "/" thuộc phạm vi tối), đổi nhãn', () => {
    render(<ThemeToggleButton />);

    fireEvent.click(screen.getByRole('button', { name: TO_DARK }));

    expect(localStorage.getItem('uknow_theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByRole('button', { name: TO_LIGHT })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: TO_LIGHT }));
    expect(localStorage.getItem('uknow_theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('title trùng aria-label (rê chuột thấy cùng câu), type=button để không submit form nếu đặt trong form', () => {
    render(<ThemeToggleButton />);
    const btn = screen.getByRole('button', { name: TO_DARK });
    expect(btn).toHaveAttribute('title', TO_DARK);
    expect(btn).toHaveAttribute('type', 'button');
  });

  it('variant onDark dùng chữ/hover sáng cố định (nền luôn tối); mặc định có biến thể dark: theo token dk-*', () => {
    const { rerender } = render(<ThemeToggleButton variant="onDark" className="ml-2" />);
    let btn = screen.getByRole('button', { name: TO_DARK });
    expect(btn).toHaveClass('hover:bg-white/15', 'text-slate-300', 'ml-2');
    expect(btn.className).not.toContain('dark:');

    rerender(<ThemeToggleButton />);
    btn = screen.getByRole('button', { name: TO_DARK });
    expect(btn).toHaveClass('dark:text-dk-text', 'dark:hover:bg-dk-raised');
  });
});
