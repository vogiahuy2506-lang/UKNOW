import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SettingsModal from '../SettingsModal.jsx';

vi.mock('../../../../services/api.js');

// Từ điển vi.js THẬT (không mock chuỗi): thiếu khoá dịch thì test thấy khoá thô.
vi.mock('../../../../i18n', async () => {
  const { default: viDict } = await vi.importActual('../../../../i18n/vi.js');
  const get = (path) => path.split('.').reduce((node, part) => (node == null ? node : node[part]), viDict);
  const fill = (text, params) => String(text).replace(/\{(\w+)\}/g, (m, k) => (params?.[k] !== undefined ? params[k] : m));
  return {
    useI18n: (namespace = null) => {
      const t = (key, params) => {
        const value = get(namespace ? `${namespace}.${key}` : key);
        return typeof value === 'string' ? fill(value, params) : key;
      };
      if (namespace) return t;
      return { t, locale: 'vi' };
    },
  };
});

vi.mock('../../../storage/useStorageQuota', () => ({
  default: () => ({ usage: null }),
}));

vi.mock('../../../storage/storageEvents', () => ({
  notifyStorageQuotaRefresh: vi.fn(),
}));

vi.mock('../LeadFormConfigPanel.jsx', () => ({
  default: () => <div data-testid="lead-form-config-panel" />,
}));

const HOSTNAME_PLACEHOLDER = 'lp.example.com';
const CUSTOM_TOGGLE = 'Dùng tên miền riêng của bạn';

function baseForm(patch = {}) {
  return {
    title: 'Trang thử',
    slug: 'abc',
    htmlContent: '',
    isPublished: true,
    domainType: 'system',
    customDomainHostname: null,
    customDomainIsApex: false,
    customDomainStatus: null,
    ...patch,
  };
}

function renderModal(formPatch = {}, props = {}) {
  const setForm = vi.fn();
  const utils = render(
    <SettingsModal
      open
      onClose={vi.fn()}
      form={baseForm(formPatch)}
      setForm={setForm}
      editingId={10}
      {...props}
    />
  );
  return { setForm, ...utils };
}

/**
 * Bug 03/10/2026: `landing_page_domains` lưu CẢ tên miền miễn phí `<slug>.founderai.biz` (cf_managed)
 * lẫn tên miền riêng, nên API trả `customDomainHostname = 'abc.founderai.biz'` cho trang miễn phí.
 * Modal suy "chế độ tên miền riêng" từ việc hostname có giá trị → mở nhầm tab + hướng dẫn CNAME vô nghĩa.
 */
