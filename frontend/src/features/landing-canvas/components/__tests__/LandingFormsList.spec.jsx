import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import LandingFormsList from '../LandingFormsList.jsx';
import viDict from '../../../../i18n/vi.js';
import enDict from '../../../../i18n/en.js';
import { fetchForms } from '../../../forms/services/formAdminApi.service.js';
import { buildFormSlotHtml } from '../../utils/landingFormLink.js';

vi.mock('../../../forms/services/formAdminApi.service.js', () => ({
  fetchForms: vi.fn(),
}));

/**
 * PR-6 (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11) — danh sách NHIỀU biểu mẫu của landing. Dùng từ điển vi.js thật (t trả khoá
 * thô khi thiếu bản dịch nên test bắt luôn lỗi thiếu khoá). Mọi thao tác chỉ ghi `htmlContent` / `linkedFormsPending` — không API.
 */
const makeT = (dict) => (key) => {
  let current = dict;
  for (const part of key.split('.')) current = current?.[part];
  return current !== undefined ? current : key;
};
const t = makeT(viDict);

const embed = (key) =>
  `<section data-founderai-form-section><div data-founderai-form="${key}"></div><script src="https://app.example/form-embed.js" defer></script></section>`;
const PAGE = (inner = '') => `<html><body><h1>Trang</h1>${inner}<footer>chân trang</footer></body></html>`;

const LINKED = [
  { id: 11, title: 'Đăng ký tư vấn', publicKey: 'K11', isPublished: true, kind: 'consult', position: 0, needsPaymentSetup: false },
  { id: 12, title: 'Thu cọc khoá học', publicKey: 'K12', isPublished: true, kind: 'payment', position: 1, needsPaymentSetup: true },
  { id: 13, title: 'Biểu mẫu tự chọn', publicKey: 'K13', isPublished: false, kind: null, position: 2, needsPaymentSetup: false },
];

const FORMS = [
  { id: 11, title: 'Đăng ký tư vấn', publicKey: 'K11', isPublished: true },
  { id: 21, title: 'Đăng ký khoá IELTS', publicKey: 'K21', isPublished: true },
  { id: 22, title: 'Biểu mẫu nháp', publicKey: 'K22', isPublished: false },
  { id: 23, title: 'Form bị khoá', publicKey: 'K23', isPublished: true, adminDisabledAt: '2026-10-01T00:00:00Z' },
];

let latest;
function Harness({ initial, editingId = 100, tr = t }) {
  const [form, setForm] = useState(initial);
  latest = form;
  return <LandingFormsList form={form} setForm={setForm} t={tr} editingId={editingId} />;
}
const renderList = (overrides = {}, editingId = 100, tr = t) => {
  const initial = { htmlContent: PAGE(), linkedForms: [], linkedFormsPending: [], ...overrides };
  latest = initial;
  return { initial, ...render(<Harness initial={initial} editingId={editingId} tr={tr} />) };
};
const rows = () => screen.queryAllByTestId('form-row');
const rowTitles = () => rows().map((r) => r.querySelector('p').textContent);
const htmlKinds = () =>
  [...latest.htmlContent.matchAll(/data-founderai-form-slot(?:="([a-z]*)")?|data-founderai-form="(\w+)"/g)].map((m) =>
    m[2] ? `embed:${m[2]}` : m[1] ?? 'bare'
  );

beforeEach(() => {
  fetchForms.mockReset();
  fetchForms.mockResolvedValue(FORMS);
});

