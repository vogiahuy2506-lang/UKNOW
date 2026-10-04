import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

/** B-9: tin AI ở canvas có lỗi hiển thị do bộ đo thấy → câu tiếng người + nút "Trình bày lại" (trả phí 1 lượt AI). */
describe('ChatMessage — nút Trình bày lại khi bộ đo thấy lỗi hiển thị (B-9)', () => {
  const FINDING = { kind: 'text_covered', width: 1280, text: 'a', selector: 'p', overlapPx: 3 };
  const applied = (extra = {}) => ({ id: 'm9', role: 'ai', content: 'Đã đổi', status: 'applied', previousHtml: '<p>cũ</p>', suggestedHtml: '<p>mới</p>', ...extra });

  it('có layoutFindings → hiện câu đo + nút; bấm nút gọi onRelayout(msg.id)', () => {
    const onRelayout = vi.fn();
    render(<ChatMessage msg={applied({ layoutFindings: [FINDING], layoutNote: 'Còn 1 chỗ chữ bị che.' })} onRelayout={onRelayout} />);
    expect(screen.getByTestId('canvas-layout-note')).toBeTruthy();
    expect(screen.getByText('Còn 1 chỗ chữ bị che.')).toBeTruthy();
    fireEvent.click(screen.getByText('landingCanvas.chat.relayoutSection'));
    expect(onRelayout).toHaveBeenCalledWith('m9');
  });

  it('không có layoutFindings (sạch / chưa đo được / đã bấm) → không có khối này', () => {
    render(<ChatMessage msg={applied()} onRelayout={vi.fn()} />);
    expect(screen.queryByTestId('canvas-layout-note')).toBeNull();
  });

  it('không truyền onRelayout (nơi dùng khác) → không hiện nút dù có findings', () => {
    render(<ChatMessage msg={applied({ layoutFindings: [FINDING], layoutNote: 'x' })} />);
    expect(screen.queryByTestId('canvas-layout-note')).toBeNull();
  });
});
