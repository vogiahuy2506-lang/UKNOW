import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../../i18n';
import { NodeConfigReadLandingLeadsSection } from '../NodeConfigReadLandingLeadsSection';
import campaignBuilderApiService from '../../services/campaignBuilderApi.service';

vi.mock('../../services/campaignBuilderApi.service', () => ({
  default: {
    previewLandingLeads: vi.fn(),
  },
}));

vi.mock('../../../../services/api.js', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { data: { items: [] } } }),
  },
}));

vi.mock('../../../landing/utils/landingLeadsSlugFilterOptions.js', () => ({
  fetchLandingLeadsSlugFilterOptions: vi.fn().mockResolvedValue([{ value: 'l', label: 'Landing React (/l)' }]),
}));

function Harness({ initial = {} }) {
  const [formData, setFormData] = useState({
    landingLeadsUseDateRange: false,
    landingLeadsDateFrom: '',
    landingLeadsDateTo: '',
    landingLeadsOccupations: [],
    landingLeadsInterests: [],
    landingLeadsSlugs: [],
    landingLeadsCustomFilters: [],
    landingLeadsLimit: 1000,
    ...initial,
  });
  return (
    <div>
      <NodeConfigReadLandingLeadsSection formData={formData} setFormData={setFormData} />
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

describe('NodeConfigReadLandingLeadsSection (PR-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('khi có excludedNoConsent > 0 → hiện cảnh báo số lead bị bỏ qua', async () => {
    campaignBuilderApiService.previewLandingLeads.mockResolvedValue({
      data: {
        success: true,
        data: {
          items: [],
          pagination: { total: 10, limit: 1, fetched: 0, excludedNoConsent: 3 },
        },
      },
    });

    renderHarness();

    await waitFor(() => {
      expect(campaignBuilderApiService.previewLandingLeads).toHaveBeenCalled();
      expect(screen.getByText(/3 lead bị bỏ qua vì chưa đồng ý/)).toBeInTheDocument();
    });
  });

  it('khi excludedNoConsent = 0 → không hiện cảnh báo', async () => {
    campaignBuilderApiService.previewLandingLeads.mockResolvedValue({
      data: {
        success: true,
        data: {
          items: [],
          pagination: { total: 10, limit: 1, fetched: 0, excludedNoConsent: 0 },
        },
      },
    });

    renderHarness();

    await waitFor(() => {
      expect(campaignBuilderApiService.previewLandingLeads).toHaveBeenCalled();
    });

    expect(screen.queryByText(/lead bị bỏ qua/)).not.toBeInTheDocument();
  });
});