describe('LandingFormsList — hiển thị', () => {
  it('trang chưa có biểu mẫu → câu gợi ý, đếm 0/20, nút "Thêm biểu mẫu"; chưa gọi API', () => {
    const { container } = renderList();

    expect(screen.getByTestId('forms-empty')).toBeInTheDocument();
    expect(screen.getByTestId('forms-count')).toHaveTextContent('(0)');
    expect(screen.getByRole('button', { name: 'Thêm biểu mẫu' })).toHaveAttribute('aria-expanded', 'false');
    expect(rows()).toHaveLength(0);
    expect(fetchForms).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('leadFormConfig.');
  });

  it('3 biểu mẫu đã lưu: tên, nhãn loại (kind), "Bản nháp", link mở sửa đúng /app/forms/:id/edit; biểu mẫu chủ chọn (kind null) = "Biểu mẫu có sẵn"', () => {
    const { container } = renderList({
      htmlContent: PAGE(`${embed('K11')}${embed('K12')}${embed('K13')}`),
      linkedForms: LINKED,
    });

    expect(rowTitles()).toEqual(['Đăng ký tư vấn', 'Thu cọc khoá học', 'Biểu mẫu tự chọn']);
    expect(screen.getByTestId('forms-count')).toHaveTextContent('(3)');
    const badges = screen.getAllByTestId('form-kind-badge').map((b) => b.textContent);
    expect(badges).toEqual(['Đăng ký tư vấn', 'Thu tiền / đặt cọc', 'Biểu mẫu có sẵn']);
    expect(within(rows()[2]).getByText('Bản nháp')).toBeInTheDocument();
    expect(within(rows()[0]).queryByText('Bản nháp')).not.toBeInTheDocument();
    expect(within(rows()[0]).getByRole('link', { name: /Mở sửa biểu mẫu/ })).toHaveAttribute('href', '/app/forms/11/edit');
    expect(within(rows()[1]).getAllByRole('link')[0]).toHaveAttribute('href', '/app/forms/12/edit');
    expect(container.textContent).not.toContain('leadFormConfig.');
  });

  it('QĐ4 cờ "cần bổ sung": CHỈ biểu mẫu thu tiền chưa khai tiền/tài khoản có nhắc + link mở biểu mẫu để điền', () => {
    renderList({ htmlContent: PAGE(`${embed('K11')}${embed('K12')}`), linkedForms: LINKED.slice(0, 2) });

    const notices = screen.getAllByTestId('needs-payment-setup');
    expect(notices).toHaveLength(1);
    expect(rows()[1]).toContainElement(notices[0]);
    expect(notices[0]).toHaveTextContent('Cần bổ sung: điền số tiền và tài khoản nhận tiền để bật thu tiền.');
    expect(within(notices[0]).getByRole('link', { name: /Mở biểu mẫu để điền/ })).toHaveAttribute('href', '/app/forms/12/edit');
    expect(within(rows()[0]).queryByTestId('needs-payment-setup')).not.toBeInTheDocument();
  });

  it('chỗ trống CÓ LOẠI (chưa lưu) hiện "Biểu mẫu mới: <loại>" + nhãn "Tạo khi lưu trang"; chỗ trống trần = Đăng ký tư vấn; khoá lạ (dán tay) = external vẫn bỏ được', () => {
    renderList({
      htmlContent: PAGE(`${buildFormSlotHtml('booking')}<div data-founderai-form-slot></div>${embed('ZZZ')}`),
    });

    expect(rowTitles()).toEqual([
      'Biểu mẫu mới: Đặt lịch hẹn',
      'Biểu mẫu mới: Đăng ký tư vấn',
      'Biểu mẫu nhúng trong HTML (không thuộc tài khoản này)',
    ]);
    expect(screen.getAllByText('Tạo khi lưu trang')).toHaveLength(2);
    expect(rows()[0]).toHaveAttribute('data-source', 'new');
    expect(rows()[2]).toHaveAttribute('data-source', 'external');
    // dòng chưa có id thật → không có link mở sửa
    expect(within(rows()[0]).queryByRole('link')).not.toBeInTheDocument();
    expect(within(rows()[2]).getByRole('button', { name: /Bỏ khỏi trang/ })).toBeEnabled();
  });

  it('loại chỗ trống LẠ → cảnh báo trang sẽ không lưu được (backend 400), vẫn có nút xoá chỗ trống đó', () => {
    renderList({ htmlContent: PAGE('<div data-founderai-form-slot="contact"></div>') });

    expect(screen.getByTestId('invalid-kind')).toHaveTextContent('Loại "contact" không hợp lệ');
    fireEvent.click(within(rows()[0]).getByRole('button', { name: /Bỏ khỏi trang/ }));
    expect(latest.htmlContent).not.toContain('data-founderai-form-slot');
    expect(rows()).toHaveLength(0);
  });

  it('có bản tiếng Anh cho mọi khoá của danh sách (không lộ khoá thô)', async () => {
    const { container } = renderList(
      { htmlContent: PAGE(`${embed('K12')}${buildFormSlotHtml('survey')}`), linkedForms: [LINKED[1]], linkedFormsPending: [{ formId: 30, publicKey: 'K30', title: 'Có sẵn' }] },
      100,
      makeT(enDict)
    );
    fireEvent.click(screen.getByTestId('add-form-toggle'));
    await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled()); // chờ tải danh sách xong rồi mới kiểm

    expect(container.textContent).not.toContain('leadFormConfig.');
    expect(screen.getByText('Forms on this page')).toBeInTheDocument();
    expect(screen.getByTestId('needs-payment-setup')).toHaveTextContent('To complete');
  });
});

