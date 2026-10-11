import { HiOutlinePaperClip } from 'react-icons/hi';
import FullScreenOverlay from '../../../components/FullScreenOverlay';

const EmailTemplatePreviewModal = ({
  showPreviewModal,
  previewTemplate,
  previewAttachments,
  getCategoryBadge,
  handleOpenAttachment,
  setShowPreviewModal,
  wrapEmailSrcDoc,
  modalPreviewIframeRef,
  resizeIframeToContent,
  subjectLabel = 'Subject',
}) => {
  if (!showPreviewModal || !previewTemplate) return null;

  return (
    <FullScreenOverlay isOpen={showPreviewModal} className="p-4">
      <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-2xl border border-gray-200 dark:border-dk-border w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden animate-fade-in-up">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dk-border flex items-center justify-between bg-gray-50 dark:bg-dk-raised/60">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-white dark:bg-dk-inset rounded-lg border border-gray-200 dark:border-dk-border shadow-sm">
              {getCategoryBadge(previewTemplate.category)}
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-dk-text">
                {previewTemplate.templateName}
              </h3>
              <p className="text-sm text-gray-500 dark:text-dk-text2 mt-0.5 flex items-center gap-2">
                <span className="font-semibold text-gray-600 dark:text-dk-text">{subjectLabel}:</span>
                <span className="text-gray-900 dark:text-dk-text">{previewTemplate.subject}</span>
              </p>
              {previewAttachments.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-dk-text2">
                  <span className="font-semibold text-gray-600 dark:text-dk-text">Tệp đính kèm:</span>
                  <div className="flex flex-wrap gap-2">
                    {previewAttachments.map((attachment, index) => (
                      <button
                        type="button"
                        key={`${attachment.url}-${index}`}
                        onClick={() => handleOpenAttachment(attachment)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-gray-200 dark:border-dk-border bg-white dark:bg-dk-inset text-gray-700 dark:text-dk-text hover:text-primary-600 dark:hover:text-primary-400 hover:border-primary-200 dark:hover:border-primary-800 transition-colors"
                      >
                        <HiOutlinePaperClip className="w-3.5 h-3.5" />
                        <span className="truncate max-w-[180px]">{attachment.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowPreviewModal(false)}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-gray-200 dark:hover:bg-dk-strong text-gray-500 dark:text-dk-text2 transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-auto p-0 bg-gray-50 dark:bg-dk-inset">
          <div className="max-w-[800px] mx-auto h-full bg-white dark:bg-dk-surface shadow-2xl">
            {previewTemplate.bodyHtml ? (
              // HTML do tenant soạn: sandbox không có allow-scripts nên script/onerror không chạy;
              // allow-same-origin chỉ để resizeIframeToContent đọc được chiều cao nội dung.
              <iframe
                ref={modalPreviewIframeRef}
                sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                srcDoc={wrapEmailSrcDoc(previewTemplate.bodyHtml)}
                onLoad={() => resizeIframeToContent(modalPreviewIframeRef.current)}
                className="w-full min-h-[500px]"
                title="Preview"
                style={{ border: 'none' }}
              />
            ) : previewTemplate.bodyText ? (
              <div
                className="w-full h-full p-6 text-gray-800 dark:text-dk-text"
                style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              >
                {previewTemplate.bodyText}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 dark:text-dk-muted">
                Template này chưa có nội dung
              </div>
            )}
          </div>
        </div>
        <div className="p-4 bg-white dark:bg-dk-surface border-t border-gray-200 dark:border-dk-border flex justify-end">
          <button
            onClick={() => setShowPreviewModal(false)}
            className="btn btn-secondary"
          >
            Đóng
          </button>
        </div>
      </div>
    </FullScreenOverlay>
  );
};

export default EmailTemplatePreviewModal;
