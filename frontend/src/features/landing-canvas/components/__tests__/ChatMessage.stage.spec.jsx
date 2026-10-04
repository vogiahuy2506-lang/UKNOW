import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChatMessage from '../ChatMessage.jsx';

vi.mock('../../../../i18n', () => ({
  useI18n: (namespace = null) => {
    const t = (key) => (namespace ? `${namespace}.${key}` : key);
    if (namespace) return t;
    return { t, locale: 'vi' };
  },
}));

/** PR-9 (B-4): chữ tiến độ do server báo trên luồng sinh / sửa landing hiện thay cho "Thinking…" khi tin AI còn đang chờ. */
describe('ChatMessage — chữ tiến độ lượt sinh / sửa landing (PR-9)', () => {
  const aiMsg = (extra = {}) => ({ id: 'm1', role: 'ai', content: '', status: 'streaming', ...extra });

  it('chưa có stage → giữ chữ mặc định "Thinking…"', () => {
    render(<ChatMessage msg={aiMsg()} />);
    expect(screen.getByText('Thinking...')).toBeTruthy();
  });

  it.each([
    ['generating', 'landingCanvas.chat.stageGenerating'],
    ['fixing', 'landingCanvas.chat.stageFixing'],
    ['checking', 'landingCanvas.chat.stageChecking'],
  ])('stage %s → hiện chữ tương ứng', (stage, label) => {
    render(<ChatMessage msg={aiMsg({ stage })} />);
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByText('Thinking...')).toBeNull();
  });

  it('stage lạ (server thêm stage mới) → về "Thinking…", không hiện khoá i18n trần', () => {
    render(<ChatMessage msg={aiMsg({ stage: 'whatever' })} />);
    expect(screen.getByText('Thinking...')).toBeTruthy();
  });

  it('tin đã xong (không còn streaming) → không hiện chữ tiến độ, chỉ nội dung', () => {
    render(<ChatMessage msg={aiMsg({ status: 'applied', stage: 'generating', content: 'Đã tạo xong', previousHtml: '' })} />);
    expect(screen.getByText('Đã tạo xong')).toBeTruthy();
    expect(screen.queryByText('landingCanvas.chat.stageGenerating')).toBeNull();
  });
});
