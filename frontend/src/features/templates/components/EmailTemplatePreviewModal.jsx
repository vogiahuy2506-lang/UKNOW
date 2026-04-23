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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden animate-fade-in-up">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-white rounded-lg border border-gray-200 shadow-sm">
              {getCategoryBadge(previewTemplate.category)}
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">
                {previewTemplate.templateName}
              </h3>
              <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-2">
                <span className="font-semibold text-gray-600">{subjectLabel}:</span> {previewTemplate.subject}
              </p>
              {previewAttachments.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                  <span className="font-semibold text-gray-600">Tệp đính kèm:</span>
                  <div className="flex flex-wrap gap-2">
                    {previewAttachments.map((attachment, index) => (
                      <button
                        type="button"
                        key={`${attachment.url}-${index}`}
                        onClick={() => handleOpenAttachment(attachment)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-gray-200 bg-white text-gray-700 hover:text-primary-600 hover:border-primary-200 transition-colors"
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
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-gray-200 text-gray-500 transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-auto p-0 bg-gray-50">
          <div className="max-w-[800px] mx-auto h-full bg-white shadow-2xl">
            {previewTemplate.bodyHtml ? (
              <iframe
                ref={modalPreviewIframeRef}
                srcDoc={wrapEmailSrcDoc(previewTemplate.bodyHtml)}
                onLoad={() => resizeIframeToContent(modalPreviewIframeRef.current)}
                className="w-full min-h-[500px]"
                title="Preview"
                style={{ border: 'none' }}
              />
            ) : previewTemplate.bodyText ? (
              <div
                className="w-full h-full p-6 text-gray-800"
                dangerouslySetInnerHTML={{ __html: previewTemplate.bodyText }}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">
                Template này chưa có nội dung
              </div>
            )}
          </div>
        </div>
        <div className="p-4 bg-white border-t border-gray-200 flex justify-end">
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
