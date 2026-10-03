import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import SettingsModal from '../SettingsModal.jsx';
import * as domainApi from '../../../landing-pages/services/landingPagesAdminApi.service.js';

vi.mock('../../../../services/api.js');

// API tên miền riêng + tải ảnh: mock cả module (không có mạng thật). Mặc định mọi hàm trả undefined — ca nào cần thì đặt.
vi.mock('../../../landing-pages/services/landingPagesAdminApi.service.js', () => ({
  uploadLandingAsset: vi.fn(),
  fetchLandingCustomDomain: vi.fn(),
  postLandingCustomDomainCheck: vi.fn(),
  putLandingCustomDomain: vi.fn(),
  postLandingCustomDomainVerify: vi.fn(),
  deleteLandingCustomDomain: vi.fn(),
}));

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

beforeEach(() => {
  for (const fn of Object.values(domainApi)) {
    if (vi.isMockFunction(fn)) fn.mockReset();
  }
  // Mặc định server "chưa trả lời" (không bao giờ xong) → modal dùng dữ liệu dự phòng từ form, test đồng bộ không dính
  // cảnh báo act(). Ca nào cần dữ liệu server thì tự đặt mockResolvedValue.
  domainApi.fetchLandingCustomDomain.mockReturnValue(new Promise(() => {}));
});

