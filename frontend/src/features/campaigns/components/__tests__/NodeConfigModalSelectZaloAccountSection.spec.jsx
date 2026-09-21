/**
 * Lệnh giao 21/09/2026, PR-3. Ô chọn tài khoản Zalo hiện "Chưa có tài khoản Zalo khả dụng" trong khi
 * production có 3 tài khoản — vì mọi lỗi tải danh sách bị nuốt thành mảng rỗng. Chỉ khi API trả THÀNH
 * CÔNG mà rỗng mới được nói vậy.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NodeConfigSelectZaloAccountSection } from '../NodeConfigModalSelectZaloAccountSection';
import viTranslations from '../../../../i18n/vi';

const mockT = (key) => key.split('.').reduce((acc, part) => acc?.[part], viTranslations) ?? key;
vi.mock('../../../../i18n', () => ({ useI18n: () => ({ t: mockT }) }));

const NO_ACCOUNTS = 'Chưa có tài khoản Zalo khả dụng. Vui lòng vào trang Cài đặt Zalo để đăng nhập tài khoản.';
const accounts = [
  { id: '34', displayName: 'Tài khoản mặc định', status: 'connected', isActive: true, isDefault: true },
  { id: '35', displayName: 'Tài khoản phụ', status: 'connected', isActive: true, isDefault: false },
];

const renderSection = (props = {}) => render(
  <NodeConfigSelectZaloAccountSection formData={{ label: '', zaloAccountId: '' }} setFormData={vi.fn()} {...props} />,
);

describe('NodeConfigSelectZaloAccountSection — trạng thái tải danh sách', () => {
  it('loaded + mảng rỗng → nói "Chưa có tài khoản Zalo khả dụng" như cũ', () => {
    renderSection({ zaloAccounts: [], zaloAccountsStatus: 'loaded' });
    expect(screen.getByText(NO_ACCOUNTS)).toBeInTheDocument();
  });

  it('không truyền status (gọi kiểu cũ) → mặc định loaded, hành vi cũ giữ nguyên', () => {
    renderSection({ zaloAccounts: [] });
    expect(screen.getByText(NO_ACCOUNTS)).toBeInTheDocument();
  });

  it('error → hộp đỏ nêu nguyên nhân + nút Thử lại, KHÔNG nói "chưa có tài khoản"', () => {
    const onRetry = vi.fn();
    renderSection({ zaloAccounts: [], zaloAccountsStatus: 'error', zaloAccountsError: 'timeout of 10000ms exceeded', onRetryZaloAccounts: onRetry });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Không tải được danh sách tài khoản Zalo.');
    expect(alert).toHaveTextContent('timeout of 10000ms exceeded');
    expect(alert.className).toContain('bg-red-50');
    expect(screen.queryByText(NO_ACCOUNTS)).not.toBeInTheDocument();
    expect(screen.queryByText(/Chưa có tài khoản Zalo/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('error không có nguyên nhân cụ thể → vẫn có hộp đỏ, không dòng nguyên nhân rỗng', () => {
    renderSection({ zaloAccounts: [], zaloAccountsStatus: 'error', zaloAccountsError: '', onRetryZaloAccounts: vi.fn() });
    expect(screen.getByRole('alert').querySelectorAll('p')).toHaveLength(1);
  });

  it('error ở chế độ pool cũng không hiện "Chưa có tài khoản Zalo. Vui lòng thêm ở Cài đặt Zalo."', () => {
    renderSection({
      formData: { label: '', zaloPoolMultiAccountEnabled: true, zaloPoolAccountIds: [] },
      zaloAccounts: [], zaloAccountsStatus: 'error', zaloAccountsError: 'Network Error', onRetryZaloAccounts: vi.fn(),
    });
    expect(screen.queryByText(/Vui lòng thêm ở Cài đặt Zalo/)).not.toBeInTheDocument();
  });

  it.each([['idle'], ['loading']])('%s → KHÔNG kết luận "chưa có tài khoản" (chưa biết), KHÔNG hộp đỏ', (zaloAccountsStatus) => {
    renderSection({ zaloAccounts: [], zaloAccountsStatus });
    expect(screen.queryByText(NO_ACCOUNTS)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('loading → có dòng "Đang tải danh sách tài khoản Zalo…"; idle (bị huỷ) → không hiện gì thêm', () => {
    const { unmount } = renderSection({ zaloAccounts: [], zaloAccountsStatus: 'loading' });
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải danh sách tài khoản Zalo…');
    unmount();
    renderSection({ zaloAccounts: [], zaloAccountsStatus: 'idle' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('có tài khoản → liệt kê, tài khoản mặc định lên đầu, không thông báo nào', () => {
    renderSection({ zaloAccounts: [...accounts].reverse(), zaloAccountsStatus: 'loaded' });
    const options = [...document.querySelectorAll('option')].map((o) => o.textContent.trim());
    expect(options[1]).toContain('Tài khoản mặc định');
    expect(options[2]).toContain('Tài khoản phụ');
    expect(screen.queryByText(NO_ACCOUNTS)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
