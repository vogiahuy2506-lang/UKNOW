import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { I18nProvider } from '../../../i18n';
import FormRenderer from '../components/FormRenderer';

/**
 * Plan 12/10/2026 — thẻ sản phẩm trên biểu mẫu. Ca "không có form.product → DOM y hệt cũ" được chặn bằng snapshot
 * HTML sinh ra từ FormRenderer TRƯỚC khi thêm thẻ sản phẩm.
 */

const BASE_FORM = {
  title: 'Biểu mẫu bán hàng',
  description: 'Điền thông tin để đặt mua.',
  fields: [
    { key: 'f_name', label: 'Họ tên', type: 'short_text', required: true, options: [] },
    { key: 'f_phone', label: 'Số điện thoại', type: 'phone', required: true, options: [] },
    { key: 'f_pick', label: 'Gói', type: 'select', required: false, options: [{ label: 'A', value: 'A' }] },
  ],
  settings: { consentEnabled: true, submitButtonText: 'Gửi thông tin', successMessage: 'Cảm ơn!', redirectUrl: null },
};

const renderForm = (form, props = {}) =>
  render(
    <I18nProvider>
      <FormRenderer form={form} onSubmit={() => Promise.resolve()} {...props} />
    </I18nProvider>
  );

describe('FormRenderer — không có form.product thì DOM giữ y hệt bản cũ', () => {
  it('bố cục thường (không theme)', () => {
    const { container } = renderForm(BASE_FORM);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('bố cục wide + màu chủ đạo + banner + logo', () => {
    const { container } = renderForm({
      ...BASE_FORM,
      theme: { layout: 'wide', primaryColor: '#0f766e', bannerUrl: 'https://cdn.example.com/b.png', logoUrl: 'https://cdn.example.com/l.png' },
    });
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('xem trước điện thoại (singleColumn) + previewMode', () => {
    const { container } = renderForm(BASE_FORM, { previewMode: true, singleColumn: true });
    expect(container.innerHTML).toMatchSnapshot();
  });
});

const PRODUCT = {
  name: 'Khoá AI thực chiến',
  imageUrl: 'https://cdn.example.com/khoa-ai.png',
  priceText: '2tr',
  priceAmount: 2000000,
  originalPrice: '3tr',
  description: 'Học AI từ con số 0.',
  usp: 'Cầm tay chỉ việc\nHọc lại miễn phí',
};

describe('FormRenderer — thẻ sản phẩm', () => {
  it('có form.product: hiện đủ ảnh, tên, giá, giá gốc gạch ngang, nhãn -X%, điểm nổi bật, mô tả', () => {
    renderForm({ ...BASE_FORM, product: PRODUCT });
    const card = screen.getByTestId('product-showcase');

    expect(within(card).getByTestId('product-showcase-image')).toHaveAttribute('src', PRODUCT.imageUrl);
    expect(within(card).getByTestId('product-showcase-name')).toHaveTextContent('Khoá AI thực chiến');
    expect(within(card).getByTestId('product-showcase-price')).toHaveTextContent('2tr');
    expect(within(card).getByTestId('product-showcase-original-price')).toHaveTextContent('3tr');
    expect(within(card).getByTestId('product-showcase-original-price').className).toContain('line-through');
    expect(within(card).getByTestId('product-showcase-discount')).toHaveTextContent('-33%');
    expect(within(within(card).getByTestId('product-showcase-usp')).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Cầm tay chỉ việc',
      'Học lại miễn phí',
    ]);
    expect(within(card).getByTestId('product-showcase-description')).toHaveTextContent('Học AI từ con số 0.');
    // Biểu mẫu LUÔN sáng: thẻ sản phẩm không được có lớp dark:
    expect(card.outerHTML).not.toContain('dark:');
  });

  it('giá chính tô màu chủ đạo của biểu mẫu (--form-primary)', () => {
    renderForm({ ...BASE_FORM, product: PRODUCT });
    expect(screen.getByTestId('product-showcase-price').className).toContain('var(--form-primary');
  });

  it('không có form.product (hoặc product null): không có thẻ, không có khung 2 cột', () => {
    const { rerender } = renderForm({ ...BASE_FORM, theme: { layout: 'wide' } });
    expect(screen.queryByTestId('product-showcase')).toBeNull();
    expect(screen.queryByTestId('form-product-layout')).toBeNull();

    rerender(
      <I18nProvider>
        <FormRenderer form={{ ...BASE_FORM, theme: { layout: 'wide' }, product: null }} onSubmit={() => Promise.resolve()} />
      </I18nProvider>
    );
    expect(screen.queryByTestId('product-showcase')).toBeNull();
    expect(screen.queryByTestId('form-product-layout')).toBeNull();
  });

  it('bố cục wide: lưới 2 cột từ md (trái thẻ sản phẩm, phải tiêu đề + ô điền) và thẻ ngoài rộng hơn', () => {
    const { container } = renderForm({ ...BASE_FORM, product: PRODUCT, theme: { layout: 'wide' } });
    const layout = screen.getByTestId('form-product-layout');

    expect(layout.className).toContain('md:grid-cols-2');
    expect(layout.firstElementChild).toBe(screen.getByTestId('product-showcase'));
    const rightColumn = layout.lastElementChild;
    expect(within(rightColumn).getByRole('heading', { level: 1 })).toHaveTextContent('Biểu mẫu bán hàng');
    expect(rightColumn.querySelector('form')).not.toBeNull();
    expect(within(rightColumn).queryByTestId('product-showcase')).toBeNull();
    // thẻ ngoài: rộng hơn max-w-2xl của wide thường
    expect(container.firstElementChild.className).toContain('md:max-w-5xl');
  });

  it('bố cục thường (không wide): thẻ nằm GIỮA tiêu đề/mô tả và biểu mẫu, không có lưới 2 cột', () => {
    const { container } = renderForm({ ...BASE_FORM, product: PRODUCT });
    expect(screen.queryByTestId('form-product-layout')).toBeNull();
    expect(container.firstElementChild.className).toContain('max-w-xl');

    const heading = screen.getByRole('heading', { level: 1 });
    const card = screen.getByTestId('product-showcase');
    const form = container.querySelector('form');
    expect(heading.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('wide nhưng khung điện thoại của xem trước (singleColumn): xếp chồng, thẻ giữa tiêu đề và biểu mẫu', () => {
    renderForm({ ...BASE_FORM, product: PRODUCT, theme: { layout: 'wide' } }, { previewMode: true, singleColumn: true });
    expect(screen.queryByTestId('form-product-layout')).toBeNull();
    expect(screen.getByTestId('product-showcase')).toBeInTheDocument();
  });

  it('ảnh sản phẩm lỗi tải thì ẩn, phần còn lại của thẻ vẫn hiện', () => {
    renderForm({ ...BASE_FORM, product: PRODUCT });
    fireEvent.error(screen.getByTestId('product-showcase-image'));
    expect(screen.queryByTestId('product-showcase-image')).toBeNull();
    expect(screen.getByTestId('product-showcase-price')).toBeInTheDocument();
  });

  it('không có imageUrl thì không dựng ảnh', () => {
    renderForm({ ...BASE_FORM, product: { ...PRODUCT, imageUrl: null } });
    expect(screen.queryByTestId('product-showcase-image')).toBeNull();
  });

  it('tên sản phẩm trùng tiêu đề biểu mẫu (không phân biệt hoa thường / khoảng trắng) thì ẩn tên, tránh lặp', () => {
    renderForm({ ...BASE_FORM, title: 'Khoá AI thực chiến', product: { ...PRODUCT, name: '  khoá ai THỰC CHIẾN ' } });
    expect(screen.queryByTestId('product-showcase-name')).toBeNull();
    expect(screen.getByTestId('product-showcase-price')).toBeInTheDocument();
  });

  it('tên khác tiêu đề thì hiện tên', () => {
    renderForm({ ...BASE_FORM, product: PRODUCT });
    expect(screen.getByTestId('product-showcase-name')).toBeInTheDocument();
  });

  it('thanh toán mục đích "order": giá chính là số tiền khách trả, giá gốc 3tr gạch + -50%', () => {
    renderForm({ ...BASE_FORM, product: PRODUCT, payment: { enabled: true, amount: 1500000, purpose: 'order' } });
    expect(screen.getByTestId('product-showcase-price')).toHaveTextContent('1.500.000 đ');
    expect(screen.getByTestId('product-showcase-original-price')).toHaveTextContent('3tr');
    expect(screen.getByTestId('product-showcase-discount')).toHaveTextContent('-50%');
  });

  it('thanh toán đặt cọc 200.000: giá chính vẫn là giá sản phẩm "2tr", gạch "3tr", -33%', () => {
    renderForm({ ...BASE_FORM, product: PRODUCT, payment: { enabled: true, amount: 200000, purpose: 'deposit' } });
    expect(screen.getByTestId('product-showcase-price')).toHaveTextContent('2tr');
    expect(screen.getByTestId('product-showcase-original-price')).toHaveTextContent('3tr');
    expect(screen.getByTestId('product-showcase-discount')).toHaveTextContent('-33%');
  });

  it('mô tả dài thì thu gọn kèm "Xem thêm"; bấm để mở và "Thu gọn" để đóng; mô tả ngắn không có nút', () => {
    const long = 'Nội dung rất dài. '.repeat(40);
    renderForm({ ...BASE_FORM, product: { ...PRODUCT, description: long } });
    const description = screen.getByTestId('product-showcase-description');
    expect(description.className).toContain('line-clamp-4');
    expect(description.className).toContain('whitespace-pre-line');

    fireEvent.click(screen.getByRole('button', { name: 'Xem thêm' }));
    expect(screen.getByTestId('product-showcase-description').className).not.toContain('line-clamp-4');
    fireEvent.click(screen.getByRole('button', { name: 'Thu gọn' }));
    expect(screen.getByTestId('product-showcase-description').className).toContain('line-clamp-4');
  });

  it('mô tả ngắn: không có nút "Xem thêm"', () => {
    renderForm({ ...BASE_FORM, product: PRODUCT });
    expect(screen.queryByTestId('product-showcase-more')).toBeNull();
  });

  it('thẻ không còn gì để hiện (chỉ có tên trùng tiêu đề) thì không dựng khung rỗng', () => {
    renderForm({
      ...BASE_FORM,
      title: 'Khoá AI',
      product: { name: 'Khoá AI', imageUrl: null, priceText: null, priceAmount: null, originalPrice: null, description: null, usp: null },
    });
    expect(screen.queryByTestId('product-showcase')).toBeNull();
  });

  it('nộp bài vẫn hoạt động bình thường khi có thẻ sản phẩm (thẻ nằm ngoài <form>)', () => {
    const { container } = renderForm({ ...BASE_FORM, product: PRODUCT, theme: { layout: 'wide' } });
    expect(container.querySelector('form').contains(screen.getByTestId('product-showcase'))).toBe(false);
    expect(screen.getByRole('button', { name: 'Gửi thông tin' })).toBeInTheDocument();
  });
});
