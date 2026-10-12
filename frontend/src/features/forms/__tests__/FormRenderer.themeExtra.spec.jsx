import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { I18nProvider } from '../../../i18n';
import FormRenderer from '../components/FormRenderer';

/**
 * PR-8b (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, mục 7): FormRenderer áp các khoá giao diện thêm — màu chữ, kiểu nút,
 * bo góc nút / khung, kiểu ô nhập. Hai nhóm ca:
 *  1. GHIM MẶC ĐỊNH: không có khoá mới (theme thiếu / {} / chỉ khoá cũ) thì chuỗi class + thuộc tính style của mọi phần tử đã chạm
 *     phải GIỐNG HỆT bản trước PR-8b. Các chuỗi dưới đây sao NGUYÊN VĂN từ FormRenderer.jsx ở origin/main (a0f64308) — đổi
 *     một ký tự thì biểu mẫu cũ đổi pixel.
 *  2. Từng khoá mới: áp đúng class / style; giá trị lạ -> như mặc định.
 */

const ROOT_CLASS_CARD =
  'w-full max-w-xl mx-auto bg-white text-slate-800 rounded-2xl shadow-sm border border-gray-100 overflow-hidden overflow-x-hidden box-border';
const SUBMIT_CLASS =
  'w-full py-3 px-6 rounded-xl font-medium text-[color:var(--form-primary-text,#ffffff)] bg-[color:var(--form-primary,#df5c0e)] hover:brightness-95 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm';
const BACK_CLASS =
  'shrink-0 py-3 px-5 rounded-xl font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed';
const INPUT_BASE = 'w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2';
const TONE_OUTLINE = 'border-gray-300 focus:border-primary-500 focus:ring-primary-100';
const TONE_ERROR = 'border-red-300 focus:ring-red-200';

const f = (key, label, type = 'short_text', extra = {}) => ({ key, label, type, required: false, options: [], ...extra });

// Đủ loại phần tử đã chạm: tiêu đề, mô tả, heading, paragraph, nhãn, ô nhập các loại, select, radio, checkbox, đồng ý, nút gửi.
const FIELDS = [
  f('h', 'Phần một', 'heading'),
  f('p', 'Đoạn giới thiệu', 'paragraph'),
  f('name', 'Họ và tên', 'short_text', { required: true }),
  f('note', 'Ghi chú', 'long_text'),
  f('mail', 'Email', 'email'),
  f('tel', 'Số điện thoại', 'phone'),
  f('qty', 'Số lượng', 'number'),
  f('day', 'Ngày', 'date'),
  f('at', 'Giờ', 'time'),
  f('city', 'Thành phố', 'select', { options: ['Hà Nội', 'Đà Nẵng'] }),
  f('way', 'Cách liên hệ', 'radio', { options: ['Gọi', 'Nhắn'] }),
  f('topics', 'Chủ đề', 'checkbox', { options: ['A', 'B'] }),
];

const makeForm = (theme, extra = {}) => ({
  title: 'Biểu mẫu thử',
  description: 'Mô tả biểu mẫu',
  fields: FIELDS,
  settings: { consentEnabled: true, submitButtonText: 'Gửi', successMessage: 'Cảm ơn bạn!', redirectUrl: '' },
  ...(theme === undefined ? {} : { theme }),
  ...extra,
});

const renderForm = (form, props = {}) =>
  render(
    <I18nProvider>
      <FormRenderer form={form} onSubmit={vi.fn().mockResolvedValue({})} {...props} />
    </I18nProvider>
  );

const rootCard = (container) => container.firstElementChild;
const submitButton = () => screen.getByRole('button', { name: 'Gửi' });
const controlOf = (label) => screen.getByLabelText(label, { exact: false });

/** Mọi phần tử chữ có thể mang style màu chữ (title, mô tả, heading, paragraph, nhãn, nhãn lựa chọn, nhãn đồng ý). */
function collectTextElements(container) {
  return [
    container.querySelector('h1'),
    container.querySelector('h1 + p'),
    container.querySelector('[data-block="heading"] h2'),
    container.querySelector('[data-block="paragraph"]'),
    ...container.querySelectorAll('form label[for^="field_"]'),
    ...container.querySelectorAll('label[for^="radio-"]'),
    ...container.querySelectorAll('label[for^="chk-"]'),
    container.querySelector('input[type="checkbox"]:not([id])').closest('label'),
  ];
}