// Hàng landing_page_domains như GET /admin/landing-pages/:id/custom-domain trả (buildDomainResponse).
const FREE_SERVER = {
  configured: true,
  hostname: 'abc.founderai.biz',
  status: 'active',
  cfManaged: true,
  dnsRecords: [],
  cnameTarget: 'founderai.biz',
  apexFixedIp: null,
  isApexDomain: false,
};
const CUSTOM_ACTIVE_SERVER = {
  configured: true,
  hostname: 'lp.example.com',
  status: 'active',
  cfManaged: false,
  dnsRecords: [{ type: 'CNAME', host: 'lp', value: 'founderai.biz.', ttl: 3600 }],
  cnameTarget: 'founderai.biz',
  apexFixedIp: null,
  isApexDomain: false,
};
const CUSTOM_PENDING_SERVER = { ...CUSTOM_ACTIVE_SERVER, status: 'pending_verification' };
const CHECK_WRONG = {
  verified: false,
  reason: 'not_found',
  hostname: 'lp.example.com',
  isApexDomain: false,
  dnsRecords: [{ type: 'CNAME', host: 'lp', value: 'founderai.biz', ttl: 3600 }],
  cnameTarget: 'founderai.biz',
  apexFixedIp: null,
  message: 'lp.example.com chưa tồn tại trong DNS công khai.',
};
const CHECK_OK = { ...CHECK_WRONG, verified: true, reason: 'ok', message: 'DNS đã trỏ đúng.' };

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

    expect(screen.queryByTestId('custom-domain-block')).toBeNull();
    expect(screen.getByTestId('landing-public-url')).toHaveTextContent('https://abc.founderai.biz');
    expect(screen.getByLabelText(/Đường dẫn miễn phí/)).toHaveValue('abc');
  });

  it('hostname dưới founderai.biz (www./subdomain khác) cũng không phải tên miền riêng', () => {
    renderModal({ slug: 'abc', customDomainHostname: 'www.founderai.biz', customDomainStatus: 'active' });
    expect(screen.queryByTestId('custom-domain-block')).toBeNull();
  });

  it('trang có tên miền RIÊNG đang chạy → hiện tên miền + "Đang chạy"; link là tên miền riêng; ẩn ô slug', () => {
    renderModal({
      slug: 'abc',
      domainType: 'custom',
      customDomainHostname: 'lp.example.com',
      customDomainStatus: 'active',
    });

    const block = screen.getByTestId('custom-domain-block');
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
 * "Lưu tên miền" cũ chỉ đổi state form → lúc lưu trang backend gỡ subdomain miễn phí mà không đăng ký hostname nào;
 * "Kiểm tra kết nối" cũ dùng fetch thô không Bearer. PLAN_TEN_MIEN_RIENG PR-D nối lại bằng API thật, GIỮ chốt PR-1:
 * modal KHÔNG BAO GIỜ đổi form.domainType / hostname trong form — mọi thay đổi đi qua API tên miền riêng rồi nạp lại từ server.
 */
describe('SettingsModal — tên miền riêng: kiểm DNS rồi mới kết nối', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    vi.stubGlobal('fetch', vi.fn());
    domainApi.fetchLandingCustomDomain.mockResolvedValue(FREE_SERVER);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function openConnectForm() {
    renderModalWithFree();
    fireEvent.click(await screen.findByRole('button', { name: 'Dùng tên miền riêng của bạn' }));
    return screen.getByLabelText('Tên miền của bạn');
  }

  function renderModalWithFree(formPatch = {}) {
    return renderModal({ slug: 'abc', domainType: 'system', customDomainHostname: 'abc.founderai.biz', customDomainStatus: 'active', ...formPatch });
  }

  it('trang dùng link miễn phí: có dòng "Dùng tên miền riêng của bạn" + câu nhắc link miễn phí vẫn chạy; chưa có ô nhập', async () => {
    renderModalWithFree();

    expect(await screen.findByRole('button', { name: 'Dùng tên miền riêng của bạn' })).toBeInTheDocument();
    expect(screen.getByText('Link miễn phí vẫn chạy cho tới khi kết nối xong.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Tên miền của bạn')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Kết nối tên miền' })).toBeNull();
  });

  it('bấm mở form: có ô nhập + chọn loại (tên miền phụ / tên miền chính), nút Kiểm tra tắt tới khi có chữ, chưa có nút Kết nối', async () => {
    const input = await openConnectForm();

    expect(input).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByRole('radio', { name: /Tên miền phụ/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Kiểm tra' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Kết nối tên miền' })).toBeNull();
  });

  it('"Kiểm tra" chỉ gọi POST check (KHÔNG ghi): hiện bảng bản ghi DNS Loại/Tên/Giá trị + "Chưa thấy bản ghi"; chưa có nút Kết nối', async () => {
    domainApi.postLandingCustomDomainCheck.mockResolvedValue(CHECK_WRONG);
    const input = await openConnectForm();

    fireEvent.change(input, { target: { value: ' HTTPS://LP.Example.com/ ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra' }));

    const table = await screen.findByTestId('custom-domain-dns-table');
    // Gõ nguyên URL vẫn được: bỏ giao thức/đường dẫn, chữ thường.
    expect(domainApi.postLandingCustomDomainCheck).toHaveBeenCalledTimes(1);
    expect(domainApi.postLandingCustomDomainCheck).toHaveBeenCalledWith(10, 'lp.example.com', false);
    expect(within(table).getByText('Loại')).toBeInTheDocument();
    expect(within(table).getByText('Tên (Host)')).toBeInTheDocument();
    expect(within(table).getByText('Giá trị (Value)')).toBeInTheDocument();
    expect(within(table).getByText('CNAME')).toBeInTheDocument();
    expect(within(table).getByText('lp')).toBeInTheDocument();
    expect(within(table).getByText('founderai.biz')).toBeInTheDocument();
    expect(screen.getByText('Chưa thấy bản ghi — thêm xong bấm Kiểm tra lại.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kiểm tra lại' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kết nối tên miền' })).toBeNull();
    // Không ghi gì.
    expect(domainApi.putLandingCustomDomain).not.toHaveBeenCalled();
    expect(domainApi.deleteLandingCustomDomain).not.toHaveBeenCalled();
    expect(domainApi.postLandingCustomDomainVerify).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('nút Sao chép ở bảng DNS chép đúng Tên và Giá trị (không có dấu chấm cuối)', async () => {
    domainApi.postLandingCustomDomainCheck.mockResolvedValue({
      ...CHECK_WRONG,
      dnsRecords: [{ type: 'CNAME', host: 'lp', value: 'founderai.biz.', ttl: 3600 }],
    });
    const input = await openConnectForm();
    fireEvent.change(input, { target: { value: 'lp.example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra' }));
    await screen.findByTestId('custom-domain-dns-table');

    fireEvent.click(screen.getByRole('button', { name: 'Sao chép Giá trị (Value)' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('founderai.biz'));
    fireEvent.click(screen.getByRole('button', { name: 'Sao chép Tên (Host)' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('lp'));
  });

  it('chọn "Tên miền chính" → Kiểm tra gửi isApexDomain=true; đổi loại sau khi kiểm tra phải kiểm lại (mất nút Kết nối)', async () => {
    domainApi.postLandingCustomDomainCheck.mockResolvedValue({ ...CHECK_OK, isApexDomain: true, hostname: 'example.com' });
    const input = await openConnectForm();
    fireEvent.click(screen.getByRole('radio', { name: /Tên miền chính/ }));
    fireEvent.change(input, { target: { value: 'example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra' }));

    expect(await screen.findByRole('button', { name: 'Kết nối tên miền' })).toBeInTheDocument();
    expect(domainApi.postLandingCustomDomainCheck).toHaveBeenCalledWith(10, 'example.com', true);

    fireEvent.click(screen.getByRole('radio', { name: /Tên miền phụ/ }));
    expect(screen.queryByRole('button', { name: 'Kết nối tên miền' })).toBeNull();
  });

  it('DNS đúng → hiện "Kết nối tên miền"; sửa tên miền sau khi kiểm tra thì phải kiểm lại', async () => {
    domainApi.postLandingCustomDomainCheck.mockResolvedValue(CHECK_OK);
    const input = await openConnectForm();
    fireEvent.change(input, { target: { value: 'lp.example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra' }));

    expect(await screen.findByRole('button', { name: 'Kết nối tên miền' })).toBeInTheDocument();
    expect(screen.getByText('DNS đã trỏ đúng. Bấm Kết nối tên miền để hoàn tất.')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'khac.example.com' } });
    expect(screen.queryByRole('button', { name: 'Kết nối tên miền' })).toBeNull();
  });

  it('"Kết nối tên miền" → gọi PUT đúng 1 lần, rồi NẠP LẠI từ server: link trang đổi sang tên miền riêng + "HTTPS sẵn sàng sau vài phút"', async () => {
    domainApi.fetchLandingCustomDomain.mockReset();
    domainApi.fetchLandingCustomDomain.mockResolvedValueOnce(FREE_SERVER).mockResolvedValue(CUSTOM_ACTIVE_SERVER);
    domainApi.postLandingCustomDomainCheck.mockResolvedValue(CHECK_OK);
    domainApi.putLandingCustomDomain.mockResolvedValue(CUSTOM_ACTIVE_SERVER);
    const initial = baseForm({ slug: 'abc', domainType: 'system', customDomainHostname: 'abc.founderai.biz', customDomainStatus: 'active' });
    const { setForm } = renderModal({ ...initial });

    fireEvent.click(await screen.findByRole('button', { name: 'Dùng tên miền riêng của bạn' }));
    fireEvent.change(screen.getByLabelText('Tên miền của bạn'), { target: { value: 'lp.example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Kết nối tên miền' }));

    await waitFor(() => expect(screen.getByTestId('custom-domain-status')).toHaveTextContent('Đang chạy'));
    expect(domainApi.putLandingCustomDomain).toHaveBeenCalledTimes(1);
    expect(domainApi.putLandingCustomDomain).toHaveBeenCalledWith(10, 'lp.example.com', false);
    expect(domainApi.fetchLandingCustomDomain).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('landing-public-url')).toHaveTextContent('https://lp.example.com');
    expect(screen.getByTestId('custom-domain-https-hint')).toHaveTextContent('HTTPS sẵn sàng sau vài phút.');
    expect(screen.queryByLabelText(/Đường dẫn miễn phí/)).toBeNull();
    // Chốt PR-1: modal KHÔNG đụng form (không setForm đổi domainType / hostname).
    for (const next of appliedForms(setForm, initial)) {
      expect(next.domainType).toBe('system');
      expect(next.customDomainHostname).toBe('abc.founderai.biz');
    }
  });

  it('PUT trả 422 (DNS không còn đúng lúc bấm) → hiện lại bảng DNS + thông báo lỗi; vẫn là link miễn phí, không chuyển sang tên miền riêng', async () => {
    domainApi.postLandingCustomDomainCheck.mockResolvedValue(CHECK_OK);
    domainApi.putLandingCustomDomain.mockRejectedValue(
      Object.assign(new Error('422'), {
        response: { status: 422, data: { success: false, message: 'CNAME chưa đúng.', data: CHECK_WRONG } },
      })
    );
    const input = await openConnectForm();
    fireEvent.change(input, { target: { value: 'lp.example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Kết nối tên miền' }));

    expect(await screen.findByTestId('custom-domain-error')).toHaveTextContent('CNAME chưa đúng.');
    expect(screen.getByTestId('custom-domain-dns-table')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kết nối tên miền' })).toBeNull();
    expect(screen.getByTestId('landing-public-url')).toHaveTextContent('https://abc.founderai.biz');
    expect(screen.queryByTestId('custom-domain-block')).toBeNull();
  });

  it('Kiểm tra bị server từ chối (vd hostname đang dùng cho trang khác, 409) → hiện câu lỗi của server', async () => {
    domainApi.postLandingCustomDomainCheck.mockRejectedValue(
      Object.assign(new Error('409'), { response: { status: 409, data: { message: 'Hostname đã được dùng cho landing khác' } } })
    );
    const input = await openConnectForm();
    fireEvent.change(input, { target: { value: 'lp.example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra' }));

    expect(await screen.findByTestId('custom-domain-error')).toHaveTextContent('Hostname đã được dùng cho landing khác');
    expect(screen.queryByRole('button', { name: 'Kết nối tên miền' })).toBeNull();
  });

  it('trang chưa lưu (không có id): không cho kết nối, nhắc bấm Lưu', async () => {
    renderModal({ slug: 'abc' }, { editingId: null });

    expect(screen.getByTestId('custom-domain-save-first')).toHaveTextContent('Bấm Lưu để trang có link');
    expect(screen.queryByRole('button', { name: 'Dùng tên miền riêng của bạn' })).toBeNull();
    expect(domainApi.fetchLandingCustomDomain).not.toHaveBeenCalled();
  });

  it('tên miền riêng đang chạy: "Gỡ tên miền riêng" hỏi xác nhận (nêu link <slug>.founderai.biz); Huỷ thì không gọi DELETE', async () => {
    domainApi.fetchLandingCustomDomain.mockResolvedValue(CUSTOM_ACTIVE_SERVER);
    renderModal({ slug: 'abc', domainType: 'custom', customDomainHostname: 'lp.example.com', customDomainStatus: 'active' });

    fireEvent.click(await screen.findByRole('button', { name: 'Gỡ tên miền riêng' }));

    const confirm = screen.getByTestId('custom-domain-remove-confirm');
    expect(confirm).toHaveTextContent('Trang sẽ quay về link abc.founderai.biz');
    expect(domainApi.deleteLandingCustomDomain).not.toHaveBeenCalled();

    fireEvent.click(within(confirm).getByRole('button', { name: 'Huỷ' }));
    expect(screen.queryByTestId('custom-domain-remove-confirm')).toBeNull();
    expect(domainApi.deleteLandingCustomDomain).not.toHaveBeenCalled();
  });

  it('xác nhận gỡ → DELETE đúng 1 lần, nạp lại từ server: trang quay về link miễn phí, ô slug hiện lại', async () => {
    domainApi.fetchLandingCustomDomain.mockReset();
    domainApi.fetchLandingCustomDomain.mockResolvedValueOnce(CUSTOM_ACTIVE_SERVER).mockResolvedValue(FREE_SERVER);
    domainApi.deleteLandingCustomDomain.mockResolvedValue({ ok: true });
    const initial = baseForm({ slug: 'abc', domainType: 'custom', customDomainHostname: 'lp.example.com', customDomainStatus: 'active' });
    const { setForm } = renderModal({ ...initial });

    fireEvent.click(await screen.findByRole('button', { name: 'Gỡ tên miền riêng' }));
    fireEvent.click(within(screen.getByTestId('custom-domain-remove-confirm')).getByRole('button', { name: 'Gỡ tên miền' }));

    await waitFor(() => expect(screen.queryByTestId('custom-domain-block')).toBeNull());
    expect(domainApi.deleteLandingCustomDomain).toHaveBeenCalledTimes(1);
    expect(domainApi.deleteLandingCustomDomain).toHaveBeenCalledWith(10);
    expect(domainApi.fetchLandingCustomDomain).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('landing-public-url')).toHaveTextContent('https://abc.founderai.biz');
    expect(screen.getByLabelText(/Đường dẫn miễn phí/)).toHaveValue('abc');
    for (const next of appliedForms(setForm, initial)) {
      expect(next.domainType).toBe('custom');
      expect(next.customDomainHostname).toBe('lp.example.com');
    }
  });

  it('gỡ bị server từ chối (vd trang không có slug) → hiện lỗi, tên miền riêng còn nguyên trên màn hình', async () => {
    domainApi.fetchLandingCustomDomain.mockResolvedValue(CUSTOM_ACTIVE_SERVER);
    domainApi.deleteLandingCustomDomain.mockRejectedValue(
      Object.assign(new Error('400'), { response: { status: 400, data: { message: 'Trang cần đường dẫn (slug) trước khi gỡ tên miền riêng.' } } })
    );
    renderModal({ slug: 'abc', domainType: 'custom', customDomainHostname: 'lp.example.com', customDomainStatus: 'active' });

    fireEvent.click(await screen.findByRole('button', { name: 'Gỡ tên miền riêng' }));
    fireEvent.click(within(screen.getByTestId('custom-domain-remove-confirm')).getByRole('button', { name: 'Gỡ tên miền' }));

    expect(await screen.findByTestId('custom-domain-error')).toHaveTextContent('Trang cần đường dẫn (slug)');
    expect(screen.getByTestId('custom-domain-block')).toHaveTextContent('lp.example.com');
  });

  it('trang không có slug: hộp xác nhận gỡ báo cần slug và tắt nút gỡ', async () => {
    domainApi.fetchLandingCustomDomain.mockResolvedValue(CUSTOM_ACTIVE_SERVER);
    renderModal({ slug: '', domainType: 'custom', customDomainHostname: 'lp.example.com', customDomainStatus: 'active' });

    fireEvent.click(await screen.findByRole('button', { name: 'Gỡ tên miền riêng' }));

    const confirm = screen.getByTestId('custom-domain-remove-confirm');
    expect(confirm).toHaveTextContent('Trang cần đường dẫn (slug)');
    expect(within(confirm).getByRole('button', { name: 'Gỡ tên miền' })).toBeDisabled();
  });

  it('hàng cũ chờ xác minh: hiện bảng DNS lấy từ server + "Kiểm tra lại" gọi API verify (qua api.js, có Bearer — KHÔNG fetch thô) + "Gỡ tên miền riêng"', async () => {
    domainApi.fetchLandingCustomDomain.mockReset();
    domainApi.fetchLandingCustomDomain.mockResolvedValueOnce(CUSTOM_PENDING_SERVER).mockResolvedValue(CUSTOM_ACTIVE_SERVER);
    domainApi.postLandingCustomDomainVerify.mockResolvedValue(CUSTOM_ACTIVE_SERVER);
    renderModal({ slug: 'abc', domainType: 'custom', customDomainHostname: 'lp.example.com', customDomainStatus: 'pending_verification' });

    expect(await screen.findByTestId('custom-domain-dns-table')).toHaveTextContent('founderai.biz');
    expect(screen.getByTestId('custom-domain-status')).toHaveTextContent('Chờ xác minh');
    expect(screen.getByRole('button', { name: 'Gỡ tên miền riêng' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra lại' }));

    await waitFor(() => expect(screen.getByTestId('custom-domain-status')).toHaveTextContent('Đang chạy'));
    expect(domainApi.postLandingCustomDomainVerify).toHaveBeenCalledTimes(1);
    expect(domainApi.postLandingCustomDomainVerify).toHaveBeenCalledWith(10);
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByTestId('landing-public-url')).toHaveTextContent('https://lp.example.com');
  });

  it('"Kiểm tra lại" khi DNS vẫn sai → hiện câu hướng dẫn của server, vẫn "Chờ xác minh"', async () => {
    domainApi.fetchLandingCustomDomain.mockResolvedValue(CUSTOM_PENDING_SERVER);
    domainApi.postLandingCustomDomainVerify.mockRejectedValue(
      Object.assign(new Error('400'), { response: { status: 400, data: { message: 'CNAME chưa đúng. Cần trỏ về: founderai.biz' } } })
    );
    renderModal({ slug: 'abc', domainType: 'custom', customDomainHostname: 'lp.example.com', customDomainStatus: 'pending_verification' });

    fireEvent.click(await screen.findByRole('button', { name: 'Kiểm tra lại' }));

    expect(await screen.findByTestId('custom-domain-error')).toHaveTextContent('CNAME chưa đúng');
    expect(screen.getByTestId('custom-domain-status')).toHaveTextContent('Chờ xác minh');
  });

  it('trang domain_type=custom mà mất hàng tên miền (hỏng): vẫn kết nối được tên miền riêng mới', async () => {
    domainApi.fetchLandingCustomDomain.mockResolvedValue({ configured: false, instructions: null, record: null, dnsRecords: [] });
    renderModal({ slug: 'abc', domainType: 'custom', customDomainHostname: null });

    expect(await screen.findByRole('button', { name: 'Dùng tên miền riêng của bạn' })).toBeInTheDocument();
    expect(screen.getByText(/chưa có tên miền nào được gắn/)).toBeInTheDocument();
    expect(screen.queryByTestId('landing-public-url')).toBeNull();
  });
});

describe('SettingsModal — chốt PR-1: modal không đổi domainType / hostname của form', () => {
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
    domainApi.fetchLandingCustomDomain.mockRejectedValue(new Error('offline'));
    domainApi.postLandingCustomDomainCheck.mockResolvedValue(CHECK_OK);
    domainApi.putLandingCustomDomain.mockResolvedValue(CUSTOM_ACTIVE_SERVER);
    domainApi.postLandingCustomDomainVerify.mockResolvedValue(CUSTOM_ACTIVE_SERVER);
    domainApi.deleteLandingCustomDomain.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(Object.entries(FORMS))('%s: không còn nút "Lưu tên miền" / "Kiểm tra kết nối" cũ, không có hướng dẫn DNS dựng sẵn', (_name, patch) => {
    renderModal(patch);

    expect(screen.queryByRole('checkbox', { name: /tên miền riêng/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Lưu tên miền/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Kiểm tra kết nối/ })).toBeNull();
    expect(screen.queryByTestId('custom-domain-guide')).toBeNull();
    expect(screen.queryByTestId('custom-domain-dns-table')).toBeNull();
  });

  it.each(Object.entries(FORMS))('%s: bấm/gõ vào mọi thứ trong modal KHÔNG làm đổi domainType / tên miền trong form, và không gọi fetch thô', async (_name, patch) => {
    const initial = baseForm(patch);
    const { setForm } = renderModal(patch);

    interactWithEverything();
    await waitFor(() => expect(setForm).toHaveBeenCalled());

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

  it('tab "domain" (ý định chat "đặt tên miền riêng") không tự kết nối hay ghi gì', async () => {
    renderModal({ customDomainHostname: null }, { tab: 'domain' });
    await screen.findByRole('button', { name: 'Dùng tên miền riêng của bạn' });
    expect(domainApi.putLandingCustomDomain).not.toHaveBeenCalled();
    expect(domainApi.postLandingCustomDomainCheck).not.toHaveBeenCalled();
    expect(domainApi.deleteLandingCustomDomain).not.toHaveBeenCalled();
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
