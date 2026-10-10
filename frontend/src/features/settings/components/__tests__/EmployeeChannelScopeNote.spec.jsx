import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import EmployeeChannelScopeNote from '../EmployeeChannelScopeNote';
import { useAuthStore } from '../../../../stores/authStore';

/**
 * PLAN_GIAO_TK_TG_WA PR-H3 — dòng nhắc ở trang cài đặt kênh Telegram / WhatsApp: chỉ hiện với NHÂN VIÊN.
 */
vi.mock('../../../../i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
}));

afterEach(() => {
  useAuthStore.setState({ activeContext: null });
});

describe('EmployeeChannelScopeNote', () => {
  it('ngữ cảnh nhân viên -> hiện dòng "Tài khoản của chủ chỉ hiện khi được giao cho bạn"', () => {
    useAuthStore.setState({ activeContext: { type: 'employee', ownerId: 1 } });
    render(<EmployeeChannelScopeNote />);
    expect(screen.getByTestId('employee-channel-scope-note')).toHaveTextContent('channelAccountScope.employeeNote');
  });

  it('chủ (ngữ cảnh self) hoặc chưa có ngữ cảnh -> không hiện gì', () => {
    useAuthStore.setState({ activeContext: { type: 'self' } });
    const { container, rerender } = render(<EmployeeChannelScopeNote />);
    expect(container).toBeEmptyDOMElement();
    useAuthStore.setState({ activeContext: null });
    rerender(<EmployeeChannelScopeNote />);
    expect(container).toBeEmptyDOMElement();
  });
});