describe('FormRenderer — GHIM MẶC ĐỊNH (không có khoá giao diện mới, DOM y như trước PR-8b)', () => {
  const THEMES = [
    ['không có theme', undefined],
    ['theme {}', {}],
    [
      'theme chỉ có khoá cũ',
      { preset: 'classic', primaryColor: '#1D4ED8', backgroundColor: '#F8FAFC', fontFamily: 'Inter', layout: 'card', bannerHeight: 'md' },
    ],
  ];

  it.each(THEMES)('%s -> thẻ ngoài, nút gửi, ô nhập giữ NGUYÊN chuỗi class cũ', (_name, theme) => {
    const { container } = renderForm(makeForm(theme));

    expect(rootCard(container).className).toBe(ROOT_CLASS_CARD);
    expect(submitButton().className).toBe(SUBMIT_CLASS);

    expect(controlOf('Họ và tên').className).toBe(`${INPUT_BASE} ${TONE_OUTLINE}`);
    expect(controlOf('Ghi chú').className).toBe(`${INPUT_BASE} resize-y ${TONE_OUTLINE}`);
    expect(controlOf('Email').className).toBe(`${INPUT_BASE} ${TONE_OUTLINE}`);
    expect(controlOf('Số điện thoại').className).toBe(`${INPUT_BASE} ${TONE_OUTLINE}`);
    expect(controlOf('Số lượng').className).toBe(`${INPUT_BASE} ${TONE_OUTLINE}`);
    expect(controlOf('Ngày').className).toBe(`${INPUT_BASE} ${TONE_OUTLINE}`);
    expect(controlOf('Giờ').className).toBe(`${INPUT_BASE} ${TONE_OUTLINE}`);
    expect(controlOf('Thành phố').className).toBe(`${INPUT_BASE} bg-white ${TONE_OUTLINE}`);
  });

  it.each(THEMES)('%s -> không phần tử chữ nào mang thuộc tính style; gốc chỉ có color-scheme (+ biến màu chủ đạo cũ)', (_name, theme) => {
    const { container } = renderForm(makeForm(theme));
    for (const el of collectTextElements(container)) {
      expect(el, 'phần tử chữ phải tồn tại để phép ghim có nghĩa').not.toBeNull();
      expect(el.hasAttribute('style')).toBe(false);
    }
    expect(rootCard(container).style.color).toBe('');
  });

  it('ô nhập lỗi (bắt buộc bỏ trống) giữ nguyên class lỗi cũ', () => {
    const { container } = renderForm(makeForm({}));
    fireEvent.click(submitButton());
    expect(controlOf('Họ và tên').className).toBe(`${INPUT_BASE} ${TONE_ERROR}`);
    expect(rootCard(container).className).toBe(ROOT_CLASS_CARD);
  });

  it('nhiều bước: nút Quay lại giữ nguyên class cũ; nút Tiếp dùng class nút chính cũ', () => {
    const form = makeForm({}, {
      fields: [f('a', 'Câu một'), { key: 'b1', type: 'page_break', label: 'Bước hai', required: false, options: [] }, f('b', 'Câu hai')],
    });
    renderForm(form);
    expect(screen.getByRole('button', { name: 'Tiếp' }).className).toBe(SUBMIT_CLASS);
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp' }));
    expect(screen.getByRole('button', { name: 'Quay lại' }).className).toBe(BACK_CLASS);
  });

  it('màn thành công giữ nguyên bo góc thẻ cũ', async () => {
    const onSubmit = vi.fn().mockResolvedValue({});
    const { container } = render(
      <I18nProvider>
        <FormRenderer form={makeForm({}, { fields: [f('a', 'Câu một')], settings: { successMessage: 'Cảm ơn bạn!' } })} onSubmit={onSubmit} />
      </I18nProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /gửi/i }));
    await screen.findByText('Cảm ơn bạn!');
    expect(rootCard(container).className).toBe(
      'w-full max-w-xl mx-auto p-6 bg-white text-slate-800 rounded-2xl shadow-sm border border-gray-100 text-center'
    );
  });

  it('khoá mới có GIÁ TRỊ LẠ -> như mặc định (không đổi class nào)', () => {
    const { container } = renderForm(
      makeForm({
        textColor: 'red;background:url(x)',
        buttonStyle: 'ghost',
        buttonRadius: 'constructor',
        cardRadius: 'full',
        inputStyle: 'underline',
      })
    );
    expect(rootCard(container).className).toBe(ROOT_CLASS_CARD);
    expect(submitButton().className).toBe(SUBMIT_CLASS);
    expect(controlOf('Họ và tên').className).toBe(`${INPUT_BASE} ${TONE_OUTLINE}`);
    for (const el of collectTextElements(container)) expect(el.hasAttribute('style')).toBe(false);
    expect(rootCard(container).style.color).toBe('');
  });
});

