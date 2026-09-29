/**
 * P5 (PLAN_TG_WA_DAY_DU) — chọn MẪU TIN NHẮN + xem/bớt tệp đính kèm cho tin Telegram/WhatsApp.
 *
 * Dùng chung kho mẫu Zalo (`zalo_templates`: nội dung + tệp đính kèm), không có bảng mẫu riêng. Một component cho
 * cả node chiến dịch (send_telegram / send_whatsapp) lẫn Gửi nhanh; bên gọi quyết định lưu kết quả ở đâu qua `onApply`.
 *
 * @param {Object} props
 * @param {'telegram'|'whatsapp'} props.channel
 * @param {Array<{id: number|string, templateName?: string, bodyText?: string, attachments?: Array<object>}>} props.templates
 * @param {(id: number|string) => Promise<object|null>} [props.fetchTemplateById] lấy chi tiết mẫu (thiếu thì dùng dòng trong danh sách)
 * @param {string} [props.templateId] mẫu đang chọn
 * @param {Array<object>} [props.attachments] tệp đính kèm hiện có (của mẫu)
 * @param {(template: object|null) => void} props.onApply `null` = bỏ mẫu
 * @param {(index: number) => void} [props.onRemoveAttachment]
 * @param {'idle'|'loading'|'loaded'|'error'} [props.status]
 */
import { useMemo, useState } from 'react';
import { HiOutlinePaperClip, HiOutlineX } from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import TemplateSearchSelect from './TemplateSearchSelect';
import {
  CHANNEL_ATTACHMENT_LIMITS,
  getAttachmentDisplayName,
  validateChannelAttachments,
} from '../utils/channelAttachments';

const formatSize = (bytes) => {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const ChannelTemplateAttachmentPicker = ({
  channel,
  templates = [],
  fetchTemplateById,
  templateId = '',
  attachments = [],
  onApply,
  onRemoveAttachment,
  status = 'loaded',
}) => {
  const { t } = useI18n();
  const [isApplying, setIsApplying] = useState(false);

  const options = useMemo(
    () => templates.map((item) => ({
      id: String(item.id),
      label: String(item.templateName || `#${item.id}`),
    })),
    [templates]
  );

  const handleChange = async (nextValue) => {
    const value = String(nextValue || '').trim();
    if (!value) {
      onApply?.(null);
      return;
    }
    const fromList = templates.find((item) => String(item.id) === value) || null;
    setIsApplying(true);
    try {
      let detailed = null;
      if (typeof fetchTemplateById === 'function') {
        try {
          detailed = await fetchTemplateById(Number.parseInt(value, 10) || value);
        } catch {
          detailed = null; // lỗi chi tiết: dùng dòng trong danh sách
        }
      }
      const template = detailed || fromList;
      if (template) onApply?.({ ...template, id: template.id ?? value });
    } finally {
      setIsApplying(false);
    }
  };

  const problem = validateChannelAttachments(attachments, channel);
  const problemText = problem
    ? t(`channelAttachments.error.${problem.code}`, { count: problem.limit, mb: problem.limit })
    : '';

  return (
    <div className="space-y-2" data-testid="channel-template-attachment-picker">
      <label className="block text-sm font-medium text-gray-700">{t('channelAttachments.templateLabel')}</label>
      {status === 'error' ? (
        <p role="alert" className="text-xs text-amber-700">{t('channelAttachments.templatesLoadFailed')}</p>
      ) : (
        <TemplateSearchSelect
          value={templateId || ''}
          options={options}
          onChange={handleChange}
          placeholder={t('channelAttachments.templatePlaceholder')}
          searchPlaceholder={t('channelAttachments.templateSearch')}
          emptyText={t('channelAttachments.templateEmpty')}
        />
      )}
      {templateId && (
        <button
          type="button"
          onClick={() => onApply?.(null)}
          className="text-xs text-gray-500 hover:text-red-500 underline"
        >
          {t('channelAttachments.clearTemplate')}
        </button>
      )}
      {isApplying && <p role="status" className="text-xs text-gray-500">{t('channelAttachments.applying')}</p>}
      <p className="text-xs text-gray-500">{t('channelAttachments.templateHint')}</p>

      {attachments.length > 0 && (
        <div data-testid="channel-attachment-list">
          <p className="text-xs font-medium text-gray-700 mb-1">
            {t('channelAttachments.attachmentsTitle', { count: attachments.length })}
          </p>
          <div className="flex flex-wrap gap-2">
            {attachments.map((attachment, index) => (
              <span
                key={attachment?.key || index}
                className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-700"
              >
                <HiOutlinePaperClip className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span className="truncate max-w-[180px] font-medium">{getAttachmentDisplayName(attachment)}</span>
                {formatSize(attachment?.size) && (
                  <span className="text-gray-400 shrink-0">({formatSize(attachment.size)})</span>
                )}
                {onRemoveAttachment && (
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(index)}
                    className="p-0.5 text-gray-400 hover:text-red-500 shrink-0"
                    title={t('channelAttachments.attachmentRemove')}
                    aria-label={t('channelAttachments.attachmentRemove')}
                  >
                    <HiOutlineX className="w-3.5 h-3.5" />
                  </button>
                )}
              </span>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {t('channelAttachments.sendOrderHint', {
              images: CHANNEL_ATTACHMENT_LIMITS.maxImages,
              documents: CHANNEL_ATTACHMENT_LIMITS.maxDocuments,
              mb: Math.round(CHANNEL_ATTACHMENT_LIMITS.maxTotalBytes / (1024 * 1024)),
            })}
          </p>
        </div>
      )}
      {problemText && (
        <p role="alert" data-testid="channel-attachment-problem" className="text-xs text-red-600">{problemText}</p>
      )}
    </div>
  );
};

export default ChannelTemplateAttachmentPicker;
