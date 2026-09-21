/**
 * Cổng route theo quyền nhân viên. Ca mới của PLAN_NHAN_VIEN PR-3 mục 5.2: thiếu quyền thì màn "không có
 * quyền" phải được gọi với reason="permission" — đó là thứ làm nhân viên thấy câu "{công ty} chưa cấp quyền
 * này cho bạn" và nút kiểm tra lại thay vì câu chung.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PermissionRoute from './PermissionRoute';
import { useAuthStore } from '../../stores/authStore';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { data: {} } }), post: vi.fn() },
  setAuthStore: vi.fn(),
}));
vi.mock('../../pages/auth/UnauthorizedScreen', () => ({
  default: ({ reason }) => <div data-testid="unauthorized" data-reason={reason ?? ''} />,
}));

const setContext = (activeContext) => useAuthStore.setState({ activeContext });
const renderRoute = (permission) => render(
  <PermissionRoute permission={permission}><div data-testid="noi-dung" /></PermissionRoute>
);

beforeEach(() => {
  setContext({ type: 'self' });
});

describe('PermissionRoute', () => {
  it('self context luôn vào được, không cần quyền', () => {
    renderRoute('reports_view');
    expect(screen.getByTestId('noi-dung')).toBeInTheDocument();
  });

  it('nhân viên có quyền → vào được', () => {
    setContext({ type: 'employee', permissions: { reports_view: true } });
    renderRoute('reports_view');
    expect(screen.getByTestId('noi-dung')).toBeInTheDocument();
  });

  it('nhân viên thiếu quyền → màn không có quyền với reason="permission"', () => {
    setContext({ type: 'employee', permissions: { campaigns_view: true } });
    renderRoute('reports_view');

    expect(screen.queryByTestId('noi-dung')).not.toBeInTheDocument();
    expect(screen.getByTestId('unauthorized')).toHaveAttribute('data-reason', 'permission');
  });

  it('permissions là [] (nhân viên mới) → bị chặn với reason="permission"', () => {
    setContext({ type: 'employee', permissions: [] });
    renderRoute('campaigns_view');
    expect(screen.getByTestId('unauthorized')).toHaveAttribute('data-reason', 'permission');
  });

  it('danh sách quyền: có MỘT trong số đó là đủ (any-of)', () => {
    setContext({ type: 'employee', permissions: { zalo_settings: true } });
    renderRoute(['email_settings', 'zalo_settings']);
    expect(screen.getByTestId('noi-dung')).toBeInTheDocument();
  });

  it('quyền chỉ là chuỗi "true" (không phải boolean true) → không tính', () => {
    setContext({ type: 'employee', permissions: { reports_view: 'true' } });
    renderRoute('reports_view');
    expect(screen.getByTestId('unauthorized')).toBeInTheDocument();
  });
});
