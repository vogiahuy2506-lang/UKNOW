import { useI18n } from '../../../i18n';
import { formatDateTime } from '../utils/formatDateTime';
import SupportAttachmentImage from './SupportAttachmentImage';

/**
 * Luồng tin nhắn của một ticket. Nội dung là VĂN BẢN THUẦN: `whitespace-pre-wrap`, không bao giờ render HTML.
 *
 * Nhãn người gửi:
 *  - góc nhìn `user`: tin `user` = "Bạn"; tin `admin` = `authorName` hoặc (backend trả null) "Hỗ trợ Founder AI".
 *  - góc nhìn `admin`: tin `user` = tên thật (`userLabel` nếu backend không kèm tên); tin `admin` = tên admin hoặc "Founder AI".
 *
 * @param {object} props
 * @param {number|string} props.ticketId
 * @param {Array<object>} props.messages
 * @param {'user'|'admin'} props.perspective
 * @param {string} [props.userLabel] tên người gửi ticket (góc nhìn admin)
 * @param {(ticketId: number|string, objectId: number|string) => Promise<Blob>} props.fetchBlob
 */
export default function SupportThread({ ticketId, messages, perspective, userLabel = '', fetchBlob }) {
  const { t, locale } = useI18n();

  const authorLabel = (message) => {
    const isAdminMessage = message.authorRole === 'admin';
    if (perspective === 'user') {
      if (!isAdminMessage) return t('support.thread.me');
      return message.authorName || t('support.thread.supportTeam');
    }
    if (isAdminMessage) return message.authorName || t('support.thread.supportTeamShort');
    return message.authorName || userLabel || t('support.thread.customer');
  };

  return (
    <ol className="space-y-4" data-testid="support-thread">
      {messages.map((message) => {
        const isAdminMessage = message.authorRole === 'admin';
        // Bên phải = phía người đang xem (người dùng xem tin của mình, admin xem tin của admin).
        const mine = perspective === 'admin' ? isAdminMessage : !isAdminMessage;
        const attachments = Array.isArray(message.attachments) ? message.attachments : [];
        return (
          <li
            key={message.id}
            data-testid="support-message"
            data-author-role={message.authorRole}
            className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl border px-4 py-3 shadow-sm ${
                mine ? 'border-orange-100 bg-orange-50' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="mb-1 flex flex-wrap items-baseline gap-x-2 text-xs">
                <span className="font-semibold text-slate-800">{authorLabel(message)}</span>
                <span className="text-slate-400">{formatDateTime(message.createdAt, locale)}</span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{message.body}</p>
              {attachments.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {attachments.map((attachment) => (
                    <SupportAttachmentImage
                      key={attachment.storageObjectId}
                      ticketId={ticketId}
                      attachment={attachment}
                      fetchBlob={fetchBlob}
                    />
                  ))}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
