import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { HiOutlineChatAlt2 } from 'react-icons/hi';
import ConfirmModal from '../../components/common/ConfirmModal';
import PageContainer from '../../components/common/PageContainer';
import Notice from '../../components/common/Notice';
import { useI18n } from '../../i18n';
import SupportReplyBox from '../../features/support/components/SupportReplyBox';
import SupportStatusChip from '../../features/support/components/SupportStatusChip';
import SupportThread from '../../features/support/components/SupportThread';
import { supportUserApi } from '../../features/support/services/supportApi.service';
import { apiErrorMessage } from '../../features/support/utils/supportConstants';

/**
 * Chi tiết ticket của tôi (`/app/support/:id`): thread, ô trả lời + ảnh, nút Đóng.
 * Ticket đã đóng vẫn trả lời được — backend tự mở lại (`open`).
 */
export default function SupportTicketDetailPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [closing, setClosing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await supportUserApi.getTicket(id);
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
    const result = await supportUserApi.postMessage(id, { body, attachmentIds });
    if (result?.ticket) setTicket(result.ticket);
    if (result?.message) setMessages((prev) => [...prev, result.message]);
    else await load();
    toast.success(t('support.thread.sent'));
  };

  const handleClose = async () => {
    setClosing(true);
    try {
      const result = await supportUserApi.closeTicket(id);
      if (result?.ticket) setTicket(result.ticket);
      toast.success(t('support.thread.closedOk'));
      setConfirmClose(false);
    } catch (error) {
      toast.error(apiErrorMessage(error) || t('support.thread.closeFailed'));
    } finally {
      setClosing(false);
    }
  };

  if (loading && !ticket) {
    return <div className="p-10 text-center text-sm text-slate-400">{t('common.loading')}</div>;
  }
  if (notFound || !ticket) {
    return (
      <PageContainer
        icon={HiOutlineChatAlt2}
        title={t('support.title')}
        onBack={() => navigate('/app/support')}
        backLabel={t('support.thread.back')}
      >
        <Notice variant="warning" title={t('support.thread.notFound')} />
      </PageContainer>
    );
  }

  const closed = ticket.status === 'closed';

  return (
    <PageContainer
      icon={HiOutlineChatAlt2}
      title={ticket.subject}
      subtitle={t(`support.category.${ticket.category}`)}
      onBack={() => navigate('/app/support')}
      backLabel={t('support.thread.back')}
      actions={
        <div className="flex items-center gap-3">
          <SupportStatusChip status={ticket.status} />
          {!closed && (
            <button
              type="button"
              onClick={() => setConfirmClose(true)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              {t('support.thread.close')}
            </button>
          )}
        </div>
      }
    >
      {closed && <Notice variant="info" title={t('support.thread.closedBanner')} />}

      <SupportThread
        ticketId={ticket.id}
        messages={messages}
        perspective="user"
        fetchBlob={supportUserApi.fetchAttachmentBlob}
      />

      <SupportReplyBox onSubmit={handleReply} uploadFn={supportUserApi.uploadAttachment} />

      <ConfirmModal
        isOpen={confirmClose}
        title={t('support.thread.closeConfirmTitle')}
        message={t('support.thread.closeConfirmMessage')}
        variant="warning"
        confirmText={t('support.thread.close')}
        isLoading={closing}
        onConfirm={handleClose}
        onCancel={() => setConfirmClose(false)}
      />
    </PageContainer>
  );
}
