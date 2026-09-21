/**
 * PLAN_LANDING_TU_KIEM_HIEN_THI_TU_SUA mục 12.3.6 — dải trạng thái kiểm tra hiển thị, nút "Trình bày
 * lại phần này", nút "Hoàn tác" trên thẻ landing. Dùng từ điển THẬT (vi) để kiểm đúng câu người dùng
 * thấy: KHÔNG class / pixel / CSS / selector, và `unknown` (chưa kiểm được) thì không hiện gì.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LandingPageCard from '../LandingPageCard';

vi.mock('../../../../i18n', async () => (await import('../../../../test/realI18n.js')).realI18nModule());

const finding = (over = {}) => ({
  kind: 'text_covered', width: 1280, text: '03/02/2026',
  selector: 'span.block.text-lg.font-extrabold:nth-of-type(1)',
  coveredBy: { text: '1', selector: 'div.absolute.-left-11.w-8:nth-of-type(1)' },
  overlapPx: 12, side: 'right', sectionTitle: 'Dòng thời gian', ...over,
});

const basePage = { title: 'Trang test', html: '<div>Nội dung landing</div>' };

const renderCard = (props = {}) => {
  const handlers = {
    onEditWithAi: props.onEditWithAi ?? vi.fn().mockResolvedValue(true),
    onRevert: props.onRevert ?? vi.fn().mockResolvedValue(true),
  };
  const utils = render(
    <MemoryRouter>
      <LandingPageCard
        page={{ ...basePage, ...(props.page || {}) }}
        messageId={props.messageId ?? 4242}
        messageIndex={props.messageIndex ?? 3}
        canSave
        onSaveAndPublish={vi.fn()}
        onGenerateNew={vi.fn()}
        {...handlers}
      />
    </MemoryRouter>,
  );
  return { ...handlers, ...utils };
};

const OK = 'Đã kiểm tra hiển thị ✓';
const CHECKING = 'Đang kiểm tra hiển thị…';
const RELAYOUT = 'Trình bày lại phần này · dùng 1 lượt AI';
const UNDO = 'Hoàn tác';

describe('LandingPageCard — dải kiểm tra hiển thị', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it('checking → "Đang kiểm tra hiển thị…", chưa có ✓', () => {
    renderCard({ page: { layoutStatus: 'checking' } });
    expect(screen.getByText(CHECKING)).toBeInTheDocument();
    expect(screen.queryByText(OK)).toBeNull();
    expect(screen.queryByText(RELAYOUT)).toBeNull();
  });

  it.each(['clean', 'fixed'])('%s → "Đã kiểm tra hiển thị ✓" rồi TỰ ẨN sau 4 giây', (status) => {
    vi.useFakeTimers();
    renderCard({ page: { layoutStatus: status } });
    expect(screen.getByText(OK)).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(3900); });
    expect(screen.getByText(OK)).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByText(OK)).toBeNull();
  });

  it('still_broken → câu tiếng người theo tên phần + nút "Trình bày lại phần này · dùng 1 lượt AI"', () => {
    renderCard({ page: { layoutStatus: 'still_broken', layoutFindings: [finding(), finding({ text: '26/04/2026' })] } });
    expect(screen.getByText('Còn 2 chỗ chữ bị che ở phần "Dòng thời gian".')).toBeInTheDocument();
    expect(screen.getByText(RELAYOUT)).toBeInTheDocument();
    expect(screen.queryByText(OK)).toBeNull();
  });

  it('still_broken KHÔNG lộ class / selector / pixel cho người dùng', () => {
    renderCard({
      page: {
        layoutStatus: 'still_broken',
        layoutFindings: [finding(), finding({ kind: 'text_clipped', overlapPx: 80, coveredBy: null }), finding({ kind: 'text_offscreen', width: 390, overlapPx: 44, coveredBy: null })],
      },
    });
    const strip = screen.getByTestId('landing-layout-strip');
    expect(strip.textContent).toContain('chữ bị che');
    expect(strip.textContent).toContain('chữ bị cắt');
    expect(strip.textContent).toContain('tràn ra ngoài màn hình');
    expect(strip.textContent).not.toMatch(/px|class|css|nth-of-type|absolute|\.block|text-lg|\d{2,}/i);
  });

  it('still_broken không có tên phần → câu chung', () => {
    renderCard({ page: { layoutStatus: 'still_broken', layoutFindings: [finding({ sectionTitle: '' })] } });
    expect(screen.getByText('Còn 1 chỗ chữ bị che.')).toBeInTheDocument();
  });

  it('bấm "Trình bày lại" → onEditWithAi với lệnh nêu đúng tên phần, đúng thẻ, bỏ qua bước đo trước', async () => {
    const { onEditWithAi } = renderCard({ page: { layoutStatus: 'still_broken', layoutFindings: [finding()] } });
    fireEvent.click(screen.getByText(RELAYOUT));
    await waitFor(() => expect(onEditWithAi).toHaveBeenCalledTimes(1));
    const [page, instruction, index, options] = onEditWithAi.mock.calls[0];
    expect(page.html).toBe(basePage.html);
    expect(index).toBe(3);
    expect(options).toEqual({ messageId: 4242, skipLayoutAudit: true });
    expect(instruction).toBe(
      'Dựng lại riêng phần "Dòng thời gian" bằng bố cục lưới đơn giản để chữ không bị che hay cắt, giữ nguyên toàn bộ chữ và các phần khác.',
    );
    // lệnh này hiện lại trong tin xác nhận nên không được chứa chữ kỹ thuật
    expect(instruction).not.toMatch(/absolute|toạ độ|px|class|css/i);
  });

  it('không có tên phần → lệnh "phần đang bị lỗi hiển thị"', async () => {
    const { onEditWithAi } = renderCard({ page: { layoutStatus: 'still_broken', layoutFindings: [finding({ sectionTitle: '' })] } });
    fireEvent.click(screen.getByText(RELAYOUT));
    await waitFor(() => expect(onEditWithAi).toHaveBeenCalled());
    expect(onEditWithAi.mock.calls[0][1]).toMatch(/^Dựng lại phần đang bị lỗi hiển thị/);
  });

  it.each([
    ['unknown', { layoutStatus: 'unknown' }],
    ['chưa có trạng thái', {}],
    ['still_broken nhưng findings rỗng', { layoutStatus: 'still_broken', layoutFindings: [] }],
    ['null', { layoutStatus: null }],
  ])('%s → KHÔNG hiện gì: không ✓, không câu lỗi, không nút, không dải', (_label, page) => {
    renderCard({ page });
    expect(screen.queryByTestId('landing-layout-strip')).toBeNull();
    for (const text of [OK, CHECKING, RELAYOUT, UNDO]) expect(screen.queryByText(text)).toBeNull();
    expect(screen.queryByText(/Còn \d+ chỗ/)).toBeNull();
  });
});

describe('LandingPageCard — Hoàn tác', () => {
  beforeEach(() => vi.clearAllMocks());

  it('canRevert=true → có nút "Hoàn tác", bấm gọi onRevert(page, index, { messageId })', async () => {
    const { onRevert } = renderCard({ page: { canRevert: true } });
    fireEvent.click(screen.getByText(UNDO));
    await waitFor(() => expect(onRevert).toHaveBeenCalledTimes(1));
    expect(onRevert.mock.calls[0][1]).toBe(3);
    expect(onRevert.mock.calls[0][2]).toEqual({ messageId: 4242 });
  });

  it('thẻ tải lại từ phiên (không cờ canRevert nhưng có previousHtml) → vẫn có nút', () => {
    renderCard({ page: { previousHtml: '<div>bản trước</div>' } });
    expect(screen.getByText(UNDO)).toBeInTheDocument();
  });

  it.each([
    ['canRevert=false (409 đã ẩn nút)', { canRevert: false, previousHtml: '<div>x</div>' }],
    ['previousHtml rỗng', { previousHtml: '  ' }],
    ['không có gì', {}],
  ])('%s → KHÔNG có nút', (_label, page) => {
    renderCard({ page });
    expect(screen.queryByText(UNDO)).toBeNull();
  });

  it('nút Hoàn tác đứng cạnh dải trạng thái, không cần dải ✓ đang hiện', () => {
    renderCard({ page: { canRevert: true, layoutStatus: 'unknown' } });
    expect(screen.getByText(UNDO)).toBeInTheDocument();
    expect(screen.queryByText(OK)).toBeNull();
  });
});
