import { HiOutlinePaperClip } from 'react-icons/hi';
import FullScreenOverlay from '../../../components/FullScreenOverlay';
import { useI18n } from '../../../i18n';

const EmailTemplateAttachmentsModal = ({
  showAttachmentsModal,
  setShowAttachmentsModal,
  formData,
  handleOpenAttachment,
  handleDeleteTempUpload,
  setDeletedAttachments,
  setFormData,
}) => {
  const { t } = useI18n();

  if (!showAttachmentsModal) return null;

  return (
    <FullScreenOverlay
      isOpen={showAttachmentsModal}
      className="p-4"
      onBackdropClick={() => setShowAttachmentsModal(false)}
    >
      <div className="bg-white dark:bg-dk-surface rounded-xl shadow-2xl border border-gray-200 dark:border-dk-border w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-dk-text">{t('emailAttachments.title')}</h3>
          <button
            onClick={() => setShowAttachmentsModal(false)}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-dk-raised text-gray-400 dark:text-dk-muted hover:text-gray-600 dark:hover:text-dk-text transition-colors"
          >
            ✕
          </button>
        </div>
        {formData.attachments?.length ? (
          <div className="space-y-3 max-h-[50vh] overflow-auto">
            {formData.attachments.map((file, index) => (
              <div key={`${file.url || file.tempId}-${index}`} className="border border-gray-200 dark:border-dk-border bg-white dark:bg-dk-raised/40 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <HiOutlinePaperClip className="w-4 h-4 text-gray-500 dark:text-dk-text2 shrink-0" />
                    {file.url || file.link || file.key ? (
                      <button
                        type="button"
                        onClick={() => handleOpenAttachment(file)}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 truncate text-left"
                      >
                        {file.name || file.originalName || `${t('emailAttachments.fileAttachment')} ${index + 1}`}
                      </button>
                    ) : (
                      <span className="text-sm text-gray-700 dark:text-dk-text truncate">
                        {file.name || file.originalName || `${t('emailAttachments.fileAttachment')} ${index + 1}`}
                      </span>
                    )}
                    {file.isTemp && (
                      <span className="text-xs bg-yellow-100 dark:bg-yellow-950/40 text-yellow-800 dark:text-yellow-300 px-2 py-0.5 rounded-full shrink-0">
                        {t('emailAttachments.tempFile')}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (file.isTemp && file.tempId) {
                        await handleDeleteTempUpload(file.tempId);
                      } else if (!file.isTemp) {
                        const deletedRef = file.key || file.url || file.link || file.attachmentUrl;
                        if (deletedRef) setDeletedAttachments((prev) => [...prev, deletedRef]);
                      }
                      setFormData((prev) => ({
                        ...prev,
                        attachments: prev.attachments.filter((_, i) => i !== index),
                      }));
                    }}
                    className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium shrink-0"
                  >
                    {t('emailAttachments.delete')}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 dark:text-dk-text2 whitespace-nowrap shrink-0">{t('emailAttachments.displayName')}</label>
                  <input
                    type="text"
                    value={file.displayName || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        attachments: prev.attachments.map((a, i) =>
                          i === index ? { ...a, displayName: e.target.value } : a
                        ),
                      }))
                    }
                    placeholder={t('emailAttachments.displayNamePlaceholder')}
                    className="flex-1 text-xs px-2.5 py-1.5 border border-gray-300 dark:border-dk-border bg-white dark:bg-dk-inset text-gray-900 dark:text-dk-text placeholder:text-gray-400 dark:placeholder:text-dk-muted rounded-md focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                {file.displayName && (
                  <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                    ✓ {t('emailAttachments.willInsertLink')} <span className="font-semibold">{file.displayName}</span>
                  </p>
                )}
                {!file.displayName && (
                  <p className="text-xs text-gray-400 dark:text-dk-muted">
                    {t('emailAttachments.noDisplayName')}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-dk-text2">{t('emailAttachments.noFiles')}</p>
        )}
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => setShowAttachmentsModal(false)}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-dk-border text-gray-700 dark:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-raised transition-colors"
          >
            {t('emailAttachments.close')}
          </button>
        </div>
      </div>
    </FullScreenOverlay>
  );
};

export default EmailTemplateAttachmentsModal;
