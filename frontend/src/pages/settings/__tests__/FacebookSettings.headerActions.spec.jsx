/**
 * Đầu trang Facebook (11/10/2026): thêm "Làm mới" cạnh nút "Kết nối tài khoản Facebook" cho đồng bộ với 4 tab kênh còn lại.
 * "Làm mới" ở đầu trang tải lại DANH SÁCH kết nối (loadConnections), KHÔNG làm mới token (đó là nút trên từng dòng).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FacebookSettings from '../FacebookSettings';
import facebookSettingsApiService from '../../../features/settings/services/facebookSettingsApi.service';

// `t` phải ỔN ĐỊNH: FacebookSettings có effect phụ thuộc `t`, t mới mỗi lần render sẽ làm effect chạy vô hạn.
const stableT = (key) => key;
vi.mock('../../../i18n', () => ({
  useI18n: () => ({ t: stableT }),
}));

vi.mock('../../../features/settings/services/facebookSettingsApi.service', () => ({
  default: {
    listConnections: vi.fn(),
    initOAuth: vi.fn(),
    refreshToken: vi.fn(),
    disconnect: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const conn = {
  id: 1,
  fb_page_id: '123',
  fb_page_name: 'Trang A',
  has_credentials: true,
  token_expires_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  facebookSettingsApiService.listConnections.mockResolvedValue({ data: { data: [conn] } });
});

describe('FacebookSettings — nút đầu trang', () => {
  it('có cả "Làm mới" và "Kết nối tài khoản Facebook" ở đầu trang', async () => {
    render(<FacebookSettings />);
    await waitFor(() => expect(screen.getByText('Trang A')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'common.refresh' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'facebookSettings.connectAccount' })).toBeInTheDocument();
  });

  it('"Làm mới" tải lại danh sách (listConnections lần 2), không động tới token', async () => {
    render(<FacebookSettings />);
    await waitFor(() => expect(screen.getByText('Trang A')).toBeInTheDocument());
    expect(facebookSettingsApiService.listConnections).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'common.refresh' }));

    await waitFor(() => expect(facebookSettingsApiService.listConnections).toHaveBeenCalledTimes(2));
    expect(facebookSettingsApiService.refreshToken).not.toHaveBeenCalled();
  });
});
