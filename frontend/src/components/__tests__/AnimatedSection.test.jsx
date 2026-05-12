import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import AnimatedSection from '../AnimatedSection';

/**
 * AnimatedSection dùng IntersectionObserver — JSDOM không có sẵn.
 * Tự mock IO toàn cục, đồng thời lưu callback để fire intersect khi cần.
 */
let observerInstances = [];
let lastCallback = null;

class MockIntersectionObserver {
  constructor(callback) {
    this.callback = callback;
    this.observe = vi.fn();
    this.disconnect = vi.fn();
    this.unobserve = vi.fn();
    observerInstances.push(this);
    lastCallback = callback;
  }
}

beforeEach(() => {
  observerInstances = [];
  lastCallback = null;
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('<AnimatedSection />', () => {
  it('mount mặc định ẩn (opacity=0, translateY 50px)', () => {
    render(<AnimatedSection><span data-testid="c">hello</span></AnimatedSection>);
    const div = screen.getByTestId('c').parentElement;
    expect(div.style.opacity).toBe('0');
    expect(div.style.transform).toBe('translateY(50px)');
  });

  it('observe được gọi với ref.current ngay sau mount', () => {
    render(<AnimatedSection><span>x</span></AnimatedSection>);
    expect(observerInstances).toHaveLength(1);
    expect(observerInstances[0].observe).toHaveBeenCalledTimes(1);
  });

  it('khi entry.isIntersecting=true → state isVisible → opacity 1 + translateY 0', () => {
    render(<AnimatedSection><span data-testid="c">x</span></AnimatedSection>);
    act(() => {
      lastCallback([{ isIntersecting: true }]);
    });
    const div = screen.getByTestId('c').parentElement;
    expect(div.style.opacity).toBe('1');
    expect(div.style.transform).toBe('translateY(0)');
  });

  it('entry.isIntersecting=false → giữ trạng thái ẩn', () => {
    render(<AnimatedSection><span data-testid="c">x</span></AnimatedSection>);
    act(() => {
      lastCallback([{ isIntersecting: false }]);
    });
    const div = screen.getByTestId('c').parentElement;
    expect(div.style.opacity).toBe('0');
  });

  it('delay prop set transitionDelay ms', () => {
    render(<AnimatedSection delay={400}><span data-testid="c">x</span></AnimatedSection>);
    const div = screen.getByTestId('c').parentElement;
    expect(div.style.transitionDelay).toBe('400ms');
  });

  it('className kèm class mặc định "transition-all duration-700"', () => {
    render(<AnimatedSection className="my-extra"><span data-testid="c">x</span></AnimatedSection>);
    const div = screen.getByTestId('c').parentElement;
    expect(div.className).toMatch(/transition-all/);
    expect(div.className).toMatch(/duration-700/);
    expect(div.className).toMatch(/my-extra/);
  });

  it('unmount → observer disconnect', () => {
    const { unmount } = render(<AnimatedSection><span>x</span></AnimatedSection>);
    const instance = observerInstances[0];
    unmount();
    expect(instance.disconnect).toHaveBeenCalledTimes(1);
  });
});
