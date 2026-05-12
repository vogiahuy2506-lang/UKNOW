import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';

const Bomb = ({ msg = 'boom' }) => {
  throw new Error(msg);
};

const Safe = () => <div data-testid="safe">All good</div>;

let consoleErrorSpy;
beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ErrorBoundary', () => {
  it('children không throw → render children bình thường', () => {
    render(
      <ErrorBoundary>
        <Safe />
      </ErrorBoundary>
    );
    expect(screen.getByTestId('safe')).toBeInTheDocument();
  });

  it('children throw → render fallback UI với message', () => {
    render(
      <ErrorBoundary>
        <Bomb msg="Crash test" />
      </ErrorBoundary>
    );
    expect(screen.getByText('Đã xảy ra lỗi')).toBeInTheDocument();
    expect(screen.getByText('Crash test')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Quay về trang chủ/i })).toBeInTheDocument();
  });

  it('error không có message → hiển thị fallback "Có lỗi không xác định"', () => {
    const NoMsg = () => {
      const err = new Error();
      err.message = '';
      throw err;
    };
    render(
      <ErrorBoundary>
        <NoMsg />
      </ErrorBoundary>
    );
    expect(screen.getByText('Có lỗi không xác định')).toBeInTheDocument();
  });

  it('click "Quay về trang chủ" → reset state + set location.href="/"', () => {
    // Stub window.location để verify side-effect.
    const originalLocation = window.location;
    delete window.location;
    window.location = { href: '/some-broken-page' };

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByRole('button', { name: /Quay về trang chủ/i }));
    expect(window.location.href).toBe('/');

    window.location = originalLocation;
  });

  it('componentDidCatch log lỗi qua console.error', () => {
    render(
      <ErrorBoundary>
        <Bomb msg="logged" />
      </ErrorBoundary>
    );
    // React tự log + boundary log thêm 1 lần với prefix.
    const calls = consoleErrorSpy.mock.calls.map((args) => args.join(' '));
    expect(calls.some((s) => s.includes('Error caught by boundary'))).toBe(true);
  });
});
