import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const switchContextMock = vi.fn();
let authState = { user: null, activeContext: null, switchContext: switchContextMock };
vi.mock('../../stores/authStore', () => ({
  useAuthStore: () => authState,
}));

import ContextSwitcher from '../ContextSwitcher';

function renderSwitcher(props = {}) {
  return render(
    <MemoryRouter>
      <ContextSwitcher {...props} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authState = { user: null, activeContext: null, switchContext: switchContextMock };
});

describe('<ContextSwitcher /> — guards', () => {
  it('user không có memberships → trả null (không render)', () => {
    authState = {
      user: { fullName: 'A', memberships: [] },
      activeContext: null,
      switchContext: switchContextMock,
    };
    const { container } = renderSwitcher();
    expect(container).toBeEmptyDOMElement();
  });

  it('user undefined → trả null', () => {
    authState = { user: null, activeContext: null, switchContext: switchContextMock };
    const { container } = renderSwitcher();
    expect(container).toBeEmptyDOMElement();
  });
});

describe('<ContextSwitcher /> — expanded (showLabels=true mặc định)', () => {
  beforeEach(() => {
    authState = {
      user: {
        fullName: 'Nguyễn An',
        username: 'an',
        memberships: [
          { ownerId: 5, ownerName: 'Công ty ABC', ownerUsername: 'abc' },
          { ownerId: 7, ownerName: 'Công ty XYZ', ownerUsername: 'xyz' },
        ],
      },
      activeContext: null,
      switchContext: switchContextMock,
    };
  });

  it('hiển thị tên user khi đang ở context cá nhân', () => {
    renderSwitcher();
    expect(screen.getByText('Nguyễn An')).toBeInTheDocument();
    expect(screen.getByText('Tài khoản cá nhân')).toBeInTheDocument();
  });

  it('click trigger → mở dropdown hiển thị 2 memberships', async () => {
    const user = userEvent.setup();
    renderSwitcher();
    await user.click(screen.getByText('Nguyễn An'));
    expect(screen.getByText('Chuyển ngữ cảnh')).toBeInTheDocument();
    expect(screen.getByText(/Làm việc cho \(2\)/)).toBeInTheDocument();
    expect(screen.getByText('Công ty ABC')).toBeInTheDocument();
    expect(screen.getByText('Công ty XYZ')).toBeInTheDocument();
  });

  it('click một membership → switchContext(ownerId) + navigate("/app")', async () => {
    const user = userEvent.setup();
    renderSwitcher();
    await user.click(screen.getByText('Nguyễn An'));
    await user.click(screen.getByText('Công ty XYZ'));
    expect(switchContextMock).toHaveBeenCalledWith(7);
    expect(navigateMock).toHaveBeenCalledWith('/app');
  });

  it('click "Tài khoản cá nhân" trong dropdown → switchContext(null)', async () => {
    authState.activeContext = { type: 'employee', ownerId: 5, ownerName: 'ABC' };
    const user = userEvent.setup();
    renderSwitcher();
    await user.click(screen.getByText('ABC'));
    const selfButtons = screen.getAllByText('Nguyễn An');
    await user.click(selfButtons[selfButtons.length - 1]);
    expect(switchContextMock).toHaveBeenCalledWith(null);
    expect(navigateMock).toHaveBeenCalledWith('/app');
  });

  it('đang ở employee context → hiển thị ownerName ở trigger + class amber', () => {
    authState.activeContext = { type: 'employee', ownerId: 5, ownerName: 'Công ty ABC' };
    renderSwitcher();
    expect(screen.getByText('Công ty ABC')).toBeInTheDocument();
    expect(screen.getByText('Đang làm việc')).toBeInTheDocument();
  });

  it('click outside → đóng dropdown', async () => {
    const user = userEvent.setup();
    renderSwitcher();
    await user.click(screen.getByText('Nguyễn An'));
    expect(screen.getByText('Chuyển ngữ cảnh')).toBeInTheDocument();
    act(() => {
      fireEvent.mouseDown(document.body);
    });
    expect(screen.queryByText('Chuyển ngữ cảnh')).not.toBeInTheDocument();
  });
});

describe('<ContextSwitcher /> — icon-only (showLabels=false)', () => {
  beforeEach(() => {
    authState = {
      user: {
        fullName: 'Bob',
        memberships: [
          { ownerId: 1, ownerName: 'Co A' },
          { ownerId: 2, ownerName: 'Co B' },
        ],
      },
      activeContext: null,
      switchContext: switchContextMock,
    };
  });

  it('chỉ render avatar initial + badge số memberships', () => {
    renderSwitcher({ showLabels: false });
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.queryByText('Tài khoản cá nhân')).not.toBeInTheDocument();
  });

  it('trigger có title chứa "Tài khoản cá nhân" khi không ở employee', () => {
    renderSwitcher({ showLabels: false });
    const trigger = screen.getByText('B').closest('button');
    expect(trigger).toHaveAttribute('title', 'Tài khoản cá nhân');
  });

  it('đang ở employee → title "Đang làm việc cho: <name>" (initial từ ownerName)', () => {
    authState.activeContext = { type: 'employee', ownerId: 1, ownerName: 'Co A' };
    renderSwitcher({ showLabels: false });
    const trigger = screen.getByText('C').closest('button');
    expect(trigger.title).toMatch(/Đang làm việc cho: Co A/);
  });

  it('click avatar → mở DropdownPanel hiển thị memberships', async () => {
    const user = userEvent.setup();
    renderSwitcher({ showLabels: false });
    await user.click(screen.getByText('B').closest('button'));
    expect(screen.getByText('Chuyển ngữ cảnh')).toBeInTheDocument();
    expect(screen.getByText('Co A')).toBeInTheDocument();
    expect(screen.getByText('Co B')).toBeInTheDocument();
  });

  it('avatar fallback "T" khi không có fullName/username', () => {
    authState = {
      user: { memberships: [{ ownerId: 1, ownerName: 'X' }] },
      activeContext: null,
      switchContext: switchContextMock,
    };
    renderSwitcher({ showLabels: false });
    expect(screen.getByText('T')).toBeInTheDocument();
  });
});