describe('LandingFormsList — bỏ / đổi thứ tự (chỉ sửa HTML, không API)', () => {
  it('bỏ biểu mẫu đã lưu → khối nhúng của ĐÚNG biểu mẫu đó biến khỏi HTML, các khối khác + nội dung trang nguyên vẹn', () => {
    renderList({ htmlContent: PAGE(`${embed('K11')}${embed('K12')}${embed('K13')}`), linkedForms: LINKED });

    fireEvent.click(within(rows()[1]).getByRole('button', { name: /Bỏ khỏi trang: Thu cọc khoá học/ }));

    expect(rowTitles()).toEqual(['Đăng ký tư vấn', 'Biểu mẫu tự chọn']);
    expect(htmlKinds()).toEqual(['embed:K11', 'embed:K13']);
    expect(latest.htmlContent).toContain('<h1>Trang</h1>');
    expect(latest.htmlContent).toContain('<footer>chân trang</footer>');
    // biểu mẫu + bài nộp không bị xoá ở server: danh sách linkedForms của server không đổi
    expect(latest.linkedForms).toEqual(LINKED);
    expect(fetchForms).not.toHaveBeenCalled();
  });

  it('đổi thứ tự: lên/xuống đổi chỗ khối; nút lên của dòng đầu và nút xuống của dòng cuối bị khoá', () => {
    renderList({ htmlContent: PAGE(`${embed('K11')}${embed('K12')}${embed('K13')}`), linkedForms: LINKED });

    expect(within(rows()[0]).getByRole('button', { name: /Di chuyển lên/ })).toBeDisabled();
    expect(within(rows()[2]).getByRole('button', { name: /Di chuyển xuống/ })).toBeDisabled();

    fireEvent.click(within(rows()[2]).getByRole('button', { name: /Di chuyển lên/ }));
    expect(rowTitles()).toEqual(['Đăng ký tư vấn', 'Biểu mẫu tự chọn', 'Thu cọc khoá học']);
    expect(htmlKinds()).toEqual(['embed:K11', 'embed:K13', 'embed:K12']);

    fireEvent.click(within(rows()[0]).getByRole('button', { name: /Di chuyển xuống/ }));
    expect(htmlKinds()).toEqual(['embed:K13', 'embed:K11', 'embed:K12']);
  });

  it('thao tác chỉ chạm HTML: bỏ rồi thêm lại giữ nguyên state khác (linkedFormsPending, linkedForms)', () => {
    renderList({
      htmlContent: PAGE(`${embed('K11')}`),
      linkedForms: [LINKED[0]],
      linkedFormsPending: [{ formId: 30, publicKey: 'K30', title: 'Có sẵn' }],
    });
    fireEvent.click(within(rows()[0]).getByRole('button', { name: /Bỏ khỏi trang/ }));
    expect(latest.linkedFormsPending).toEqual([{ formId: 30, publicKey: 'K30', title: 'Có sẵn' }]);
    expect(latest.linkedForms).toEqual([LINKED[0]]);
  });

});

