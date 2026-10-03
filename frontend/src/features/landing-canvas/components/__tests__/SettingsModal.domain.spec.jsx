import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SettingsModal from '../SettingsModal.jsx';

vi.mock('../../../../services/api.js');

vi.mock('../../../../i18n', () => ({
  useI18n: (namespace = null) => {
    const t = (key) => (namespace ? `${namespace}.${key}` : key);
    if (namespace) return t;
    return { t, locale: 'vi' };
  },
}));

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

function renderModal(formPatch = {}) {
  const form = {
    title: 'Trang thử',
    slug: 'abc',
    htmlContent: '',
    isPublished: true,
    domainType: 'system',
    customDomainHostname: null,
    customDomainIsApex: false,
    ...formPatch,
  };
  return render(
    <SettingsModal open onClose={vi.fn()} form={form} setForm={vi.fn()} editingId={10} />
  );
}

/**
 * Bug 03/10/2026: `landing_page_domains` lưu CẢ tên miền miễn phí `<slug>.founderai.biz` (cf_managed)
 * lẫn tên miền riêng, nên API trả `customDomainHostname = 'abc.founderai.biz'` cho trang miễn phí.
 * Modal suy "chế độ tên miền riêng" từ việc hostname có giá trị → mở nhầm tab + hướng dẫn CNAME vô nghĩa.
 */
describe('SettingsModal — chế độ tên miền', () => {
  it('trang dùng tên miền MIỄN PHÍ (hostname = <slug>.founderai.biz) → KHÔNG ở chế độ tên miền riêng', () => {
    renderModal({ slug: 'abc', domainType: 'system', customDomainHostname: 'abc.founderai.biz' });

    // Ô nhập tên miền riêng (chỉ có ở chế độ custom) không được render.
    expect(screen.queryByPlaceholderText(HOSTNAME_PLACEHOLDER)).toBeNull();
    // Link đang dùng vẫn là địa chỉ miễn phí.
    expect(screen.getAllByText('abc.founderai.biz').length).toBeGreaterThan(0);
  });

  it('hostname dưới founderai.biz (www./subdomain khác) cũng không phải tên miền riêng', () => {
    renderModal({ slug: 'abc', customDomainHostname: 'www.founderai.biz' });
    expect(screen.queryByPlaceholderText(HOSTNAME_PLACEHOLDER)).toBeNull();
  });

  it('trang có tên miền RIÊNG → mở ở chế độ tên miền riêng, điền sẵn hostname', () => {
    renderModal({ domainType: 'custom', customDomainHostname: 'lp.example.com' });

    const input = screen.getByPlaceholderText(HOSTNAME_PLACEHOLDER);
    expect(input).toHaveValue('lp.example.com');
  });

  it('trang chưa có hostname nào → chế độ miễn phí', () => {
    renderModal({ customDomainHostname: null });
    expect(screen.queryByPlaceholderText(HOSTNAME_PLACEHOLDER)).toBeNull();
  });
});
