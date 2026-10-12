import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../../i18n';

const { mockGetAllUsers, mockCountRecipients } = vi.hoisted(() => ({
  mockGetAllUsers: vi.fn(),
  mockCountRecipients: vi.fn(),
}));

vi.mock('../../services/adminNotificationApi.service', () => ({
  default: {
    getAllUsers: mockGetAllUsers,
    countRecipients: mockCountRecipients,
  },
}));

import TargetingPanel from '../TargetingPanel';

// Hình dạng THẬT của GET /admin/members: camelCase (fullName, planCode, planName), xem adminMembers.repository.js.
const NAMES = ['An', 'Bình', 'Chi', 'Dũng', 'Em', 'Phương', 'Giang', 'Hà', 'Lan Anh', 'Kim Lan', 'Lan', 'Minh'];
const PLAN_OF = (i) => (i < 4 ? ['trial', 'Dùng thử'] : i < 8 ? ['starter', 'Starter'] : ['professional', 'Chuyên nghiệp']);
const USERS = NAMES.map((fullName, i) => {
  const [planCode, planName] = PLAN_OF(i);
  return { id: 100 + i, fullName, email: `u${100 + i}@example.com`, username: `u${100 + i}`, status: 'active', planCode, planName };
});

function renderPanel(props = {}) {
  const onChange = vi.fn();
  const { container } = render(
    <I18nProvider defaultLocale="vi">
      <TargetingPanel criteria={{}} onChange={onChange} {...props} />
    </I18nProvider>,
  );
  return { onChange, container };
}

const lastIds = (onChange) => onChange.mock.calls.at(-1)[0].user_ids;
const waitUsers = () => screen.findByText('Minh');
// Nút xoá trên từng chip có aria-label "Bỏ chọn <tên>"; loại hai nút chung "Bỏ chọn tất cả" / "Bỏ chọn kết quả lọc (M)".
const chipRemoveButtons = () => screen
  .queryAllByRole('button', { name: /^Bỏ chọn / })
  .filter((b) => !/^Bỏ chọn (tất cả|kết quả lọc)/.test(b.getAttribute('aria-label') || b.textContent));

