import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { HiOutlineChatAlt2 } from 'react-icons/hi';
import Notice from '../../components/common/Notice';
import PageContainer from '../../components/common/PageContainer';
import { useI18n } from '../../i18n';
import SupportReplyBox from '../../features/support/components/SupportReplyBox';
import SupportStatusChip from '../../features/support/components/SupportStatusChip';
import SupportThread from '../../features/support/components/SupportThread';
import { supportAdminApi } from '../../features/support/services/supportApi.service';
import { SUPPORT_STATUSES, apiErrorMessage } from '../../features/support/utils/supportConstants';

/** Super admin: chi tiết ticket (`/admin/tickets/:id`) — thread (thấy tên thật), trả lời + ảnh, đổi trạng thái. */
export default function AdminSupportTicketDetailPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await supportAdminApi.getTicket(id);
      setTicket(result?.ticket || null);
      setMessages(result?.messages || []);
      setNotFound(!result?.ticket);
    } catch (error) {
      if (error?.response?.status === 404) setNotFound(true);
      else toast.error(apiErrorMessage(error) || t('support.thread.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleReply = async ({ body, attachmentIds }) => {
    await supportAdminApi.reply(id, { body, attachmentIds });
    toast.success(t('support.admin.replied'));
    // Phản hồi của /reply không đảm bảo kèm tên admin → tải lại cả thread cho chắc.
    await load();
  };

  const handleStatusChange = async (nextStatus) => {
    if (!nextStatus || nextStatus === ticket?.status) return;
    setChangingStatus(true);
    try {
      const result = await supportAdminApi.setStatus(id, nextStatus);
      setTicket((prev) => ({ ...prev, ...(result?.ticket || {}), status: result?.ticket?.status || nextStatus }));
      toast.success(t('support.admin.statusChanged'));
    } catch (error) {
      toast.error(apiErrorMessage(error) || t('support.admin.statusChangeFailed'));
    } finally {
      setChangingStatus(false);
    }
  };

  if (loading && !ticket) {
    return <div className="p-10 text-center text-sm text-slate-400">{t('common.loading')}</div>;
  }
  if (notFound || !ticket) {
    return (
      <PageContainer
        icon={HiOutlineChatAlt2}
        title={t('support.admin.title')}
        onBack={() => navigate('/admin/tickets')}
        backLabel={t('support.thread.back')}
      >
        <Notice variant="warning" title={t('support.thread.notFound')} />
      </PageContainer>
    );
  }

  const sender = ticket.user?.fullName || ticket.user?.username || '';

  return (
    <PageContainer
      icon={HiOutlineChatAlt2}
      title={ticket.subject}
      subtitle={`${t(`support.category.${ticket.category}`)} · ${sender}${ticket.user?.email ? ` <${ticket.user.email}>` : ''}`}
      onBack={() => navigate('/admin/tickets')}
      backLabel={t('support.thread.back')}
      actions={
        <div className="flex items-center gap-3">
          <SupportStatusChip status={ticket.status} />
          <select
            aria-label={t('support.admin.changeStatus')}
            value={ticket.status}
            disabled={changingStatus}
            onChange={(event) => handleStatusChange(event.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            {SUPPORT_STATUSES.map((key) => (
              <option key={key} value={key}>
                {t(`support.status.${key}`)}
              </option>
            ))}
          </select>
        </div>
      }
    >
      <SupportThread
        ticketId={ticket.id}
        messages={messages}
        perspective="admin"
        userLabel={sender}
        fetchBlob={supportAdminApi.fetchAttachmentBlob}
      />

      <SupportReplyBox
        onSubmit={handleReply}
        uploadFn={supportAdminApi.uploadAttachment}
        placeholder={t('support.admin.replyPlaceholder')}
      />
    </PageContainer>
  );
}
