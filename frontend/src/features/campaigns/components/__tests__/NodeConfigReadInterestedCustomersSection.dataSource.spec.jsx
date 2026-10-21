import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { I18nProvider } from '../../../../i18n';
import { useAuthStore } from '../../../../stores/authStore';
import { NodeConfigReadInterestedCustomersSection } from '../NodeConfigModalReadInterestedCustomersSection';

/**
 * PLAN_VA_CO_LAP_DU_LIEU_TENANT_DOT2 PR-D (D3) — nguồn "API Founder AI" của node đọc khách quan tâm đọc khách/đơn của cửa hàng
 * NỀN TẢNG: backend chỉ cho workspace của super admin (403 / 0 người với chủ thường). Giao diện chỉ hiện lựa chọn đó cho
 * super admin; node ĐÃ LƯU `api` thì vẫn hiện đúng giá trị đang lưu (không âm thầm đổi cấu hình).
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

const renderHarness = (initial = {}) => render(
  <MemoryRouter>
    <I18nProvider>
      <Harness initial={initial} />
    </I18nProvider>
  </MemoryRouter>
);

const dataSourceRadios = () => screen.getAllByRole('radio').filter((r) => r.getAttribute('name') === 'interestedDataSource');
const readForm = () => JSON.parse(screen.getByTestId('form-data-json').textContent);

describe('NodeConfigReadInterestedCustomersSection — nguồn dữ liệu chỉ hiện "API" cho super admin (D3)', () => {
  let previousUser;
  beforeEach(() => {
    vi.clearAllMocks();
    previousUser = useAuthStore.getState().user;
  });
  afterEach(() => {
    useAuthStore.setState({ user: previousUser });
  });

  it('tài khoản thường: chỉ có lựa chọn Cơ sở dữ liệu, không thấy "API Founder AI"', () => {
    useAuthStore.setState({ user: { id: 5, role: 'user' } });
    renderHarness();
    expect(dataSourceRadios().map((r) => r.getAttribute('value'))).toEqual(['database']);
    expect(screen.queryByText('API Founder AI')).not.toBeInTheDocument();
  });

  it('super admin: thấy cả Cơ sở dữ liệu và "API Founder AI" như cũ', () => {
    useAuthStore.setState({ user: { id: 1, role: 'admin' } });
    renderHarness();
    expect(dataSourceRadios().map((r) => r.getAttribute('value'))).toEqual(['database', 'api']);
    expect(screen.getByText('API Founder AI')).toBeInTheDocument();
  });

  it('tài khoản thường mở node ĐÃ LƯU nguồn api: vẫn hiện đúng giá trị đang lưu (được chọn) và không đổi cấu hình', () => {
    useAuthStore.setState({ user: { id: 5, role: 'user' } });
    renderHarness({ interestedDataSource: 'api' });
    const radios = dataSourceRadios();
    expect(radios.map((r) => r.getAttribute('value'))).toEqual(['database', 'api']);
    expect(radios.find((r) => r.getAttribute('value') === 'api')).toBeChecked();
    expect(readForm().interestedDataSource).toBe('api');
  });

  it('chưa đăng nhập / chưa có user: coi như không phải super admin', () => {
    useAuthStore.setState({ user: null });
    renderHarness();
    expect(dataSourceRadios().map((r) => r.getAttribute('value'))).toEqual(['database']);
  });
});
