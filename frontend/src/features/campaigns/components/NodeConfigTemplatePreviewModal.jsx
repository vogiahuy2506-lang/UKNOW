import { HiOutlinePaperClip, HiOutlineX } from 'react-icons/hi';
import FullScreenOverlay from '../../../components/FullScreenOverlay';

/**
 * Chuẩn hóa key attachment từ nhiều định dạng metadata.
 *
 * @param {object|string|null} attachment metadata attachment
 * @returns {string|null}
 */
const resolveAttachmentKey = (attachment) => {
  if (!attachment) return null;
  if (typeof attachment === 'string') return null;
  const key = String(attachment.key || attachment.storageKey || attachment.s3Key || '').trim();
  return key || null;
};

/**
 * Chuẩn hóa danh sách attachment của template để hiển thị trong modal preview.
 *
 * @param {object|null} template template hiện tại
 * @returns {Array<{name: string, url: string|null, key: string|null}>}
 */
const normalizeTemplateAttachments = (template) => {
  if (!template || typeof template !== 'object') return [];
  const attachments = Array.isArray(template.attachments) ? template.attachments : [];
  return attachments
    .map((item, index) => {
      if (typeof item === 'string') {
        return {
          name: `Tệp đính kèm ${index + 1}`,
          url: item,
          key: null,
        };
      }
      const source = item && typeof item === 'object' ? item : null;
      if (!source) return null;
      return {
        name: String(
          source.displayName
          || source.name
          || source.originalName
          || source.fileName
          || `Tệp đính kèm ${index + 1}`
        ).trim(),
        url: String(source.url || source.link || source.attachmentUrl || '').trim() || null,
        key: resolveAttachmentKey(source),
      };
    })
    .filter(Boolean);
};

/**
 * Preview modal for template content inside node config modal.
 *
 * @param {Object} props modal props
 * @param {boolean} props.isOpen modal open flag
 * @param {Function} props.onClose close handler
 * @param {Object|null} props.template selected template detail
 * @param {string} [props.subjectLabel] label for subject line
 * @param {Function} [props.onOpenAttachment] callback mở file đính kèm
 * @returns {JSX.Element|null}
 */
const NodeConfigTemplatePreviewModal = ({
  isOpen,
  onClose,
  template,
  subjectLabel = 'Tiêu đề',
  onOpenAttachment,
}) => {
  if (!isOpen || !template) return null;

  const templateTitle = String(template.templateName || 'Template').trim();
  const subject = String(template.subject || '').trim();
  const bodyHtml = String(template.bodyHtml || '').trim();
  const bodyText = String(template.bodyText || '').trim();
  const attachments = normalizeTemplateAttachments(template);

  const handleAttachmentClick = async (attachment) => {
    if (typeof onOpenAttachment === 'function') {
      await onOpenAttachment(attachment);
      return;
    }
    if (attachment?.url) {
      window.open(attachment.url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <FullScreenOverlay
      isOpen={isOpen}
      className="p-4"
      backdropClassName="bg-black/60"
      onBackdropClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="w-full max-w-4xl max-h-[90vh] bg-white rounded-xl shadow-xl overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900 truncate">{templateTitle}</h3>
            {subject && (
              <p className="text-sm text-gray-600 mt-1 truncate">
                <span className="font-medium text-gray-700">{subjectLabel}: </span>
                {subject}
              </p>
            )}
            {attachments.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                <span className="font-medium text-gray-700">Tệp đính kèm:</span>
                <div className="flex flex-wrap gap-2">
                  {attachments.map((attachment, index) => (
                    <button
                      key={`${attachment.key || attachment.url || attachment.name}-${index}`}
                      type="button"
                      onClick={() => handleAttachmentClick(attachment)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-gray-200 bg-white text-gray-700 hover:text-primary-600 hover:border-primary-200 transition-colors"
                    >
                      <HiOutlinePaperClip className="w-3.5 h-3.5" />
                      <span className="truncate max-w-[220px]">{attachment.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
            aria-label="Đóng xem trước template"
          >
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-gray-50 p-4">
          {bodyHtml ? (
            <iframe
              srcDoc={bodyHtml}
              title="Template preview"
              className="w-full min-h-[520px] bg-white rounded-lg border border-gray-200"
              style={{ border: '1px solid rgb(229 231 235)' }}
            />
          ) : bodyText ? (
            <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap">
              {bodyText}
            </div>
          ) : (
            <div className="bg-white border border-dashed border-gray-300 rounded-lg p-8 text-sm text-gray-500 text-center">
              Template này chưa có nội dung để xem trước.
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-200 bg-white flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            Đóng
          </button>
        </div>
      </div>
    </FullScreenOverlay>
  );
};

export default NodeConfigTemplatePreviewModal;
