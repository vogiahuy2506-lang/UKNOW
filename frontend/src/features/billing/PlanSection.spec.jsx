import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import PlanSection from './PlanSection';

// limit hiển thị thẳng ra DOM (thay vì mock rỗng) để test được giá trị PlanSection truyền xuống —
// đây chính là chỗ bug null→0 xảy ra (PlanSection tự tính limit trước khi giao cho UsageBar).
vi.mock('./UsageBar', () => ({
  default: ({ label, limit }) => <div data-testid={`usage-${label}`}>{String(limit)}</div>,
}));
vi.mock('../storage/StorageUsageSection', () => ({ default: () => null }));

const labels = {
  'accountProfileModal.free': 'Miễn phí',
  'accountProfileModal.contactForPrice': 'Liên hệ',
  'accountProfileModal.perMonth': '/tháng',
  'accountProfileModal.perYear': '/năm',
  'accountProfileModal.billingMonthly': 'Theo tháng',
  'accountProfileModal.billingYearly': 'Theo năm',
};

const t = (key) => labels[key] || key;

const baseData = {
  activePlanId: 15,
  activePlanName: 'Starter',
  activePlanCode: 'starter',
  activePlanFeatures: [],
  planMaxEmployees: null,
  subscriptionExpiresAt: null,
};

function renderPlan(data) {
  return render(
    <I18nProvider>
      <PlanSection data={{ ...baseData, ...data }} t={t} />
    </I18nProvider>,
  );
}

describe('PlanSection billing display', () => {
  it('uses yearly price and label when the active period is yearly', () => {
    renderPlan({ activeBillingPeriod: 'yearly', activePlanPriceYearly: '2870400' });

    expect(screen.getByText('2.870.400 ₫')).toBeInTheDocument();
    expect(screen.getByText('/năm')).toBeInTheDocument();
    expect(screen.getByText('Theo năm')).toBeInTheDocument();
  });

  it('renders the free label when PostgreSQL returns numeric zero as a string', () => {
    renderPlan({ activeBillingPeriod: 'monthly', activePlanPrice: '0.00' });

    expect(screen.getByText('Miễn phí')).toBeInTheDocument();
    expect(screen.queryByText('0 ₫')).not.toBeInTheDocument();
  });

  it('keeps a free yearly entitlement free when a legacy plan has no yearly price', () => {
    renderPlan({
      activeBillingPeriod: 'yearly',
      activePlanPrice: '0.00',
      activePlanPriceYearly: null,
    });

    expect(screen.getByText('Miễn phí')).toBeInTheDocument();
    expect(screen.queryByText('Liên hệ')).not.toBeInTheDocument();
    expect(screen.queryByText('/năm')).not.toBeInTheDocument();
  });
});

// fix/goi-giu-cho-admin, Việc 4 — gói giữ chỗ "Tùy chọn"/"Liên hệ" (code custom/contact, is_custom=false)
// hiện "Liên hệ" thay vì "Miễn phí" dù price=0, để không trông như một gói miễn phí thật.
describe('PlanSection — nhãn giá gói giữ chỗ', () => {
  it('gói giữ chỗ (activePlanCode=custom, activePlanIsCustom=false, price=0) → "Liên hệ" thay vì "Miễn phí"', () => {
    renderPlan({ activePlanCode: 'custom', activePlanIsCustom: false, activePlanPrice: '0.00' });

    expect(screen.getByText('Liên hệ')).toBeInTheDocument();
    expect(screen.queryByText('Miễn phí')).not.toBeInTheDocument();
  });

  it('gói dùng thử giá 0 (code trial, không phải giữ chỗ) → vẫn "Miễn phí" như cũ', () => {
    renderPlan({ activePlanCode: 'trial', activePlanIsCustom: false, activePlanPrice: '0.00' });

    expect(screen.getByText('Miễn phí')).toBeInTheDocument();
    expect(screen.queryByText('Liên hệ')).not.toBeInTheDocument();
  });

  // Đột biến bắt được: nếu bỏ điều kiện is_custom trên FE, ca này đỏ vì gói custom thật (giá thật) bị
  // hiện nhầm "Liên hệ" thay vì giá.
  it('gói custom THẬT (activePlanCode=custom nhưng activePlanIsCustom=true) → hiện giá thật, không phải "Liên hệ"', () => {
    renderPlan({ activePlanCode: 'custom', activePlanIsCustom: true, activePlanPrice: '900000' });

    expect(screen.getByText('900.000 ₫')).toBeInTheDocument();
    expect(screen.queryByText('Liên hệ')).not.toBeInTheDocument();
  });
});

// fix/goi-giu-cho-admin, Việc 5 — PlanSection tự collapse null → 0 trước khi giao cho UsageBar, làm
// mất ý nghĩa "không giới hạn" (backend trả null cho hạn mức không giới hạn; UsageBar tự nhận biết
// null/undefined/âm qua isUnlimitedPlanLimit, nhưng PlanSection đã biến null thành 0 trước khi tới đó).
describe('PlanSection — hạn mức null phải hiện không giới hạn, không phải 0', () => {
  it('maxZaloAccounts = null (gói giữ chỗ) → limit = -1 (không giới hạn), không phải 0', () => {
    renderPlan({ maxZaloAccounts: null, zaloAccountsUsed: 7 });
    expect(screen.getByTestId('usage-topup.items.zaloAccounts').textContent).toBe('-1');
  });

  it('maxZaloAccounts = 0 (trần thật) → limit vẫn = 0, KHÔNG bị hiểu là không giới hạn', () => {
    renderPlan({ maxZaloAccounts: 0 });
    expect(screen.getByTestId('usage-topup.items.zaloAccounts').textContent).toBe('0');
  });

  it('maxZaloAccounts = 2 kèm addon 3 → limit = 5 (addon vẫn cộng đúng khi có trần thật)', () => {
    renderPlan({ maxZaloAccounts: 2, addons: { zaloAccounts: 3 } });
    expect(screen.getByTestId('usage-topup.items.zaloAccounts').textContent).toBe('5');
  });

  it('planMaxEmployees = null (mặc định baseData) → dòng nhân viên cũng bị cùng lỗi, phải = -1', () => {
    renderPlan({});
    expect(screen.getByTestId('usage-topup.items.employees').textContent).toBe('-1');
  });
});
