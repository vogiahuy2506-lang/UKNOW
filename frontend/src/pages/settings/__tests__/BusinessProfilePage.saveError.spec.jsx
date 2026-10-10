/**
 * M3-2 (đợt 2) — lưu hồ sơ doanh nghiệp lỗi có mã (vd EXTRA_CONTEXT_TOO_LONG) thì hiện đúng câu máy chủ,
 * không phải toast chung "lưu thất bại".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import toast from 'react-hot-toast';
import BusinessProfilePage from '../BusinessProfilePage';
import businessProfileApiService from '../../../features/settings/services/businessProfileApi.service';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../i18n', () => ({ useI18n: () => ({ t: (k) => k, locale: 'vi' }) }));
vi.mock('../../../features/settings/services/businessProfileApi.service', () => ({
  default: { getBusinessProfile: vi.fn(), saveBusinessProfile: vi.fn(), uploadLogo: vi.fn() },
}));
vi.mock('../../../features/products/services/productApi.service', () => ({
  default: { getProducts: vi.fn().mockResolvedValue({ data: { data: { products: [], pagination: { total: 0 } } } }) },
}));
vi.mock('../../../features/storage/useStorageQuota', () => ({ default: () => ({ usage: null }) }));

const submit = async () => {
  const { container } = render(<MemoryRouter><BusinessProfilePage /></MemoryRouter>);
  await waitFor(() => expect(businessProfileApiService.getBusinessProfile).toHaveBeenCalled());
  const form = await waitFor(() => {
    const f = container.querySelector('form');
    expect(f).toBeTruthy();
    return f;
  });
  fireEvent.submit(form);
};

describe('BusinessProfilePage — lỗi lưu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    businessProfileApiService.getBusinessProfile.mockResolvedValue({ data: { company_name: 'Cty A' } });
  });

  it('lỗi có code + message -> toast đúng câu máy chủ', async () => {
    businessProfileApiService.saveBusinessProfile.mockRejectedValue({
      response: { status: 400, data: { code: 'EXTRA_CONTEXT_TOO_LONG', message: 'Phần Thông tin bổ sung quá dài, hãy rút gọn.' } },
    });
    await submit();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Phần Thông tin bổ sung quá dài, hãy rút gọn.'));
  });

  it('lỗi không có code (mạng/500) -> vẫn toast chung', async () => {
    businessProfileApiService.saveBusinessProfile.mockRejectedValue(new Error('Network Error'));
    await submit();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('businessProfile.saveFailed'));
  });
});
