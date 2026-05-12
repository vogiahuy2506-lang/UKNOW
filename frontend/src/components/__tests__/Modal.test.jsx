import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Modal from '../Modal';

describe('Modal', () => {
  it('isOpen=false → không render gì (null)', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal isOpen={false} onClose={onClose} title="X">
        <p>Body</p>
      </Modal>
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText('X')).toBeNull();
  });

  it('isOpen=true → render title + children + close button qua portal vào body', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Confirm">
        <p data-testid="body">Bạn có chắc?</p>
      </Modal>
    );
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByTestId('body')).toBeInTheDocument();
  });

  it('click vào overlay → gọi onClose', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="T">
        <p>x</p>
      </Modal>
    );
    fireEvent.click(document.querySelector('.modal-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('click vào content (inner) → KHÔNG đóng (stopPropagation)', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="T">
        <p>x</p>
      </Modal>
    );
    fireEvent.click(document.querySelector('.modal-content'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('press Escape → gọi onClose', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="T">
        <p>x</p>
      </Modal>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('press key khác Escape → KHÔNG gọi onClose', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="T">
        <p>x</p>
      </Modal>
    );
    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'a' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('isOpen=true → body overflow=hidden; unmount → restore "unset"', () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <Modal isOpen={true} onClose={onClose} title="T">
        <p>x</p>
      </Modal>
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('unset');
  });

  it('size prop áp dụng đúng max-width class', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Modal isOpen={true} onClose={onClose} title="T" size="lg">
        <p>x</p>
      </Modal>
    );
    expect(document.querySelector('.modal-content').className).toContain('max-w-lg');

    rerender(
      <Modal isOpen={true} onClose={onClose} title="T" size="full">
        <p>x</p>
      </Modal>
    );
    expect(document.querySelector('.modal-content').className).toContain('max-w-full');
  });

  it('size không hợp lệ → fallback max-w-md', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="T" size="weird">
        <p>x</p>
      </Modal>
    );
    expect(document.querySelector('.modal-content').className).toContain('max-w-md');
  });

  it('click nút close button (icon X) → gọi onClose', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="T">
        <p>x</p>
      </Modal>
    );
    // 2 button có thể render: 1 ở header X, 1 không có. Lấy button trong header.
    const buttons = document.querySelectorAll('button');
    fireEvent.click(buttons[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
