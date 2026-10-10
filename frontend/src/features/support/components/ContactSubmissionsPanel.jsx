import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineMail } from 'react-icons/hi';
import Pagination from '../../../components/common/Pagination';
import { useI18n } from '../../../i18n';
import { supportAdminApi } from '../services/supportApi.service';
import { CONTACT_STATUSES, apiErrorMessage } from '../utils/supportConstants';
import { formatDateTime } from '../utils/formatDateTime';

const PAGE_SIZE = 20;

function ContactRow({ item, onPatched }) {
  const { t, locale } = useI18n();
  const [notes, setNotes] = useState(item.notes || '');
  const [saving, setSaving] = useState(false);

  const patch = async (body, successKey) => {
    setSaving(true);
    try {
      const updated = await supportAdminApi.updateContactSubmission(item.id, body);
      onPatched(updated || { ...item, ...body });
      toast.success(t(successKey));
    } catch (error) {
      toast.error(apiErrorMessage(error) || t('support.contact.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const mailto = `mailto:${item.email}?subject=${encodeURIComponent(t('support.contact.mailSubject'))}`;

  return (
    <tr data-testid="contact-row" className="align-top">
      <td className="px-4 py-3">
        <div className="font-medium text-slate-900">{item.name}</div>
        <div className="text-xs text-slate-500 break-all">{item.email}</div>
        {item.phone && <div className="text-xs text-slate-500">{item.phone}</div>}
        {item.company && (
          <div className="text-xs text-slate-400">
            {item.company}
            {item.companySize ? ` · ${item.companySize}` : ''}
          </div>
        )}
      </td>
      <td className="max-w-sm px-4 py-3 text-slate-700">
        <p className="whitespace-pre-wrap break-words">{item.message}</p>
        <p className="mt-1 text-xs text-slate-400">{formatDateTime(item.createdAt, locale)}</p>
      </td>
      <td className="px-4 py-3">
        <select
          aria-label={t('support.contact.statusLabel')}
          value={item.status}
          disabled={saving}
          onChange={(event) => patch({ status: event.target.value }, 'support.contact.saved')}
          className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
        >
          {CONTACT_STATUSES.map((key) => (
            <option key={key} value={key}>
              {t(`support.contact.status.${key}`)}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <textarea
          aria-label={t('support.contact.notes')}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={2}
          className="w-full min-w-[12rem] rounded-lg border border-slate-300 px-2 py-1 text-sm"
        />
        <button
          type="button"
          disabled={saving || notes === (item.notes || '')}
          onClick={() => patch({ notes }, 'support.contact.saved')}
          className="mt-1 text-xs font-semibold text-orange-600 hover:text-orange-700 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          {t('support.contact.saveNotes')}
        </button>
      </td>
      <td className="px-4 py-3">
        <a
          href={mailto}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <HiOutlineMail className="h-4 w-4" aria-hidden="true" />
          {t('support.contact.replyEmail')}
        </a>
      </td>
    </tr>
  );
}

/** Tab "Liên hệ từ trang chủ": đọc `contact_submissions`, đổi trạng thái / ghi chú, trả lời qua `mailto:`. */
export default function ContactSubmissionsPanel() {
  const { t } = useI18n();
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await supportAdminApi.listContactSubmissions({ page, limit: PAGE_SIZE, status }));
    } catch (error) {
      toast.error(apiErrorMessage(error) || t('support.contact.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [page, status, t]);

  useEffect(() => {
    load();
  }, [load]);

  const items = data?.items || [];
  const counts = data?.counts || {};
  const totalPages = Number(data?.pagination?.totalPages) || 1;

  const replaceItem = (updated) =>
    setData((prev) => ({
      ...prev,
      items: (prev?.items || []).map((entry) => (entry.id === updated.id ? { ...entry, ...updated } : entry)),
    }));

  const tabClass = (active) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
    }`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label={t('support.contact.title')}>
        {['all', ...CONTACT_STATUSES].map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={status === key}
            onClick={() => {
              setStatus(key);
              setPage(1);
            }}
            className={tabClass(status === key)}
          >
            {key === 'all' ? t('support.statusTabs.all') : t(`support.contact.status.${key}`)}
            {counts[key] != null && <span className="ml-1.5 text-xs opacity-80">({counts[key]})</span>}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading && !data ? (
          <div className="p-10 text-center text-sm text-slate-400">{t('common.loading')}</div>
        ) : items.length === 0 ? (
          <div className="p-14 text-center text-sm text-slate-400">{t('support.contact.empty')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('support.contact.columns.contact')}</th>
                  <th className="px-4 py-3">{t('support.contact.columns.message')}</th>
                  <th className="px-4 py-3">{t('support.contact.columns.status')}</th>
                  <th className="px-4 py-3">{t('support.contact.columns.notes')}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <ContactRow key={item.id} item={item} onPatched={replaceItem} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