describe('TargetingPanel - chọn người dùng', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllUsers.mockResolvedValue({ data: { success: true, data: USERS } });
    mockCountRecipients.mockResolvedValue({ data: { data: { count: 0 } } });
  });

  it('danh sách hiện sẵn khi mở: không còn nút "Chọn người dùng" để bật/tắt, không có nút "Xong" thứ hai', async () => {
    renderPanel();
    await waitUsers();
    expect(mockGetAllUsers).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /Chọn người dùng$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xong' })).not.toBeInTheDocument();
  });

  it('không in số hai lần: "Đã chọn: 2 người" (không phải "2 2 người") ở hộp tóm tắt và ở chân danh sách', async () => {
    const { container } = renderPanel();
    await waitUsers();
    fireEvent.click(screen.getByText('An'));
    fireEvent.click(screen.getByText('Bình'));
    expect(container.textContent).toContain('Đã chọn: 2 người');
    expect(container.textContent).not.toMatch(/2\s*2\s*người/);
    // hộp tóm tắt phía trên chỉ có "2 người", không có số thừa đứng trước
    expect(screen.getByText('2 người', { selector: 'p' })).toBeInTheDocument();
  });

  it('"Chọn tất cả người dùng (N)" → onChange nhận ĐỦ N user_ids, nhãn đổi thành "Bỏ chọn tất cả" (chỉ một nút), bấm lại thì bỏ hết', async () => {
    const { onChange } = renderPanel();
    await waitUsers();
    fireEvent.click(screen.getByRole('button', { name: `Chọn tất cả người dùng (${USERS.length})` }));
    expect(lastIds(onChange)).toHaveLength(USERS.length);
    expect(new Set(lastIds(onChange))).toEqual(new Set(USERS.map((u) => u.id)));
    expect(screen.queryByRole('button', { name: /^Chọn tất cả người dùng/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Bỏ chọn tất cả' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ chọn tất cả' }));
    expect(lastIds(onChange)).toEqual([]);
    expect(screen.getByRole('button', { name: `Chọn tất cả người dùng (${USERS.length})` })).toBeInTheDocument();
  });

  it('"Chọn tất cả" bỏ qua ô tìm kiếm: đang lọc 3 người vẫn chọn đủ N', async () => {
    const { onChange } = renderPanel();
    await waitUsers();
    fireEvent.change(screen.getByPlaceholderText(/Tìm kiếm/), { target: { value: 'Lan' } });
    fireEvent.click(screen.getByRole('button', { name: `Chọn tất cả người dùng (${USERS.length})` }));
    expect(lastIds(onChange)).toHaveLength(USERS.length);
  });

  it('tìm kiếm → "Chọn kết quả lọc (M)" chỉ THÊM M người khớp (giữ người đã chọn trước đó); không tìm thì không có nút này', async () => {
    const { onChange } = renderPanel();
    await waitUsers();
    expect(screen.queryByRole('button', { name: /Chọn kết quả lọc/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Minh')); // người đã chọn từ trước, không khớp tìm kiếm
    fireEvent.change(screen.getByPlaceholderText(/Tìm kiếm/), { target: { value: 'Lan' } });
    const M = USERS.filter((u) => u.fullName.includes('Lan')).length;
    expect(M).toBe(3);
    fireEvent.click(screen.getByRole('button', { name: `Chọn kết quả lọc (${M})` }));

    const ids = lastIds(onChange);
    expect(ids).toHaveLength(M + 1);
    expect(ids).toContain(USERS.find((u) => u.fullName === 'Minh').id);
    expect(ids).not.toContain(USERS.find((u) => u.fullName === 'An').id);
    // đã chọn hết kết quả lọc → nút đảo chiều và chỉ bỏ M người đó
    fireEvent.click(screen.getByRole('button', { name: `Bỏ chọn kết quả lọc (${M})` }));
    expect(lastIds(onChange)).toEqual([USERS.find((u) => u.fullName === 'Minh').id]);
  });

  it('30 người đã chọn → chỉ 20 chip + "+ 10 người khác"', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: 500 + i, fullName: `Khách ${i}`, email: `k${i}@example.com`, status: 'active', planCode: 'starter', planName: 'Starter',
    }));
    mockGetAllUsers.mockResolvedValue({ data: { success: true, data: many } });
    renderPanel();
    await screen.findByText('Khách 29');
    fireEvent.click(screen.getByRole('button', { name: 'Chọn tất cả người dùng (30)' }));
    expect(chipRemoveButtons()).toHaveLength(20);
    expect(screen.getByText('+ 10 người khác')).toBeInTheDocument();
  });

  it('ít hơn 20 người thì không có dòng "+ N người khác"', async () => {
    renderPanel();
    await waitUsers();
    fireEvent.click(screen.getByText('An'));
    expect(chipRemoveButtons()).toHaveLength(1);
    expect(screen.queryByText(/người khác/)).not.toBeInTheDocument();
  });

  it('lọc gói dùng plan_code THẬT có trong dữ liệu (trial/starter/professional), không phải free/pro cứng; chọn gói ra đúng người', async () => {
    renderPanel();
    await waitUsers();
    const planSelect = screen.getAllByRole('combobox')[0];
    const options = within(planSelect).getAllByRole('option').map((o) => [o.value, o.textContent]);
    expect(options).toEqual([
      ['', 'Tất cả gói'],
      ['professional', 'Chuyên nghiệp'],
      ['trial', 'Dùng thử'],
      ['starter', 'Starter'],
    ]);
    expect(options.map(([v]) => v)).not.toContain('pro');
    expect(options.map(([v]) => v)).not.toContain('free');

    fireEvent.change(planSelect, { target: { value: 'professional' } });
    const proUsers = USERS.filter((u) => u.planCode === 'professional');
    expect(proUsers).toHaveLength(4);
    for (const u of USERS) {
      if (u.planCode === 'professional') expect(screen.getByText(u.fullName)).toBeInTheDocument();
      else expect(screen.queryByText(u.fullName)).not.toBeInTheDocument();
    }
  });

  it('lỗi tải người dùng → không vỡ, nút "Chọn tất cả" khoá', async () => {
    mockGetAllUsers.mockRejectedValue(new Error('boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderPanel();
    await waitFor(() => expect(mockGetAllUsers).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'Chọn tất cả người dùng (0)' })).toBeDisabled();
    errSpy.mockRestore();
  });
});
