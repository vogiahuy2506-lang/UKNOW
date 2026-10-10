import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '../../../i18n';
import adminNotificationApiService from '../services/adminNotificationApi.service';

/**
 * Tab "Cấu hình kênh" của Trung tâm Chiến dịch Email (PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO_2026-10-10 mục 5):
 * mỗi sự kiện thông báo có 3 công tắc — chuông, email, người dùng được tắt email. Lưu TỪNG DÒNG bằng
 * PUT /api/admin/notification-events/:eventType { inAppEnabled, emailEnabled, userCanDisableEmail }.
 */

function draftOf(entry) {
  return {
    inAppEnabled: Boolean(entry.settings.inAppEnabled),
    emailEnabled: Boolean(entry.settings.emailEnabled),
    userCanDisableEmail: Boolean(entry.settings.userCanDisableEmail),
  };
}

function isDirty(entry, draft) {
  const saved = draftOf(entry);
  return Object.keys(saved).some((field) => saved[field] !== draft[field]);
}

function Switch({ checked, disabled, onChange, label }) {
  return (
    <input
      type="checkbox"
      role="switch"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

export default function NotificationEventSettingsPanel({ onEntrySaved }) {
  const { t, locale } = useI18n();
  const [entries, setEntries] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savingKey, setSavingKey] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await adminNotificationApiService.getNotificationEvents();
      const list = response.data?.success ? response.data.data || [] : [];
      setEntries(list);
      setDrafts(Object.fromEntries(list.map((entry) => [entry.key, draftOf(entry)])));
    } catch (error) {
      console.error('[NotificationEventSettingsPanel] load error:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setField = (key, field, value) => {
    setDrafts((current) => ({ ...current, [key]: { ...current[key], [field]: value } }));
  };

  const save = async (entry) => {
    const draft = drafts[entry.key];
    setSavingKey(entry.key);
    try {
      const response = await adminNotificationApiService.updateNotificationEvent(entry.key, {
        inAppEnabled: draft.inAppEnabled,
        emailEnabled: draft.emailEnabled,
        userCanDisableEmail: draft.userCanDisableEmail,
      });
      const updated = response.data?.data;
      if (response.data?.success && updated) {
        setEntries((current) => current.map((item) => (item.key === entry.key ? updated : item)));
        setDrafts((current) => ({ ...current, [entry.key]: draftOf(updated) }));
        if (onEntrySaved) onEntrySaved(updated);
        toast.success(t('notificationCenter.events.saved', { name: locale === 'en' ? entry.labelEn : entry.label }));
      } else {
        toast.error(response.data?.message || t('notificationCenter.events.saveFailed'));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || t('notificationCenter.events.saveFailed'));
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header>
        <h2 className="font-semibold text-slate-900">{t('notificationCenter.events.title')}</h2>
        <p className="mt-1 text-xs text-slate-500">{t('notificationCenter.events.subtitle')}</p>
      </header>

      {loading ? (
        <p role="status" className="text-sm text-slate-500">{t('notificationCenter.events.loading')}</p>
      ) : null}

      {!loading && loadError ? (
        <div role="alert" className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{t('notificationCenter.events.loadFailed')}</span>
          <button
            type="button"
            onClick={load}
            className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            {t('notificationCenter.events.retry')}
          </button>
        </div>
      ) : null}

      {!loading && !loadError ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-3 py-3">{t('notificationCenter.events.colEvent')}</th>
                <th className="px-3 py-3 text-center">{t('notificationCenter.events.colInApp')}</th>
                <th className="px-3 py-3 text-center">{t('notificationCenter.events.colEmail')}</th>
                <th className="px-3 py-3 text-center">{t('notificationCenter.events.colUserCanDisable')}</th>
                <th className="px-3 py-3 text-right">{t('notificationCenter.events.colAction')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((entry) => {
                const draft = drafts[entry.key] || draftOf(entry);
                const name = locale === 'en' ? entry.labelEn : entry.label;
                const isAdminAudience = entry.audience === 'admin';
                // Loại cố định không cho người dùng tắt (bảo mật / thanh toán / nhân viên chờ duyệt) hoặc sự kiện gửi cho admin
                // (email admin đi theo danh sách cảnh báo, không qua tuỳ chọn người dùng) → công tắc thứ ba vô hiệu.
                const lockedByCatalog = entry.catalogUserCanDisableEmail === false;
                const disableUserSwitch = isAdminAudience || lockedByCatalog;
                const dirty = isDirty(entry, draft);
                const saving = savingKey === entry.key;
                return (
                  <tr key={entry.key} data-testid={`event-row-${entry.key}`}>
                    <td className="px-3 py-3 align-top">
                      <p className="font-medium text-slate-900">{name}</p>
                      <p className="mt-0.5 max-w-md text-xs text-slate-500">{entry.description}</p>
                      <p className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                          {isAdminAudience ? t('notificationCenter.events.audienceAdmin') : t('notificationCenter.events.audienceUser')}
                        </span>
                        {entry.settings.isDefault ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">
                            {t('notificationCenter.events.defaultBadge')}
                          </span>
                        ) : null}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-center align-top">
                      <Switch
                        checked={draft.inAppEnabled}
                        label={`${name} - ${t('notificationCenter.events.colInApp')}`}
                        onChange={(value) => setField(entry.key, 'inAppEnabled', value)}
                      />
                    </td>
                    <td className="px-3 py-3 text-center align-top">
                      <Switch
                        checked={draft.emailEnabled}
                        label={`${name} - ${t('notificationCenter.events.colEmail')}`}
                        onChange={(value) => setField(entry.key, 'emailEnabled', value)}
                      />
                    </td>
                    <td className="px-3 py-3 text-center align-top">
                      <Switch
                        checked={draft.userCanDisableEmail}
                        disabled={disableUserSwitch}
                        label={`${name} - ${t('notificationCenter.events.colUserCanDisable')}`}
                        onChange={(value) => setField(entry.key, 'userCanDisableEmail', value)}
                      />
                      {disableUserSwitch ? (
                        <p className="mx-auto mt-1 max-w-[11rem] text-[11px] text-slate-400">
                          {isAdminAudience ? t('notificationCenter.events.adminNoPref') : t('notificationCenter.events.lockedByCatalog')}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-right align-top">
                      <button
                        type="button"
                        onClick={() => save(entry)}
                        disabled={!dirty || saving}
                        aria-label={`${t('notificationCenter.events.save')} - ${name}`}
                        className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                      >
                        {saving ? t('notificationCenter.events.saving') : t('notificationCenter.events.save')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
