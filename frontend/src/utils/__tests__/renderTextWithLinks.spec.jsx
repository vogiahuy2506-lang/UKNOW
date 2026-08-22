import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RenderTextWithLinks, splitTextAndLinks } from '../renderTextWithLinks';

describe('renderTextWithLinks utility', () => {
  describe('splitTextAndLinks', () => {
    it('trả về rỗng khi input là falsy', () => {
      expect(splitTextAndLinks('')).toEqual([]);
      expect(splitTextAndLinks(null)).toEqual([]);
      expect(splitTextAndLinks(undefined)).toEqual([]);
    });

    it('tách văn bản thường và URL chuẩn', () => {
      const parts = splitTextAndLinks('Truy cập https://uknow.vn để xem chi tiết');
      expect(parts).toEqual([
        { type: 'text', text: 'Truy cập ' },
        { type: 'link', url: 'https://uknow.vn', text: 'https://uknow.vn' },
        { type: 'text', text: ' để xem chi tiết' },
      ]);
    });

    it('tách dấu chấm cuối câu khỏi URL (không nuốt dấu chấm)', () => {
      const parts = splitTextAndLinks('Xem tại https://uknow.vn/pricing.');
      expect(parts).toEqual([
        { type: 'text', text: 'Xem tại ' },
        { type: 'link', url: 'https://uknow.vn/pricing', text: 'https://uknow.vn/pricing' },
        { type: 'text', text: '.' },
      ]);
    });

    it('tách các dấu câu khác ở cuối URL: phẩy, chấm than, chấm hỏi, chấm phẩy', () => {
      const parts = splitTextAndLinks('Có phải https://uknow.vn/faq?, hay https://uknow.vn/help!');
      expect(parts).toEqual([
        { type: 'text', text: 'Có phải ' },
        { type: 'link', url: 'https://uknow.vn/faq', text: 'https://uknow.vn/faq' },
        { type: 'text', text: '?, hay ' },
        { type: 'link', url: 'https://uknow.vn/help', text: 'https://uknow.vn/help' },
        { type: 'text', text: '!' },
      ]);
    });

    it('tách dấu ngoặc đơn bao quanh (https://a.com)', () => {
      const parts = splitTextAndLinks('Xem chi tiết (https://uknow.vn/guide)');
      expect(parts).toEqual([
        { type: 'text', text: 'Xem chi tiết (' },
        { type: 'link', url: 'https://uknow.vn/guide', text: 'https://uknow.vn/guide' },
        { type: 'text', text: ')' },
      ]);
    });

    it('giữ nguyên ngoặc đơn hợp lệ trong URL (Wikipedia format)', () => {
      const parts = splitTextAndLinks('Xem https://en.wikipedia.org/wiki/React_(software) ngay');
      expect(parts).toEqual([
        { type: 'text', text: 'Xem ' },
        { type: 'link', url: 'https://en.wikipedia.org/wiki/React_(software)', text: 'https://en.wikipedia.org/wiki/React_(software)' },
        { type: 'text', text: ' ngay' },
      ]);
    });
  });

  describe('RenderTextWithLinks React Component & Security (XSS protection)', () => {
    it('chống XSS: payload HTML <img onerror> hiển thị dưới dạng text thuần, không chạy mã', () => {
      const xssPayload = '<img src="x" onerror="alert(1)">';
      const { container } = render(<RenderTextWithLinks text={xssPayload} />);

      // Không được có phần tử <img> trong DOM
      expect(container.querySelector('img')).toBeNull();
      // Hiển thị nguyên vẹn chuỗi text an toàn
      expect(container.textContent).toBe(xssPayload);
    });

    it('chống XSS: script tag không được chèn vào DOM', () => {
      const scriptPayload = '<script>window.xss=true;</script>';
      const { container } = render(<RenderTextWithLinks text={scriptPayload} />);

      expect(container.querySelector('script')).toBeNull();
      expect(container.textContent).toBe(scriptPayload);
    });

    it('nội dung có chứa thẻ HTML <a> không bị lồng hai lớp link', () => {
      const htmlWithLink = 'Bấm vào <a href="https://uknow.vn">trang chủ</a> nhé';
      const { container } = render(<RenderTextWithLinks text={htmlWithLink} />);

      const links = container.querySelectorAll('a');
      expect(links).toHaveLength(1);
      expect(links[0].getAttribute('href')).toBe('https://uknow.vn');
      expect(links[0].textContent).toBe('https://uknow.vn');
      expect(container.textContent).toBe('Bấm vào <a href="https://uknow.vn">trang chủ</a> nhé');
    });

    it('link render có đầy đủ target="_blank" và rel="noopener noreferrer"', () => {
      const text = 'Xem tại https://uknow.vn ngay';
      render(<RenderTextWithLinks text={text} />);

      const link = screen.getByRole('link', { name: 'https://uknow.vn' });
      expect(link).toBeInTheDocument();
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      expect(link.getAttribute('href')).toBe('https://uknow.vn');
    });
  });
});