describe('FormRenderer — khoá giao diện mới', () => {
  it('textColor -> gốc đặt color; tiêu đề, mô tả, heading, paragraph, nhãn, lựa chọn, ô đồng ý đều mang màu chữ', () => {
    const { container } = renderForm(makeForm({ textColor: '#112233' }));
    expect(rootCard(container).style.color).toBe('rgb(17, 34, 51)');
    const els = collectTextElements(container);
    expect(els.length).toBeGreaterThan(8);
    for (const el of els) {
      expect(el, 'phần tử chữ phải tồn tại').not.toBeNull();
      expect(el.style.color).toBe('rgb(17, 34, 51)');
    }
  });

  it('textColor áp cả màn thành công', async () => {
    const { container } = render(
      <I18nProvider>
        <FormRenderer
          form={makeForm({ textColor: '#112233' }, { fields: [f('a', 'Câu một')], settings: { successMessage: 'Cảm ơn bạn!' } })}
          onSubmit={vi.fn().mockResolvedValue({})}
        />
      </I18nProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /gửi/i }));
    const message = await screen.findByText('Cảm ơn bạn!');
    expect(message.style.color).toBe('rgb(17, 34, 51)');
    expect(container.querySelector('h3').style.color).toBe('rgb(17, 34, 51)');
  });

  it('buttonStyle outline -> nút gửi và Tiếp: nền trong, viền + chữ màu chủ đạo, KHÔNG bóng; solid giữ y như mặc định', () => {
    renderForm(makeForm({ buttonStyle: 'outline' }));
    const cls = submitButton().className;
    expect(cls).toContain('bg-transparent');
    expect(cls).toContain('text-[color:var(--form-primary,#df5c0e)]');
    expect(cls).toContain('ring-2 ring-inset ring-[color:var(--form-primary,#df5c0e)]');
    expect(cls).not.toContain('shadow-sm');
    expect(cls).not.toContain('bg-[color:var(--form-primary,#df5c0e)]');
  });

  it('buttonStyle solid (tường minh) -> y như mặc định', () => {
    renderForm(makeForm({ buttonStyle: 'solid' }));
    expect(submitButton().className).toBe(SUBMIT_CLASS);
  });

  it.each([
    ['none', 'rounded-none'],
    ['sm', 'rounded-md'],
    ['md', 'rounded-xl'],
    ['lg', 'rounded-2xl'],
    ['full', 'rounded-full'],
  ])('buttonRadius %s -> nút gửi dùng %s (và thay đúng 1 class bo góc)', (value, expectedClass) => {
    renderForm(makeForm({ buttonRadius: value }));
    expect(submitButton().className).toBe(SUBMIT_CLASS.replace('rounded-xl', expectedClass));
  });

  it('buttonRadius áp cả nút Quay lại', () => {
    const form = makeForm(
      { buttonRadius: 'full' },
      { fields: [f('a', 'Câu một'), { key: 'b1', type: 'page_break', label: '', required: false, options: [] }, f('b', 'Câu hai')] }
    );
    renderForm(form);
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp' }));
    expect(screen.getByRole('button', { name: 'Quay lại' }).className).toBe(BACK_CLASS.replace('rounded-xl', 'rounded-full'));
  });

  it.each([
    ['none', 'rounded-none'],
    ['sm', 'rounded-lg'],
    ['md', 'rounded-2xl'],
    ['lg', 'rounded-3xl'],
  ])('cardRadius %s -> thẻ ngoài dùng %s', (value, expectedClass) => {
    const { container } = renderForm(makeForm({ cardRadius: value }));
    expect(rootCard(container).className).toBe(ROOT_CLASS_CARD.replace('rounded-2xl', expectedClass));
  });

  it('inputStyle filled -> mọi ô nhập có nền xám nhạt + viền trong suốt (giữ vòng tiêu điểm); select bỏ bg-white', () => {
    renderForm(makeForm({ inputStyle: 'filled' }));
    const filledTone = 'border-transparent bg-gray-100 focus:border-primary-500 focus:ring-primary-100';
    for (const label of ['Họ và tên', 'Email', 'Số điện thoại', 'Số lượng', 'Ngày', 'Giờ']) {
      expect(controlOf(label).className).toBe(`${INPUT_BASE} ${filledTone}`);
    }
    expect(controlOf('Ghi chú').className).toBe(`${INPUT_BASE} resize-y ${filledTone}`);
    const selectClass = controlOf('Thành phố').className;
    expect(selectClass).toContain(filledTone);
    expect(selectClass).not.toContain('bg-white');
  });

  it('inputStyle filled + lỗi -> vẫn viền đỏ, giữ nền xám nhạt', () => {
    renderForm(makeForm({ inputStyle: 'filled' }));
    fireEvent.click(submitButton());
    const cls = controlOf('Họ và tên').className;
    expect(cls).toContain('border-red-300');
    expect(cls).toContain('bg-gray-100');
    expect(cls).not.toContain('border-transparent');
  });

  it('inputStyle outline (tường minh) -> y như mặc định', () => {
    renderForm(makeForm({ inputStyle: 'outline' }));
    expect(controlOf('Họ và tên').className).toBe(`${INPUT_BASE} ${TONE_OUTLINE}`);
  });

  it('kết hợp tất cả khoá + màu chủ đạo: không khoá nào đè mất khoá khác', () => {
    const { container } = renderForm(
      makeForm({
        primaryColor: '#1D4ED8',
        textColor: '#0F172A',
        buttonStyle: 'outline',
        buttonRadius: 'full',
        cardRadius: 'none',
        inputStyle: 'filled',
      })
    );
    expect(rootCard(container).className).toContain('rounded-none');
    expect(rootCard(container).style.getPropertyValue('--form-primary')).toBe('#1D4ED8');
    expect(rootCard(container).style.color).toBe('rgb(15, 23, 42)');
    expect(submitButton().className).toContain('rounded-full');
    expect(submitButton().className).toContain('bg-transparent');
    expect(controlOf('Email').className).toContain('bg-gray-100');
  });

  it('thẻ sản phẩm 2 cột (layout wide + product) vẫn hoạt động cùng khoá mới', () => {
    const { container } = renderForm(
      makeForm(
        { layout: 'wide', cardRadius: 'lg', buttonStyle: 'outline' },
        { product: { name: 'Khoá AI thực chiến', imageUrl: 'https://cdn.example.com/khoa-ai.png', priceText: '2tr', priceAmount: 2000000 } }
      )
    );
    expect(container.querySelector('[data-testid="form-product-layout"]')).not.toBeNull();
    expect(rootCard(container).className).toContain('rounded-3xl');
    expect(rootCard(container).className).toContain('md:max-w-5xl');
  });

  it('renderer luôn sáng: gốc ghim color-scheme light dù có khoá mới', () => {
    const { container } = renderForm(makeForm({ textColor: '#112233', inputStyle: 'filled' }));
    expect(rootCard(container).style.colorScheme).toBe('light');
    expect(rootCard(container).className).toContain('bg-white');
  });
});
