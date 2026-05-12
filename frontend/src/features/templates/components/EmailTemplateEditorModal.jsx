import {
  HiOutlineEye,
  HiOutlinePaperClip,
  HiOutlinePencil,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineUpload,
  HiOutlineSparkles,
} from 'react-icons/hi';
import FullScreenOverlay from '../../../components/FullScreenOverlay';

/** Danh sách biến gợi ý dùng chung cho email và zalo */
const SUGGESTED_VARIABLES = [
  { name: 'Tên khách hàng', key: 'ten_khach' },
  { name: 'Link khóa học', key: 'link_khoa_hoc' },
  { name: 'Tên khóa học', key: 'ten_khoa_hoc' },
  { name: 'Email khách hàng', key: 'email_khach' },
  { name: 'Số điện thoại', key: 'so_dien_thoai' },
];

const EmailTemplateEditorModal = ({
  showEditorModal,
  editingTemplate,
  setShowEditorModal,
  setEditingTemplate,
  handleSubmit,
  formData,
  setFormData,
  subjectInputRef,
  setActiveInput,
  updateSubjectValue,
  editorTab,
  setEditorTab,
  fileInputRef,
  handleFileSelect,
  isUploading,
  setShowAttachmentsModal,
  contentTab,
  setIsPreviewVisible,
  isPreviewVisible,
  editorContainerRef,
  editorSplit,
  setContentTab,
  setShowVariableSuggestions,
  htmlTextareaRef,
  textTextareaRef,
  updateContentValue,
  showVariableSuggestions,
  variables,
  activeInput,
  suggestionPosition,
  variableQuery,
  insertVariableAtCursor,
  startResize,
  editorPreviewIframeRef,
  editorPreviewSrcDoc,
  resizeIframeToContent,
  newVariable,
  setNewVariable,
  handleAddVariable,
  editingVariableIndex,
  editingVariable,
  setEditingVariable,
  handleSaveEditVariable,
  handleCancelEditVariable,
  handleStartEditVariable,
  handleRemoveVariable,
  handleAddSuggestedVariable,
  hideHtmlTab = false,
  subjectLabel = 'Tiêu đề email',
  templateKindLabel = 'email',
}) => (
  <FullScreenOverlay isOpen={showEditorModal}>
    <div className="bg-white rounded-none shadow-2xl w-full h-full flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center text-primary-600">
            <HiOutlinePencil className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {editingTemplate ? 'Chỉnh sửa template' : 'Tạo template mới'}
            </h3>
            <p className="text-xs text-gray-500">Điền thông tin và thiết kế nội dung</p>
          </div>
        </div>
        <button
          onClick={() => {
            setShowEditorModal(false);
            setEditingTemplate(null);
          }}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-white grid grid-cols-12 gap-4">
          <div className="col-span-4 space-y-1">
            <label className="text-sm font-medium text-gray-700">Tên template</label>
            <input
              type="text"
              value={formData.templateName}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  templateName: e.target.value,
                }))
              }
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
              placeholder="Ví dụ: Chào mừng khách hàng mới"
              required
            />
          </div>
          <div className="col-span-6 space-y-1">
            <label className="text-sm font-medium text-gray-700">{subjectLabel}</label>
            <input
              type="text"
              value={formData.subject}
              ref={subjectInputRef}
              onFocus={() => setActiveInput('subject')}
              onClick={() => setActiveInput('subject')}
              onChange={(e) =>
                updateSubjectValue(e.target.value, e.target.selectionStart || 0)
              }
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
              placeholder="Ví dụ: Chào mừng {{name}} đến với Founder AI!"
              required
            />
          </div>
          <div className="col-span-2 space-y-1">
            <label className="text-sm font-medium text-gray-700">Phân loại</label>
            <select
              value={formData.category}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  category: e.target.value,
                }))
              }
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
            >
              <option value="marketing">Marketing</option>
              <option value="notification">Thông báo</option>
            </select>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 bg-white">
              <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setEditorTab('content')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${editorTab === 'content' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Nội dung
                </button>
                <button
                  type="button"
                  onClick={() => setEditorTab('variables')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${editorTab === 'variables' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Thiết lập biến
                </button>
              </div>
              {editorTab === 'content' && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="text-sm flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white text-gray-600 border-gray-300 hover:bg-gray-50 transition-all disabled:opacity-60"
                  >
                    <HiOutlineUpload className="w-4 h-4" /> {isUploading ? 'Đang upload...' : 'Upload file'}
                  </button>
                  {formData.attachments?.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAttachmentsModal(true)}
                      className="text-sm flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white text-gray-600 border-gray-300 hover:bg-gray-50 transition-all"
                    >
                      <HiOutlinePaperClip className="w-4 h-4" /> Files ({formData.attachments.length})
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  {contentTab === 'html' && (
                    <button
                      type="button"
                      onClick={() => setIsPreviewVisible(!isPreviewVisible)}
                      className={`text-sm flex items-center gap-1 px-3 py-1.5 rounded-lg border transition-all ${isPreviewVisible ? 'bg-primary-50 text-primary-700 border-primary-200' : 'bg-white text-gray-600 border-gray-300'}`}
                    >
                      <HiOutlineEye className="w-4 h-4" /> {isPreviewVisible ? 'Ẩn Preview' : 'Xem Preview'}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-hidden">
              {editorTab === 'content' ? (
                <div ref={editorContainerRef} className="flex h-full">
                  <div
                    className="flex flex-col min-w-[320px]"
                    style={{
                      width:
                        isPreviewVisible && contentTab === 'html'
                          ? `${editorSplit}%`
                          : '100%',
                    }}
                  >
                    <div className="flex border-b border-gray-200 bg-gray-50">
                      {!hideHtmlTab && (
                        <button
                          type="button"
                          onClick={() => {
                            setContentTab('html');
                            setActiveInput('html');
                            setShowVariableSuggestions(false);
                          }}
                          className={`px-4 py-2 text-sm font-medium transition-all ${contentTab === 'html' ? 'bg-white text-gray-900 border-b-2 border-primary-500' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          HTML Editor
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setContentTab('text');
                          setActiveInput('text');
                          setIsPreviewVisible(false);
                          setShowVariableSuggestions(false);
                        }}
                        className={`px-4 py-2 text-sm font-medium transition-all ${contentTab === 'text' ? 'bg-white text-gray-900 border-b-2 border-primary-500' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        Text Format
                      </button>
                    </div>

                    <div className="flex-1 relative">
                      {contentTab === 'html' ? (
                        <textarea
                          ref={htmlTextareaRef}
                          value={formData.bodyHtml}
                          onChange={(e) =>
                            updateContentValue('html', e.target.value, e.target.selectionStart)
                          }
                          className="w-full h-full p-3 font-mono text-[13px] bg-gray-50 focus:bg-white resize-none outline-none border-0 focus:ring-0 focus:border-0 focus:outline-none"
                          style={{ outline: 'none', border: 'none', boxShadow: 'none' }}
                          placeholder="<!-- Bắt đầu viết mã HTML của bạn tại đây... -->"
                        />
                      ) : (
                        <div className="flex flex-col h-full bg-white">
                          <div className="flex-1 relative bg-gray-100 p-4">
                            <textarea
                              ref={textTextareaRef}
                              value={formData.bodyText}
                              onFocus={() => setActiveInput('text')}
                              onClick={() => setActiveInput('text')}
                              onChange={(e) => updateContentValue('text', e.target.value, e.target.selectionStart)}
                              className="w-full h-full p-3 text-[13px] bg-white outline-none border border-gray-200 rounded-md shadow-sm resize-none"
                              placeholder="Nhập nội dung văn bản..."
                            />
                          </div>
                        </div>
                      )}

                      {showVariableSuggestions &&
                        variables.length > 0 &&
                        (activeInput === 'html' || activeInput === 'text' || activeInput === 'subject') && (
                          <>
                            {/* Backdrop trong suốt để đóng dropdown khi click ra ngoài */}
                            <div
                              className="fixed inset-0 z-[59]"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setShowVariableSuggestions(false);
                              }}
                            />
                            <div
                              className="fixed w-64 bg-white border border-gray-300 rounded-lg shadow-xl z-[60] overflow-hidden"
                              style={{ top: suggestionPosition.top, left: suggestionPosition.left }}
                            >
                              <div className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200">
                                Chọn biến để chèn
                              </div>
                              <div className="max-h-48 overflow-auto py-1">
                                {variables
                                  .filter(
                                    (v) =>
                                      v.name?.toLowerCase().includes(variableQuery.toLowerCase()) ||
                                      v.key?.toLowerCase().includes(variableQuery.toLowerCase())
                                  )
                                  .map((variable, index) => (
                                    <button
                                      key={`${variable.key}-${index}`}
                                      type="button"
                                      onMouseDown={(e) => {
                                        // Dùng onMouseDown thay vì onClick để lấy selectionStart trước khi textarea mất focus
                                        e.preventDefault();
                                        insertVariableAtCursor(variable.key);
                                      }}
                                      className="w-full text-left px-3 py-2 hover:bg-primary-50 transition-colors flex items-center justify-between group"
                                    >
                                      <span className="text-sm text-gray-700 font-medium group-hover:text-primary-700">{variable.name}</span>
                                      <code className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded group-hover:bg-primary-100">{`{{${variable.key}}}`}</code>
                                    </button>
                                  ))}
                              </div>
                            </div>
                          </>
                        )}
                    </div>
                  </div>

                  {isPreviewVisible && contentTab === 'html' && (
                    <>
                      <div
                        onMouseDown={startResize}
                        className="w-2 cursor-col-resize bg-gray-100 hover:bg-gray-200 border-l border-r border-gray-200"
                      />
                      <div
                        className="flex flex-col min-w-[320px] bg-white"
                        style={{ width: `${100 - editorSplit}%` }}
                      >
                        <div className="flex border-b border-gray-200 bg-white">
                          <div className="px-4 py-2 text-sm font-medium text-gray-700">
                            Xem trước
                          </div>
                        </div>
                        <div className="flex-1 p-6 overflow-auto flex justify-center bg-gray-100">
                          <div className="w-full max-w-[760px] bg-white shadow-md border border-gray-200 min-h-full">
                            {formData.bodyHtml ? (
                              <iframe
                                ref={editorPreviewIframeRef}
                                srcDoc={editorPreviewSrcDoc}
                                onLoad={() => resizeIframeToContent(editorPreviewIframeRef.current)}
                                className="w-full min-h-[500px] outline-none focus:outline-none"
                                title="Preview"
                                style={{ border: 'none', outline: 'none' }}
                              />
                            ) : (
                              <div className="h-full flex flex-col items-center justify-center text-gray-400 p-10 space-y-4">
                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                                  <HiOutlineEye className="w-8 h-8 opacity-50" />
                                </div>
                                <p className="text-center">Nhập mã HTML để xem trước kết quả hiển thị</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="h-full bg-gray-50 p-4 overflow-auto">
                  <div className="max-w-4xl mx-auto space-y-4">
                    {/* Section biến gợi ý */}
                    <div className="bg-white p-4 rounded-lg border border-gray-200">
                      <div className="flex items-center gap-2 mb-3">
                        <HiOutlineSparkles className="w-4 h-4 text-primary-500" />
                        <h4 className="text-base font-semibold text-gray-900">Biến gợi ý</h4>
                      </div>
                      <p className="text-xs text-gray-500 mb-3">
                        Click vào biến để thêm nhanh vào danh sách biến của template.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {SUGGESTED_VARIABLES.map((sv) => {
                          const alreadyAdded = variables.some((v) => v.key === sv.key);
                          return (
                            <button
                              key={sv.key}
                              type="button"
                              onClick={() => handleAddSuggestedVariable(sv)}
                              disabled={alreadyAdded}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                                alreadyAdded
                                  ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-default'
                                  : 'bg-primary-50 border-primary-200 text-primary-700 hover:bg-primary-100 hover:border-primary-300 cursor-pointer'
                              }`}
                            >
                              <HiOutlinePlus className={`w-3 h-3 ${alreadyAdded ? 'opacity-0' : ''}`} />
                              <span>{sv.name}</span>
                              <code className="text-[10px] opacity-60">{`{{${sv.key}}}`}</code>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-lg border border-gray-200">
                      <h4 className="text-base font-semibold text-gray-900 mb-2">Quản lý biến</h4>
                      <p className="text-xs text-gray-600 mb-4">
                        {`Tạo và quản lý các biến để sử dụng trong template ${templateKindLabel}. Sử dụng cú pháp {{variable}} để chèn biến vào nội dung.`}
                      </p>

                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <div>
                          <label className="text-xs font-medium text-gray-700 mb-1 block">Tên biến</label>
                          <input
                            type="text"
                            value={newVariable.name}
                            onChange={(e) =>
                              setNewVariable((prev) => ({
                                ...prev,
                                name: e.target.value,
                              }))
                            }
                            className="w-full px-3 py-1.5 text-sm bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                            placeholder="Ví dụ: Tên khách hàng"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-700 mb-1 block">Mã biến</label>
                          <input
                            type="text"
                            value={newVariable.key}
                            onChange={(e) =>
                              setNewVariable((prev) => ({
                                ...prev,
                                key: e.target.value,
                              }))
                            }
                            className="w-full px-3 py-1.5 text-sm bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                            placeholder="name"
                          />
                        </div>
                        <div className="flex items-end">
                          <button
                            type="button"
                            onClick={handleAddVariable}
                            className="w-full bg-primary-500 hover:bg-primary-600 text-white px-4 py-1.5 rounded-lg font-medium transition-colors text-sm"
                          >
                            <HiOutlinePlus className="w-4 h-4 mr-2 inline" />
                            Thêm biến
                          </button>
                        </div>
                      </div>

                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                          <h5 className="text-xs font-semibold text-gray-900">Danh sách biến ({variables.length})</h5>
                        </div>
                        {variables.length === 0 ? (
                          <div className="p-4 text-center text-gray-500">
                            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2">
                              <HiOutlinePlus className="w-6 h-6 text-gray-400" />
                            </div>
                            <p className="text-sm">Chưa có biến nào được tạo</p>
                            <p className="text-xs mt-1">Thêm biến để sử dụng trong template</p>
                          </div>
                        ) : (
                          <div className="overflow-auto">
                            <table className="min-w-full text-sm">
                              <thead className="bg-gray-50">
                                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                                  <th className="px-4 py-2 font-semibold">Tên trường</th>
                                  <th className="px-4 py-2 font-semibold">Mã biến</th>
                                  <th className="px-4 py-2 font-semibold w-24 text-right">Thao tác</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {variables.map((variable, index) => (
                                  <tr key={`${variable.key}-${index}`} className="hover:bg-gray-50 transition-colors">
                                    {editingVariableIndex === index ? (
                                      <>
                                        <td className="px-4 py-2">
                                          <input
                                            type="text"
                                            value={editingVariable.name}
                                            onChange={(e) =>
                                              setEditingVariable((prev) => ({
                                                ...prev,
                                                name: e.target.value,
                                              }))
                                            }
                                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                          />
                                        </td>
                                        <td className="px-4 py-2">
                                          <input
                                            type="text"
                                            value={editingVariable.key}
                                            onChange={(e) =>
                                              setEditingVariable((prev) => ({
                                                ...prev,
                                                key: e.target.value,
                                              }))
                                            }
                                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                          />
                                        </td>
                                        <td className="px-4 py-2">
                                          <div className="flex items-center justify-end gap-2">
                                            <button
                                              type="button"
                                              onClick={handleSaveEditVariable}
                                              className="px-3 py-1.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-xs"
                                            >
                                              Lưu
                                            </button>
                                            <button
                                              type="button"
                                              onClick={handleCancelEditVariable}
                                              className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-xs"
                                            >
                                              Hủy
                                            </button>
                                          </div>
                                        </td>
                                      </>
                                    ) : (
                                      <>
                                        <td className="px-4 py-2 font-medium text-gray-900">{variable.name}</td>
                                        <td className="px-4 py-2">
                                          <code className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                                            {`{{${variable.key}}}`}
                                          </code>
                                        </td>
                                        <td className="px-4 py-2">
                                          <div className="flex items-center justify-end gap-2">
                                            <button
                                              type="button"
                                              onClick={() => handleStartEditVariable(index)}
                                              className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                                              title="Chỉnh sửa"
                                            >
                                              <HiOutlinePencil className="w-4 h-4" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleRemoveVariable(index)}
                                              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                              title="Xóa"
                                            >
                                              <HiOutlineTrash className="w-4 h-4" />
                                            </button>
                                          </div>
                                        </td>
                                      </>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 bg-white flex justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              setShowEditorModal(false);
              setEditingTemplate(null);
            }}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Hủy bỏ
          </button>
          <button type="submit" className="px-4 py-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600 shadow-sm transition-all">
            {editingTemplate ? 'Lưu thay đổi' : 'Tạo template mới'}
          </button>
        </div>
      </form>
    </div>
  </FullScreenOverlay>
);

export default EmailTemplateEditorModal;
