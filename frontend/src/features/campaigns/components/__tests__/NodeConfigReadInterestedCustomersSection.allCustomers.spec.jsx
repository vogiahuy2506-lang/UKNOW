import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../../i18n';
import { NodeConfigReadInterestedCustomersSection } from '../NodeConfigModalReadInterestedCustomersSection';

/**
 * PR-5 "Khách hàng đã lưu = toàn bộ khách": trình dựng có lựa chọn ĐẦU TIÊN "Tất cả khách hàng".
 * Chọn nó thì interestedCustomerType = 'all', ẩn mục lọc khoá học và nâng trần số bản ghi lên 50.000.
 * Khối cũ không có trường thì vẫn là 'interested' (mặc định không đổi).
 */
vi.mock('../../utils/nodeConfigModal.helpers', () => ({
  fetchInterestedCustomerCoursesLocal: vi.fn().mockResolvedValue([]),
}));

function Harness({ initial = {} }) {
  const [formData, setFormData] = useState({
    label: 'Lấy dữ liệu khách hàng',
    interestedLimit: 1000,
    interestedCourseIds: [],
    interestedCourseStatuses: [],
    ...initial,
  });
  const [section, setSection] = useState('basic');
  return (
    <div>
      <NodeConfigReadInterestedCustomersSection
        formData={formData}
        setFormData={setFormData}
        selectedReadInterestedCustomersSection={section}
        setSelectedReadInterestedCustomersSection={setSection}
        interestedCourseOptions={[]}
        isLoadingInterestedCourses={false}
        courseSearchQuery=""
        setCourseSearchQuery={() => {}}
        testPreviewItems={[]}
        setTestPreviewItems={() => {}}
        isLoadingTestPreview={false}
        setIsLoadingTestPreview={() => {}}
        testPreviewSearchQuery=""
        setTestPreviewSearchQuery={() => {}}
        campaignId={null}
      />
      <pre data-testid="form-data-json">{JSON.stringify(formData)}</pre>
    </div>
  );
}

function renderHarness(initial = {}) {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <Harness initial={initial} />
      </I18nProvider>
    </MemoryRouter>
  );
}

const readForm = () => JSON.parse(screen.getByTestId('form-data-json').textContent);

describe('NodeConfigReadInterestedCustomersSection — Tất cả khách hàng (PR-5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('có lựa chọn "Tất cả khách hàng" đứng ĐẦU danh sách điều kiện', () => {
    renderHarness();
    const radios = screen.getAllByRole('radio', { name: /./ }).filter((r) => r.getAttribute('name') === 'interestedCustomerType');
    expect(radios.map((r) => r.getAttribute('value'))).toEqual(['all', 'interested', 'purchased', 'both']);
    expect(screen.getByText('Tất cả khách hàng')).toBeInTheDocument();
  });

  it('khối cũ chưa có interestedCustomerType vẫn hiển thị là "interested"', () => {
    renderHarness();
    const interested = screen.getAllByRole('radio').find((r) => r.getAttribute('value') === 'interested');
    expect(interested).toBeChecked();
  });

  it('chọn "Tất cả khách hàng" → interestedCustomerType = all, nguồn database, trần 50.000, ẩn mục lọc khoá học', async () => {
    const user = userEvent.setup();
    renderHarness({ interestedDataSource: 'api', interestedCourseIds: [5] });
    expect(screen.getByText('Lọc khóa học')).toBeInTheDocument();

    await user.click(screen.getByText('Tất cả khách hàng'));

    const form = readForm();
    expect(form.interestedCustomerType).toBe('all');
    expect(form.interestedDataSource).toBe('database');
    expect(form.interestedLimit).toBe(50000);
    expect(form.interestedCourseIds).toEqual([]);
    expect(screen.queryByText('Lọc khóa học')).not.toBeInTheDocument();
  });

  it('rời "Tất cả khách hàng" → trần quay về 1.000 (5.000 là trần các loại khác)', async () => {
    const user = userEvent.setup();
    renderHarness({ interestedCustomerType: 'all', interestedLimit: 50000 });
    await user.click(screen.getByText('Cả hai'));
    const form = readForm();
    expect(form.interestedCustomerType).toBe('both');
    expect(form.interestedLimit).toBe(1000);
  });
});
