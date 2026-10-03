import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

/** Mọi bản cập nhật form mà modal đã gửi, áp lần lượt lên `initial`. */
function appliedForms(setForm, initial) {
  return setForm.mock.calls.map(([update]) => (typeof update === 'function' ? update(initial) : { ...initial, ...update }));
}

/** Bấm / gõ vào MỌI nút, ô tích, radio, ô nhập đang có trong modal (hai lượt: lượt 2 bấm các nút sau khi đã gõ). */
function interactWithEverything() {
  const clickAll = () => {
    for (const el of screen.queryAllByRole('button')) fireEvent.click(el);
    for (const el of screen.queryAllByRole('checkbox')) fireEvent.click(el);
    for (const el of screen.queryAllByRole('radio')) fireEvent.click(el);
  };
  clickAll();
  for (const el of screen.queryAllByRole('textbox')) fireEvent.change(el, { target: { value: 'lp.Example.com' } });
  clickAll();
}

/**
 * Bug 03/10/2026: `landing_page_domains` lưu CẢ tên miền miễn phí `<slug>.founderai.biz` (cf_managed)
 * lẫn tên miền riêng, nên API trả `customDomainHostname = 'abc.founderai.biz'` cho trang miễn phí.
 * Modal suy "chế độ tên miền riêng" từ việc hostname có giá trị → mở nhầm tab + hướng dẫn CNAME vô nghĩa.
 */
describe('SettingsModal — tên miền', () => {
  it('trang dùng tên miền MIỄN PHÍ (hostname = <slug>.founderai.biz) → không có khối tên miền riêng, link là <slug>.founderai.biz', () => {
    renderModal({
      slug: 'abc',
      domainType: 'system',
      customDomainHostname: 'abc.founderai.biz',
      customDomainStatus: 'active',
    });

    expect(screen.queryByTestId('custom-domain-readonly')).toBeNull();
    expect(screen.getByTestId('landing-public-url')).toHaveTextContent('https://abc.founderai.biz');
    expect(screen.getByLabelText(/Đường dẫn miễn phí/)).toHaveValue('abc');
  });

  it('hostname dưới founderai.biz (www./subdomain khác) cũng không phải tên miền riêng', () => {
    renderModal({ slug: 'abc', customDomainHostname: 'www.founderai.biz', customDomainStatus: 'active' });
    expect(screen.queryByTestId('custom-domain-readonly')).toBeNull();
  });

  it('trang có tên miền RIÊNG đang chạy → CHỈ HIỂN THỊ: tên miền + "Đang chạy"; link là tên miền riêng; ẩn ô slug', () => {
    renderModal({
      slug: 'abc',
      domainType: 'custom',
      customDomainHostname: 'lp.example.com',
      customDomainStatus: 'active',
    });

    const block = screen.getByTestId('custom-domain-readonly');
    expect(block).toHaveTextContent('lp.example.com');
    expect(screen.getByTestId('custom-domain-status')).toHaveTextContent('Đang chạy');
    expect(screen.getByTestId('landing-public-url')).toHaveTextContent('https://lp.example.com');
    // Đổi slug làm backend gỡ hàng tên miền riêng → không cho sửa slug khi trang có tên miền riêng.
    expect(screen.queryByLabelText(/Đường dẫn miễn phí/)).toBeNull();
  });

  it('tên miền riêng đang chờ xác minh → "Chờ xác minh", KHÔNG hiện link (tên miền chưa chạy)', () => {
    renderModal({
      domainType: 'custom',
      customDomainHostname: 'lp.example.com',
      customDomainStatus: 'pending_verification',
    });

    expect(screen.getByTestId('custom-domain-status')).toHaveTextContent('Chờ xác minh');
    expect(screen.queryByTestId('landing-public-url')).toBeNull();
    expect(screen.getByText(/đang chờ xác minh/)).toBeInTheDocument();
  });

  it('trang domain_type=custom mà KHÔNG còn hàng tên miền nào (4 trang hỏng ở production) → không hiện link miễn phí đã chết, không cho sửa slug', () => {
    renderModal({ slug: 'abc', domainType: 'custom', customDomainHostname: null });

    expect(screen.queryByTestId('landing-public-url')).toBeNull();
    expect(screen.queryByLabelText(/Đường dẫn miễn phí/)).toBeNull();
    expect(screen.getByText(/chưa có tên miền nào được gắn/)).toBeInTheDocument();
  });

  it('trang chưa có hostname nào → link miễn phí + ô slug', () => {
    renderModal({ customDomainHostname: null });
    expect(screen.getByTestId('landing-public-url')).toHaveTextContent('https://abc.founderai.biz');
    expect(screen.getByLabelText(/Đường dẫn miễn phí/)).toBeInTheDocument();
  });
});

