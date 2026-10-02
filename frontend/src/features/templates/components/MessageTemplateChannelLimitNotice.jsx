import { HiOutlineExclamation } from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import {
  CHANNEL_ATTACHMENT_LIMITS,
  findMessageTemplateChannelProblem,
} from '../../campaigns/utils/channelAttachments';

/**
 * Nhắc giới hạn tệp của Telegram/WhatsApp trong trình soạn mẫu tin nhắn (kho dùng chung 3 kênh).
 * Chỉ nhắc, KHÔNG chặn lưu — luật lấy từ `validateChannelAttachments`, không viết lại ở đây.
 */
const MessageTemplateChannelLimitNotice = ({ attachments = [] }) => {
  const { t } = useI18n();
  if (!findMessageTemplateChannelProblem(attachments)) return null;
  return (
    <div
      role="status"
      data-testid="channel-limit-warning"
      className="flex items-start gap-2 px-4 py-2 text-xs text-amber-800 bg-amber-50 border-b border-amber-200"
    >
      <HiOutlineExclamation className="w-4 h-4 mt-0.5 shrink-0" />
      <span>
        {t('templates.channelLimitWarning', {
          images: CHANNEL_ATTACHMENT_LIMITS.maxImages,
          documents: CHANNEL_ATTACHMENT_LIMITS.maxDocuments,
          mb: Math.round(CHANNEL_ATTACHMENT_LIMITS.maxTotalBytes / (1024 * 1024)),
        })}
      </span>
    </div>
  );
};

export default MessageTemplateChannelLimitNotice;