describe('SettingsModal — chế độ tên miền', () => {
  it('trang dùng tên miền MIỄN PHÍ (hostname = <slug>.founderai.biz) → KHÔNG ở chế độ tên miền riêng, link là <slug>.founderai.biz', () => {
    renderModal({
      slug: 'abc',
      domainType: 'system',
      customDomainHostname: 'abc.founderai.biz',
      customDomainStatus: 'active',
    });

    expect(screen.getByRole('checkbox', { name: CUSTOM_TOGGLE })).not.toBeChecked();
    expect(screen.queryByTestId('custom-domain-panel')).toBeNull();
    expect(screen.queryByPlaceholderText(HOSTNAME_PLACEHOLDER)).toBeNull();
    expect(screen.queryByTestId('custom-domain-guide')).toBeNull();
    expect(screen.getByTestId('landing-public-url')).toHaveTextContent('https://abc.founderai.biz');
    expect(screen.getByLabelText(/Đường dẫn miễn phí/)).toHaveValue('abc');
  });

  it('hostname dưới founderai.biz (www./subdomain khác) cũng không phải tên miền riêng', () => {
    renderModal({ slug: 'abc', customDomainHostname: 'www.founderai.biz', customDomainStatus: 'active' });
    expect(screen.getByRole('checkbox', { name: CUSTOM_TOGGLE })).not.toBeChecked();
    expect(screen.queryByTestId('custom-domain-panel')).toBeNull();
  });

  it('trang chưa có hostname nào → chế độ miễn phí', () => {
    renderModal({ customDomainHostname: null });
    expect(screen.getByRole('checkbox', { name: CUSTOM_TOGGLE })).not.toBeChecked();
    expect(screen.queryByPlaceholderText(HOSTNAME_PLACEHOLDER)).toBeNull();
  });

  it('trang có tên miền RIÊNG đang chạy → mở sẵn, hiện trạng thái "Đang chạy", link là tên miền riêng, còn nút Kiểm tra kết nối', () => {
    renderModal({
      slug: 'abc',
      domainType: 'custom',
      customDomainHostname: 'lp.example.com',
      customDomainStatus: 'active',
    });

    expect(screen.getByRole('checkbox', { name: CUSTOM_TOGGLE })).toBeChecked();
    expect(screen.getByPlaceholderText(HOSTNAME_PLACEHOLDER)).toHaveValue('lp.example.com');
    expect(screen.getByTestId('custom-domain-status')).toHaveTextContent('Đang chạy');
    expect(screen.getByTestId('landing-public-url')).toHaveTextContent('https://lp.example.com');
    expect(screen.getByRole('button', { name: /Kiểm tra kết nối/ })).toBeInTheDocument();
    // Đã nhập tên miền → có hướng dẫn DNS; slug miễn phí ẩn đi.
    expect(screen.getByTestId('custom-domain-guide')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Đường dẫn miễn phí/)).toBeNull();
  });

  it('tên miền riêng đang chờ xác minh → hiện "Chờ xác minh", KHÔNG hiện link (tên miền chưa chạy)', () => {
    renderModal({
      domainType: 'custom',
      customDomainHostname: 'lp.example.com',
      customDomainStatus: 'pending_verification',
    });

    expect(screen.getByTestId('custom-domain-status')).toHaveTextContent('Chờ xác minh');
    expect(screen.queryByTestId('landing-public-url')).toBeNull();
    expect(screen.getByText(/đang chờ xác minh/)).toBeInTheDocument();
  });

  it('bật "Dùng tên miền riêng của bạn" trên trang miễn phí → mở ô nhập; hướng dẫn DNS chỉ hiện sau khi nhập tên miền', () => {
    renderModal({ slug: 'abc', customDomainHostname: 'abc.founderai.biz', customDomainStatus: 'active' });

    fireEvent.click(screen.getByRole('checkbox', { name: CUSTOM_TOGGLE }));

    const input = screen.getByPlaceholderText(HOSTNAME_PLACEHOLDER);
    expect(input).toHaveValue('');
    expect(screen.queryByTestId('custom-domain-guide')).toBeNull();
    expect(screen.queryByRole('button', { name: /Kiểm tra kết nối/ })).toBeNull();

    fireEvent.change(input, { target: { value: 'LP.Example.com' } });

    expect(input).toHaveValue('lp.example.com');
    expect(screen.getByTestId('custom-domain-guide')).toHaveTextContent('CNAME');
    expect(screen.getByRole('button', { name: /Kiểm tra kết nối/ })).toBeInTheDocument();
  });

  it('"Lưu tên miền" giữ nguyên logic cũ: setForm domainType=custom + hostname + loại (subdomain/apex)', () => {
    const { setForm } = renderModal({ customDomainHostname: null });

    fireEvent.click(screen.getByRole('checkbox', { name: CUSTOM_TOGGLE }));
    fireEvent.change(screen.getByPlaceholderText(HOSTNAME_PLACEHOLDER), { target: { value: 'example.com' } });
    fireEvent.click(screen.getByRole('radio', { name: /Apex/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu tên miền' }));

    expect(setForm).toHaveBeenCalledTimes(1);
    const next = setForm.mock.calls[0][0](baseForm());
    expect(next).toMatchObject({
      domainType: 'custom',
      customDomainHostname: 'example.com',
      customDomainIsApex: true,
    });
  });

  it('tab "domain" (ý định chat "đặt tên miền riêng") mở sẵn phần tên miền riêng', () => {
    renderModal({ customDomainHostname: null }, { tab: 'domain' });
    expect(screen.getByRole('checkbox', { name: CUSTOM_TOGGLE })).toBeChecked();
    expect(screen.getByPlaceholderText(HOSTNAME_PLACEHOLDER)).toBeInTheDocument();
  });
});

describe('SettingsModal — link trang', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('bấm Sao chép → chép đúng https://<slug>.founderai.biz; nút Mở trang trỏ cùng địa chỉ, mở tab mới', () => {
    renderModal({ slug: 'abc' });

    fireEvent.click(screen.getByRole('button', { name: /Sao chép/ }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://abc.founderai.biz');

    const open = screen.getByRole('link', { name: /Mở trang/ });
    expect(open).toHaveAttribute('href', 'https://abc.founderai.biz');
    expect(open).toHaveAttribute('target', '_blank');
  });

  it('trang chưa lưu (không có editingId) → chưa có link, chỉ hiện gợi ý Lưu', () => {
    renderModal({ slug: 'abc' }, { editingId: null });
    expect(screen.queryByTestId('landing-public-url')).toBeNull();
    expect(screen.getByText('Bấm Lưu để trang có link.')).toBeInTheDocument();
  });

  it('trang đã lưu nhưng chưa có slug → gợi ý đặt đường dẫn', () => {
    renderModal({ slug: '' });
    expect(screen.queryByTestId('landing-public-url')).toBeNull();
    expect(screen.getByText('Đặt đường dẫn ở bên dưới để trang có link.')).toBeInTheDocument();
  });

  it('trang đang là bản nháp → vẫn có link nhưng nhắc bật Xuất bản', () => {
    renderModal({ isPublished: false });
    expect(screen.getByTestId('landing-public-url')).toBeInTheDocument();
    expect(screen.getByText(/Trang đang là bản nháp/)).toBeInTheDocument();
  });
});

describe('SettingsModal — bố cục 3 khối', () => {
  it('ô "Tiêu đề landing page" không còn trong modal (tiêu đề sửa ở thanh trên cùng); tiêu đề chỉ hiện ở phần đầu modal', () => {
    renderModal({ title: 'Trang thử' });

    expect(screen.queryByText('Tiêu đề landing page')).toBeNull();
    // Không có ô nhập nào đang chứa tiêu đề trang.
    expect(screen.queryByDisplayValue('Trang thử')).toBeNull();
    expect(screen.getByText('Trang thử')).toBeInTheDocument();
  });

  it('thứ tự: Xuất bản & đường dẫn → Form thu khách → Ảnh đã tải lên', () => {
    renderModal();

    const publish = screen.getByText('Xuất bản & đường dẫn');
    const lead = screen.getByText('Form thu khách');
    const images = screen.getByText('Ảnh đã tải lên');
    const before = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    expect(before(publish, lead)).toBe(true);
    expect(before(lead, images)).toBe(true);
  });

  it('khối Xuất bản & đường dẫn luôn mở (không có nút thu gọn), Form thu khách mở sẵn, Ảnh đã tải lên thu gọn kèm số ảnh', () => {
    renderModal({
      htmlContent:
        '<img src="https://founderai.biz/lp-assets/uploads/1/landing/123_abc_logo.png" />' +
        '<img src="https://founderai.biz/lp-assets/uploads/1/landing/456_def_banner.webp" />',
    });

    expect(screen.queryByRole('button', { name: /Xuất bản & đường dẫn/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Form thu khách/ })).toHaveAttribute('aria-expanded', 'true');

    const imagesToggle = screen.getByRole('button', { name: /Ảnh đã tải lên/ });
    expect(imagesToggle).toHaveAttribute('aria-expanded', 'false');
    expect(imagesToggle).toHaveTextContent('(2)');
  });
});
