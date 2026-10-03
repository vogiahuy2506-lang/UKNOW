/**
 * F2.5 (B-1) — khung xem trước landing KHÔNG được cùng nguồn với app.
 *
 * `allow-same-origin` trên iframe srcDoc làm tài liệu thừa hưởng origin của app (founderai.biz): script trong HTML landing đọc
 * được localStorage/sessionStorage (access token) và gọi `/api/…` với quyền người đang xem. HTML đó có thể đến từ nhân viên
 * sửa trang của chủ, landing Marketplace người bán, hoặc tài liệu đính kèm chèn lệnh vào HTML AI sinh.
 * Lý do duy nhất từng cần same-origin là hook `useElementSelection` (đọc `contentWindow.document`) — hook đó không ai import
 * và đã bị xoá; test cuối khoá việc không ai quay lại đọc DOM của khung xem trước.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import CanvasPreviewView from '../CanvasPreviewView.jsx';

vi.mock('../../../../i18n', () => ({
  useI18n: (namespace = null) => {
    const t = (key) => (namespace ? `${namespace}.${key}` : key);
    if (namespace) return t;
    return { t, locale: 'vi' };
  },
}));

const sandboxTokens = (iframe) => (iframe.getAttribute('sandbox') || '').split(/\s+/).filter(Boolean);

describe('CanvasPreviewView — sandbox của khung xem trước landing', () => {
  it('có allow-scripts (Tailwind CDN + script landing chạy) nhưng KHÔNG có allow-same-origin', () => {
    const { container } = render(
      <CanvasPreviewView
        srcDoc="<!DOCTYPE html><html><body><script>window.parent.localStorage.getItem('accessToken')</script></body></html>"
        viewport={{ width: 1280, height: 800 }}
        zoom={1}
        publicUrl=""
      />
    );
    const iframe = container.querySelector('iframe[title="Landing preview"]');
    expect(iframe).not.toBeNull();

    const tokens = sandboxTokens(iframe);
    expect(tokens).toContain('allow-scripts');
    expect(tokens).not.toContain('allow-same-origin');
  });

  it('vẫn giữ allow-forms + allow-popups để kiểm form và liên kết mở tab mới trong bản xem trước', () => {
    const { container } = render(
      <CanvasPreviewView srcDoc="<p>x</p>" viewport={{ width: 375, height: 667 }} zoom={0.5} publicUrl="https://a.founderai.biz" />
    );
    const tokens = sandboxTokens(container.querySelector('iframe'));
    expect(tokens).toEqual(expect.arrayContaining(['allow-scripts', 'allow-forms', 'allow-popups', 'allow-popups-to-escape-sandbox']));
  });
});

describe('khung xem trước landing không còn mã nào đọc DOM của iframe (không cần same-origin)', () => {
  const featuresDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

  const listSourceFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : listSourceFiles(full);
    return /\.(jsx?|tsx?)$/.test(entry.name) ? [full] : [];
  });

  it('landing-canvas + landing-pages không chạm contentDocument / contentWindow.document', () => {
    const offenders = [
      ...listSourceFiles(path.join(featuresDir, 'landing-canvas')),
      ...listSourceFiles(path.join(featuresDir, 'landing-pages')),
    ].filter((file) => /contentDocument|contentWindow\??\.document/.test(fs.readFileSync(file, 'utf8')));

    expect(offenders.map((f) => path.relative(featuresDir, f))).toEqual([]);
  });

  it('hook chết useElementSelection đã bị xoá', () => {
    expect(fs.existsSync(path.join(featuresDir, 'landing-canvas/hooks/useElementSelection.js'))).toBe(false);
  });
});
