import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { HiOutlineChatAlt2, HiOutlineSearch } from 'react-icons/hi';
import PageContainer from '../../components/common/PageContainer';
import Pagination from '../../components/common/Pagination';
import { useI18n } from '../../i18n';
import ContactSubmissionsPanel from '../../features/support/components/ContactSubmissionsPanel';
import SupportStatusChip from '../../features/support/components/SupportStatusChip';
import { supportAdminApi } from '../../features/support/services/supportApi.service';
import { SUPPORT_CATEGORIES, SUPPORT_STATUSES, apiErrorMessage } from '../../features/support/utils/supportConstants';
import { formatDateTime } from '../../features/support/utils/formatDateTime';

const PAGE_SIZE = 20;

const tabClass = (active) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
    active ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
  }`;

function TicketsTab() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await supportAdminApi.listTickets({ page, limit: PAGE_SIZE, status, category, search }));
    } catch (error) {
      toast.error(apiErrorMessage(error) || t('support.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [page, status, category, search, t]);

  useEffect(() => {
    load();
  }, [load]);

  const items = data?.items || [];
  const counts = data?.counts || {};
  const totalPages = Number(data?.pagination?.totalPages) || 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label={t('support.admin.statusFilter')}>
          {['all', ...SUPPORT_STATUSES].map((key) => (
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
              {t(`support.statusTabs.${key}`)}
              {counts[key] != null && <span className="ml-1.5 text-xs opacity-80">({counts[key]})</span>}
            </button>
          ))}
        </div>

        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchInput.trim());
            setPage(1);
          }}
        >
          <select
            aria-label={t('support.admin.categoryFilter')}
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">{t('support.admin.allCategories')}</option>
            {SUPPORT_CATEGORIES.map((key) => (
              <option key={key} value={key}>
                {t(`support.category.${key}`)}
              </option>
            ))}
          </select>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t('support.admin.searchPlaceholder')}
            aria-label={t('support.admin.searchPlaceholder')}
            className="w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <HiOutlineSearch className="h-4 w-4" aria-hidden="true" />
            {t('support.admin.search')}
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading && !data ? (
          <div className="p-10 text-center text-sm text-slate-400">{t('common.loading')}</div>
        ) : items.length === 0 ? (
          <div className="p-14 text-center text-sm text-slate-400">{t('support.admin.empty')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('support.admin.columns.sender')}</th>
                  <th className="px-4 py-3">{t('support.admin.columns.category')}</th>
                  <th className="px-4 py-3">{t('support.admin.columns.subject')}</th>
                  <th className="px-4 py-3">{t('support.admin.columns.lastMessage')}</th>
                  <th className="px-4 py-3">{t('support.admin.columns.status')}</th>
                  <th className="px-4 py-3">{t('support.admin.columns.time')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((ticket) => (
                  <tr
                    key={ticket.id}
                    data-testid="admin-ticket-row"
                    tabIndex={0}
                    onClick={() => navigate(`/admin/tickets/${ticket.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') navigate(`/admin/tickets/${ticket.id}`);
                    }}
                    className="cursor-pointer hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{ticket.user?.fullName || ticket.user?.username || '—'}</div>
                      <div className="text-xs text-slate-500 break-all">{ticket.user?.email}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{t(`support.category.${ticket.category}`)}</td>
                    <td className="max-w-xs px-4 py-3 font-medium text-slate-900">{ticket.subject}</td>
                    <td className="max-w-xs px-4 py-3 text-slate-500">
                      {ticket.lastMessage ? (
                        <span className="line-clamp-2">
                          <span className="font-medium">
                            {ticket.lastMessage.authorRole === 'admin'
                              ? t('support.thread.supportTeamShort')
                              : t('support.thread.customer')}
                            :
                          </span>{' '}
                          {ticket.lastMessage.excerpt}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <SupportStatusChip status={ticket.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                      {formatDateTime(ticket.lastMessageAt, locale)}
                    </td>
                  </tr>
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

/** Super admin: ticket góp ý (`/admin/tickets`) + tab "Liên hệ từ trang chủ". */
export default function AdminSupportTicketsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState('tickets');

  return (
    <PageContainer icon={HiOutlineChatAlt2} title={t('support.admin.title')} subtitle={t('support.admin.subtitle')}>
      <div className="flex gap-1 border-b border-slate-200" role="tablist">
        {['tickets', 'contact'].map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
              tab === key
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t(`support.admin.tabs.${key}`)}
          </button>
        ))}
      </div>
      {tab === 'tickets' ? <TicketsTab /> : <ContactSubmissionsPanel />}
    </PageContainer>
  );
}