describe('LandingFormsList — thêm biểu mẫu', () => {
  it('bấm "Thêm biểu mẫu" mở khung có 2 phần (dùng biểu mẫu đã tạo / tạo mới theo mẫu) và tải danh sách biểu mẫu ĐÚNG MỘT lần; "Đóng" thu lại', async () => {
    renderList();

    fireEvent.click(screen.getByRole('button', { name: 'Thêm biểu mẫu' }));
    expect(screen.getByTestId('add-form-panel')).toBeInTheDocument();
    expect(screen.getByTestId('add-existing')).toBeInTheDocument();
    expect(screen.getByTestId('add-new')).toBeInTheDocument();
    await waitFor(() => expect(fetchForms).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByTestId('add-form-panel')).not.toBeInTheDocument();
  });

  it('"Tạo mới theo mẫu": đủ 5 loại; bấm một loại → chèn chỗ trống CÓ LOẠI sau khối biểu mẫu cuối, thêm một dòng "Tạo khi lưu trang", không gọi API', async () => {
    renderList({ htmlContent: PAGE(embed('K11')), linkedForms: [LINKED[0]] });
    fireEvent.click(screen.getByTestId('add-form-toggle'));

    for (const kind of ['consult', 'booking', 'payment', 'survey', 'blank']) {
      expect(screen.getByTestId(`add-new-${kind}`)).toBeEnabled();
    }
    fireEvent.click(screen.getByTestId('add-new-booking'));
    fireEvent.click(screen.getByTestId('add-new-payment'));

    expect(htmlKinds()).toEqual(['embed:K11', 'booking', 'payment']);
    expect(latest.htmlContent).toContain('<div data-founderai-form-slot="booking"></div>');
    expect(latest.htmlContent.indexOf('"booking"')).toBeGreaterThan(latest.htmlContent.indexOf('K11'));
    expect(latest.htmlContent.indexOf('"booking"')).toBeLessThan(latest.htmlContent.indexOf('<footer>'));
    expect(rowTitles()).toEqual(['Đăng ký tư vấn', 'Biểu mẫu mới: Đặt lịch hẹn', 'Biểu mẫu mới: Thu tiền / đặt cọc']);
    expect(screen.getByTestId('forms-count')).toHaveTextContent('(3)');
    await waitFor(() => expect(fetchForms).toHaveBeenCalledTimes(1)); // chỉ lần tải danh sách khi mở khung
  });

  it('"Dùng biểu mẫu đã tạo": danh sách loại biểu mẫu đã có trên trang; nháp ghi chú xuất bản khi lưu, bị khoá mờ; chọn + "Thêm vào trang" → dòng chờ gắn, CHỈ ghi linkedFormsPending', async () => {
    renderList({
      htmlContent: PAGE(embed('K11')),
      linkedForms: [LINKED[0]],
    });
    fireEvent.click(screen.getByTestId('add-form-toggle'));
    const select = await screen.findByRole('combobox');
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Đăng ký khoá IELTS' })).toBeInTheDocument());

    // biểu mẫu đã nằm trên trang (K11) không có trong danh sách chọn
    expect(within(select).queryByRole('option', { name: 'Đăng ký tư vấn' })).not.toBeInTheDocument();
    const draft = within(select).getByRole('option', { name: /Biểu mẫu nháp/ });
    expect(draft).toBeEnabled();
    expect(draft).toHaveTextContent('bản nháp');
    expect(within(select).getByRole('option', { name: /Form bị khoá/ })).toBeDisabled();
    expect(screen.getByRole('link', { name: /Tạo biểu mẫu mới/ })).toHaveAttribute('href', '/app/forms/new');
    expect(screen.getByTestId('add-existing-button')).toBeDisabled(); // chưa chọn gì

    const htmlBefore = latest.htmlContent;
    fireEvent.change(select, { target: { value: '21' } });
    fireEvent.click(screen.getByTestId('add-existing-button'));

    expect(latest.linkedFormsPending).toEqual([{ formId: 21, publicKey: 'K21', title: 'Đăng ký khoá IELTS' }]);
    expect(latest.htmlContent).toBe(htmlBefore); // HTML chưa đổi — backend nối khối nhúng vào cuối trang khi lưu
    expect(rowTitles()).toEqual(['Đăng ký tư vấn', 'Đăng ký khoá IELTS']);
    expect(rows()[1]).toHaveAttribute('data-source', 'pending');
    expect(within(rows()[1]).getByText('Gắn khi lưu trang')).toBeInTheDocument();
    // biểu mẫu vừa thêm không còn trong danh sách chọn; ô chọn về trạng thái trống
    expect(within(select).queryByRole('option', { name: 'Đăng ký khoá IELTS' })).not.toBeInTheDocument();
    expect(select).toHaveValue('');
  });

  it('bỏ dòng "chờ gắn" → bỏ khỏi linkedFormsPending, HTML không đổi', async () => {
    const { initial } = renderList({ linkedFormsPending: [{ formId: 21, publicKey: 'K21', title: 'Đăng ký khoá IELTS' }] });
    expect(rows()).toHaveLength(1);
    // dòng chờ gắn không có nút đổi thứ tự (chưa có trong HTML)
    expect(within(rows()[0]).queryByRole('button', { name: /Di chuyển/ })).not.toBeInTheDocument();

    fireEvent.click(within(rows()[0]).getByRole('button', { name: /Bỏ khỏi trang/ }));

    expect(latest.linkedFormsPending).toEqual([]);
    expect(latest.htmlContent).toBe(initial.htmlContent);
    expect(rows()).toHaveLength(0);
  });

  it('trang CHƯA lưu lần nào (không có editingId): chưa chọn được biểu mẫu có sẵn (nhắc lưu trang trước, không gọi API) nhưng vẫn tạo mới theo mẫu được', () => {
    renderList({}, null);
    fireEvent.click(screen.getByTestId('add-form-toggle'));

    expect(screen.getByTestId('add-existing-need-save')).toHaveTextContent('Lưu trang trước, rồi mới chọn được biểu mẫu có sẵn.');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(fetchForms).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('add-new-survey'));
    expect(htmlKinds()).toEqual(['survey']);
  });

  it('trần kỹ thuật 20: đủ 20 dòng → thông báo, mọi nút thêm bị khoá, thêm cũng không đổi gì', async () => {
    const slots = Array.from({ length: 20 }, () => buildFormSlotHtml('blank')).join('');
    renderList({ htmlContent: PAGE(slots) });

    expect(rows()).toHaveLength(20);
    expect(screen.getByTestId('forms-count')).toHaveTextContent('(20)');
    expect(screen.getByTestId('forms-limit')).toHaveTextContent('Trang đã đủ 20 biểu mẫu');
    fireEvent.click(screen.getByTestId('add-form-toggle'));
    for (const kind of ['consult', 'booking', 'payment', 'survey', 'blank']) {
      expect(screen.getByTestId(`add-new-${kind}`)).toBeDisabled();
    }
    const htmlBefore = latest.htmlContent;
    fireEvent.click(screen.getByTestId('add-new-booking'));
    expect(latest.htmlContent).toBe(htmlBefore);
    await waitFor(() => expect(fetchForms).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('combobox')).toBeDisabled();
  });

  it('không tải được danh sách biểu mẫu → báo lỗi, vẫn bấm Làm mới thử lại được', async () => {
    fetchForms.mockRejectedValueOnce(new Error('boom'));
    renderList();
    fireEvent.click(screen.getByTestId('add-form-toggle'));

    expect(await screen.findByText(/Không tải được danh sách biểu mẫu/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Làm mới/ }));
    await waitFor(() => expect(fetchForms).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/Không tải được danh sách biểu mẫu/)).not.toBeInTheDocument());
  });
});
