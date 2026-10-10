import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { HiOutlineChatAlt2, HiOutlinePlus } from 'react-icons/hi';
import PageContainer from '../../components/common/PageContainer';
import Pagination from '../../components/common/Pagination';
import { useI18n } from '../../i18n';
import NewTicketModal from '../../features/support/components/NewTicketModal';
import SupportStatusChip from '../../features/support/components/SupportStatusChip';
import { supportUserApi } from '../../features/support/services/supportApi.service';
import { SUPPORT_STATUSES, apiErrorMessage } from '../../features/support/utils/supportConstants';
import { formatDateTime } from '../../features/support/utils/formatDateTime';

const PAGE_SIZE = 20;

/**
 * "Góp ý & hỗ trợ" (`/app/support`): danh sách ticket CỦA TÔI + nút "Gửi góp ý".
 * Không bọc OwnerRoute / PermissionRoute — nhân viên cũng gửi được.
 */
export default function SupportTicketsPage() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await supportUserApi.listTickets({ page, limit: PAGE_SIZE, status }));
    } catch (error) {
      toast.error(apiErrorMessage(error) || t('support.loadFailed'));
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

  const tabClass = (active) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
    }`;

  const changeStatus = (next) => {
    setStatus(next);
    setPage(1);
  };

  return (
    <PageContainer
      icon={HiOutlineChatAlt2}
      title={t('support.title')}
      subtitle={t('support.subtitle')}
      actions={
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600"
        >
          <HiOutlinePlus className="h-4 w-4" aria-hidden="true" />
          {t('support.newTicket')}
        </button>
      }
    >
      <div className="flex flex-wrap gap-1" role="tablist">
        {['all', ...SUPPORT_STATUSES].map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={status === key}
            onClick={() => changeStatus(key)}
            className={tabClass(status === key)}
          >
            {t(`support.statusTabs.${key}`)}
            {counts[key] != null && <span className="ml-1.5 text-xs opacity-80">({counts[key]})</span>}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading && !data ? (
          <div className="p-10 text-center text-sm text-slate-400">{t('common.loading')}</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-14 text-center text-slate-400">
            <HiOutlineChatAlt2 className="h-10 w-10" aria-hidden="true" />
            <p className="text-sm font-medium text-slate-600">{t('support.empty')}</p>
            <p className="text-xs">{t('support.emptyHint')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  to={`/app/support/${ticket.id}`}
                  data-testid="support-ticket-row"
                  className="flex flex-col gap-1 px-5 py-4 hover:bg-slate-50"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{ticket.subject}</span>
                    <SupportStatusChip status={ticket.status} />
                    <span className="text-xs text-slate-500">{t(`support.category.${ticket.category}`)}</span>
                  </div>
                  {ticket.lastMessage?.excerpt && (
                    <p className="line-clamp-1 text-sm text-slate-500">
                      <span className="font-medium">
                        {ticket.lastMessage.authorRole === 'admin'
                          ? t('support.thread.supportTeam')
                          : t('support.thread.me')}
                        :
                      </span>{' '}
                      {ticket.lastMessage.excerpt}
                    </p>
                  )}
                  <span className="text-xs text-slate-400">{formatDateTime(ticket.lastMessageAt, locale)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />

      {showModal && (
        <NewTicketModal
          onClose={() => setShowModal(false)}
          onCreated={(ticket) => {
            setShowModal(false);
            if (ticket?.id) navigate(`/app/support/${ticket.id}`);
            else load();
          }}
        />
      )}
    </PageContainer>
  );
}