/**
 * 03/10/2026: production có 4 trang domain_type='custom' MÀ KHÔNG còn hàng landing_page_domains (id 50, 76, 88, 105):
 * "Lưu tên miền" chỉ đổi state form → lúc lưu trang backend gỡ subdomain miễn phí mà không đăng ký hostname nào;
 * "Kiểm tra kết nối" dùng fetch thô không Bearer. Modal gỡ HẾT thao tác ghi tên miền riêng cho tới khi có PR nối
 * putLandingCustomDomain / postLandingCustomDomainVerify.
 */
describe('SettingsModal — không còn thao tác ghi tên miền riêng', () => {
  const FORMS = {
    'trang miễn phí': { slug: 'abc', domainType: 'system', customDomainHostname: 'abc.founderai.biz', customDomainStatus: 'active' },
    'trang chưa có hostname': { slug: 'abc', domainType: 'system', customDomainHostname: null },
    'trang có tên miền riêng đang chạy': { slug: 'abc', domainType: 'custom', customDomainHostname: 'lp.example.com', customDomainStatus: 'active' },
    'trang có tên miền riêng chờ xác minh': { slug: 'abc', domainType: 'custom', customDomainHostname: 'lp.example.com', customDomainStatus: 'pending_verification' },
    'trang custom không còn hàng tên miền (hỏng)': { slug: 'abc', domainType: 'custom', customDomainHostname: null },
  };

  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(Object.entries(FORMS))('%s: không có công tắc / ô nhập / nút Lưu tên miền / Kiểm tra kết nối / hướng dẫn DNS', (_name, patch) => {
    renderModal(patch);

    expect(screen.queryByRole('checkbox', { name: /tên miền riêng/i })).toBeNull();
    expect(screen.queryByPlaceholderText('lp.example.com')).toBeNull();
    expect(screen.queryByRole('button', { name: /Lưu tên miền/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Kiểm tra kết nối/ })).toBeNull();
    expect(screen.queryByTestId('custom-domain-guide')).toBeNull();
    expect(screen.queryByText(/CNAME/)).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it.each(Object.entries(FORMS))('%s: bấm/gõ vào mọi thứ trong modal KHÔNG làm đổi domainType / tên miền, và không gọi fetch', (_name, patch) => {
    const initial = baseForm(patch);
    const { setForm } = renderModal(patch);

    interactWithEverything();

    const forms = appliedForms(setForm, initial);
    expect(forms.length).toBeGreaterThan(0); // có tương tác thật (đổi slug / xuất bản...), không phải test rỗng
    for (const next of forms) {
      expect(next.domainType).toBe(initial.domainType);
      expect(next.customDomainHostname).toBe(initial.customDomainHostname);
      expect(next.customDomainIsApex).toBe(initial.customDomainIsApex);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('bấm "Lưu" ở ô đường dẫn miễn phí chỉ làm sạch slug, không đụng domainType', () => {
    const initial = baseForm({ slug: 'Abc_Test', domainType: 'system' });
    const { setForm } = renderModal({ slug: 'Abc_Test', domainType: 'system' });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(setForm).toHaveBeenCalledTimes(1);
    expect(setForm.mock.calls[0][0](initial)).toEqual({ ...initial, slug: 'abctest' });
  });

  it('tab "domain" (ý định chat "đặt tên miền riêng") không mở ra thao tác ghi nào', () => {
    renderModal({ customDomainHostname: null }, { tab: 'domain' });
    expect(screen.queryByPlaceholderText('lp.example.com')).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /tên miền riêng/i })).toBeNull();
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
