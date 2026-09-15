import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusChip from '../StatusChip';

describe('StatusChip', () => {
  it('render children', () => {
    render(<StatusChip tone="good">Đang hoạt động</StatusChip>);
    expect(screen.getByText('Đang hoạt động')).toBeInTheDocument();
  });

  it('mỗi tone ra đúng class màu', () => {
    const cases = [
      ['good', 'text-emerald-700'],
      ['accent', 'text-orange-700'],
      ['muted', 'text-gray-500'],
      ['warning', 'text-amber-800'],
      ['danger', 'text-red-700'],
    ];
    for (const [tone, expectedClass] of cases) {
      const { unmount } = render(<StatusChip tone={tone}>{tone}</StatusChip>);
      expect(screen.getByText(tone)).toHaveClass(expectedClass);
      unmount();
    }
  });

  it('tone không hợp lệ → rơi về muted, không throw', () => {
    render(<StatusChip tone="khong-ton-tai">Mặc định</StatusChip>);
    expect(screen.getByText('Mặc định')).toHaveClass('text-gray-500');
  });
});
