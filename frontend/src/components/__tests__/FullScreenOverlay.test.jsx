import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FullScreenOverlay from '../FullScreenOverlay';

describe('<FullScreenOverlay />', () => {
  it('isOpen=false → trả null, không render gì', () => {
    const { container } = render(
      <FullScreenOverlay isOpen={false}>
        <div data-testid="inner">child</div>
      </FullScreenOverlay>
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('inner')).not.toBeInTheDocument();
  });

  it('isOpen=true → render children qua portal vào document.body', () => {
    render(
      <FullScreenOverlay isOpen>
        <div data-testid="inner">Hello</div>
      </FullScreenOverlay>
    );
    const inner = screen.getByTestId('inner');
    expect(inner).toBeInTheDocument();
    expect(inner.textContent).toBe('Hello');
    expect(document.body.contains(inner)).toBe(true);
  });

  it('default backdropClassName "bg-black/30" + thêm className tuỳ chọn', () => {
    render(
      <FullScreenOverlay isOpen className="extra-cls" data-testid="ovl">
        <div data-testid="inner">x</div>
      </FullScreenOverlay>
    );
    const overlay = screen.getByTestId('inner').parentElement;
    expect(overlay.className).toMatch(/bg-black\/30/);
    expect(overlay.className).toMatch(/extra-cls/);
    expect(overlay.className).toMatch(/fixed inset-0/);
    expect(overlay.className).toMatch(/z-\[9999\]/);
  });

  it('backdropClassName custom ghi đè default', () => {
    render(
      <FullScreenOverlay isOpen backdropClassName="bg-red-500/50">
        <div data-testid="inner">x</div>
      </FullScreenOverlay>
    );
    const overlay = screen.getByTestId('inner').parentElement;
    expect(overlay.className).toMatch(/bg-red-500\/50/);
    expect(overlay.className).not.toMatch(/bg-black\/30/);
  });

  it('click vào backdrop → onBackdropClick gọi', async () => {
    const user = userEvent.setup();
    const onBackdropClick = vi.fn();
    render(
      <FullScreenOverlay isOpen onBackdropClick={onBackdropClick}>
        <div data-testid="inner">x</div>
      </FullScreenOverlay>
    );
    const overlay = screen.getByTestId('inner').parentElement;
    await user.click(overlay);
    expect(onBackdropClick).toHaveBeenCalledTimes(1);
  });
});
