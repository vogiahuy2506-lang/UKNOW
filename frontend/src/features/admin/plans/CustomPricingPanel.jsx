import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '../../../i18n';
import adminPlansApiService from '../services/adminPlansApi.service';

const CONFIG_KEYS = new Set(['yearly_discount_percent', 'zalo_monthly_capacity_per_account']);

const LABEL_MAP = {
  yearly_discount_percent: 'Giảm giá năm (%)',
  zalo_monthly_capacity_per_account: 'Năng lực Zalo / tài khoản',
  base_fee: 'Phí nền',
  zalo_messages: 'Tin Zalo',
  emails: 'Email',
  ai_credits: 'Lượt AI',
  zalo_accounts: 'Tài khoản Zalo',
  email_accounts: 'Tài khoản Email',
  landing_pages: 'Landing page',
  chatbots: 'Chatbot',
  employees: 'Nhân viên',
  campaigns: 'Chiến dịch',
  zalo_campaigns: 'Chiến dịch Zalo',
  zalo_group_campaigns: 'Chiến dịch Zalo nhóm',
  email_campaigns: 'Chiến dịch Email',
  email_templates: 'Email template',
  zalo_templates: 'Zalo template',
};

export default function CustomPricingPanel() {
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [drafts, setDrafts] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminPlansApiService.getCustomPricing();
      const data = res.data.data || [];
      setRows(data);
      const next = {};
      for (const row of data) {
        next[row.itemKey] = {
          unitPrice: row.unitPrice ?? 0,
          unitSize: row.unitSize ?? 1,
          includedQty: row.includedQty ?? 0,
          minQty: row.minQty ?? 0,
          maxQty: row.maxQty ?? '',
          stepQty: row.stepQty ?? 1,
          isActive: row.isActive ?? true,
        };
      }
      setDrafts(next);
    } catch {
      toast.error(t('adminPlans.customPricingLoadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveRow = async (itemKey) => {
    const draft = drafts[itemKey];
    if (!draft) return;
    setSavingKey(itemKey);
    try {
      await adminPlansApiService.updateCustomPricing(itemKey, {
        unitPrice: Number(draft.unitPrice),
        unitSize: Number(draft.unitSize),
        includedQty: Number(draft.includedQty),
        minQty: Number(draft.minQty),
        maxQty: draft.maxQty === '' || draft.maxQty === null ? null : Number(draft.maxQty),
        stepQty: Number(draft.stepQty),
        isActive: Boolean(draft.isActive),
      });
      toast.success(t('adminPlans.customPricingSaved'));
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminPlans.customPricingSaveFailed'));
    } finally {
      setSavingKey(null);
    }
  };

  const updateDraft = (itemKey, field, value) => {
    setDrafts((prev) => ({
      ...prev,
      [itemKey]: { ...prev[itemKey], [field]: value },
    }));
  };

  if (loading) {
    return <div className="card p-8 animate-pulse bg-gray-50 h-40" />;
  }

  return (
    <div className="card overflow-x-auto">
      <p className="px-4 pt-4 text-xs text-gray-500">
        {t('adminPlans.customPricingIncludedHint')}
      </p>
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-3">{t('adminPlans.customPricingColItem')}</th>
            <th className="px-4 py-3">{t('adminPlans.customPricingColUnitPrice')}</th>
            <th className="px-4 py-3">{t('adminPlans.customPricingColUnitSize')}</th>
            <th className="px-4 py-3" title={t('adminPlans.customPricingIncludedHint')}>
              {t('adminPlans.customPricingColIncluded')}
            </th>
            <th className="px-4 py-3">Min</th>
            <th className="px-4 py-3">Max</th>
            <th className="px-4 py-3">Step</th>
            <th className="px-4 py-3">Active</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => {
            const draft = drafts[row.itemKey] || {};
            const isConfig = CONFIG_KEYS.has(row.itemKey);
            return (
              <tr key={row.itemKey} className="hover:bg-gray-50/80">
                <td className="px-4 py-3">
                  <div className="font-semibold text-gray-900">{LABEL_MAP[row.itemKey] || row.itemKey}</div>
                  <div className="text-xs text-gray-400">{row.itemKey}{row.planColumn ? ` → ${row.planColumn}` : ''}</div>
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    className="input w-28"
                    value={draft.unitPrice}
                    onChange={(e) => updateDraft(row.itemKey, 'unitPrice', e.target.value)}
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    className="input w-20"
                    disabled={isConfig}
                    value={draft.unitSize}
                    onChange={(e) => updateDraft(row.itemKey, 'unitSize', e.target.value)}
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    className="input w-20"
                    disabled={isConfig || row.itemKey === 'base_fee'}
                    value={draft.includedQty}
                    onChange={(e) => updateDraft(row.itemKey, 'includedQty', e.target.value)}
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    className="input w-20"
                    disabled={isConfig}
                    value={draft.minQty}
                    onChange={(e) => updateDraft(row.itemKey, 'minQty', e.target.value)}
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    className="input w-20"
                    disabled={isConfig}
                    value={draft.maxQty}
                    placeholder="∞"
                    onChange={(e) => updateDraft(row.itemKey, 'maxQty', e.target.value)}
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    className="input w-20"
                    disabled={isConfig}
                    value={draft.stepQty}
                    onChange={(e) => updateDraft(row.itemKey, 'stepQty', e.target.value)}
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.isActive)}
                    onChange={(e) => updateDraft(row.itemKey, 'isActive', e.target.checked)}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={savingKey === row.itemKey}
                    onClick={() => saveRow(row.itemKey)}
                  >
                    {savingKey === row.itemKey ? '…' : t('common.save')}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
