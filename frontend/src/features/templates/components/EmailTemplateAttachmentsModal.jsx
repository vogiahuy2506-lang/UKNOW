import { HiOutlinePaperClip } from 'react-icons/hi';
import FullScreenOverlay from '../../../components/FullScreenOverlay';

const EmailTemplateAttachmentsModal = ({
  showAttachmentsModal,
  setShowAttachmentsModal,
  formData,
  handleOpenAttachment,
  handleDeleteTempUpload,
  setDeletedAttachments,
  setFormData,
}) => {
  if (!showAttachmentsModal) return null;

  return (
    <FullScreenOverlay
      isOpen={showAttachmentsModal}
      className="p-4"
      onBackdropClick={() => setShowAttachmentsModal(false)}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Danh sách tệp đã upload</h3>
          <button
            onClick={() => setShowAttachmentsModal(false)}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            ✕
          </button>
        </div>
        {formData.attachments?.length ? (
          <div className="space-y-3 max-h-[50vh] overflow-auto">
            {formData.attachments.map((file, index) => (
              <div key={`${file.url || file.tempId}-${index}`} className="border border-gray-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <HiOutlinePaperClip className="w-4 h-4 text-gray-500 shrink-0" />
                    {file.url || file.link || file.key ? (
                      <button
                        type="button"
                        onClick={() => handleOpenAttachment(file)}
                        className="text-sm text-blue-600 hover:text-blue-700 truncate text-left"
                      >
                        {file.name || file.originalName || `Tệp đính kèm ${index + 1}`}
                      </button>
                    ) : (
                      <span className="text-sm text-gray-700 truncate">
                        {file.name || file.originalName || `Tệp đính kèm ${index + 1}`}
                      </span>
                    )}
                    {file.isTemp && (
                      <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full shrink-0">
                        Tạm thời
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
                    className="text-xs text-red-600 hover:text-red-700 font-medium shrink-0"
                  >
                    Xóa
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 whitespace-nowrap shrink-0">Tên hiển thị:</label>
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
                    placeholder='VD: "Quà tặng", "Tài liệu miễn phí"'
                    className="flex-1 text-xs px-2.5 py-1.5 border border-gray-300 rounded-md focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                {file.displayName && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    ✓ Sẽ chèn link xem file vào email: <span className="font-semibold">{file.displayName}</span>
                  </p>
                )}
                {!file.displayName && (
                  <p className="text-xs text-gray-400">
                    Không có tên hiển thị → đính kèm trực tiếp vào email
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Chưa có tệp nào.</p>
        )}
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => setShowAttachmentsModal(false)}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </FullScreenOverlay>
  );
};

export default EmailTemplateAttachmentsModal;
