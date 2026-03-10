import { useMemo, useState } from 'react';
import {
  HiOutlineDocument,
  HiOutlineExclamationCircle,
  HiOutlineLightningBolt,
  HiOutlineMail,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineUserAdd,
} from 'react-icons/hi';
import NodeConfigTemplatePreviewModal from './NodeConfigTemplatePreviewModal';
import TemplateSearchSelect from './TemplateSearchSelect';

/**
 * Section UI for send-email node configuration.
 *
 * @param {Object} props section props
 * @param {Object} props.formData current node form data
 * @param {Function} props.setFormData React setter for form data
 * @param {string} props.selectedEmailSection active section id
 * @param {Function} props.setSelectedEmailSection section state setter
 * @param {Array} props.emailSettings active email settings list
 * @param {Array} props.emailTemplates available email templates list
 * @param {Array} props.upstreamNodes upstream nodes list
 * @param {Array} props.sourceSchema resolved schema for recipient node
 * @param {Function} props.getSchemaForNodeId schema resolver by node id
 * @param {Function} props.fetchTemplateDetail template detail loader
 * @param {Function} props.normalizeTemplateVariables template variable parser
 * @param {Function} [props.onOpenTemplateAttachment] callback mở file đính kèm trong preview
 * @returns {JSX.Element}
 */
export const NodeConfigSendEmailSection = ({
  formData,
  setFormData,
  selectedEmailSection,
  setSelectedEmailSection,
  emailSettings,
  emailTemplates,
  upstreamNodes,
  sourceSchema,
  getSchemaForNodeId,
  fetchTemplateDetail,
  normalizeTemplateVariables,
  onOpenTemplateAttachment,
}) => {
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const emailTemplateOptions = useMemo(
    () => emailTemplates.map((tpl) => ({
      id: tpl.id,
      label: String(tpl.templateName || `Template #${tpl.id}`),
      description: String(tpl.category || '').trim(),
    })),
    [emailTemplates]
  );

  const handleEmailStepChange = (index, field, value) => {
    setFormData((prev) => ({
      ...prev,
      emailSteps: (prev.emailSteps || []).map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    }));
  };

  const handleEmailStepTemplateSelect = async (index, templateId) => {
    const id = parseInt(templateId, 10);
    if (!id) {
      handleEmailStepChange(index, 'templateId', '');
      handleEmailStepChange(index, 'templateMappings', []);
      return;
    }
    const tpl = await fetchTemplateDetail(id);
    const variables = normalizeTemplateVariables(tpl);
    const nextMappings = variables.map((key) => ({ key, sourceType: 'manual', value: '', nodeId: '', field: '' }));
    setFormData((prev) => ({
      ...prev,
      emailSteps: (prev.emailSteps || []).map((s, i) =>
        i === index ? { ...s, templateId: id, templateMappings: nextMappings } : s
      ),
    }));
  };

  const handlePreviewEmailTemplate = async (templateId) => {
    const id = parseInt(templateId, 10);
    if (!id) return;
    try {
      const selected = await fetchTemplateDetail(id);
      if (!selected) return;
      setPreviewTemplate(selected);
      setIsPreviewOpen(true);
    } catch {
      // Keep quiet to preserve current UX style in node config.
    }
  };

  const handleEmailStepMappingChange = (stepIndex, mappingIndex, field, value) => {
    setFormData((prev) => ({
      ...prev,
      emailSteps: (prev.emailSteps || []).map((s, i) => {
        if (i !== stepIndex) return s;
        return {
          ...s,
          templateMappings: (s.templateMappings || []).map((m, j) =>
            j === mappingIndex ? { ...m, [field]: value } : m
          ),
        };
      }),
    }));
  };

  const handleAddEmailStep = () => {
    setFormData((prev) => ({
      ...prev,
      emailSteps: [
        ...(prev.emailSteps || []),
        {
          id: `step-${Date.now()}`,
          delayValue: 0,
          delayUnit: 'minutes',
          delayFrom: 'start',
          templateId: '',
          templateMappings: [],
        },
      ],
    }));
  };

  const handleRemoveEmailStep = (index) => {
    setFormData((prev) => ({
      ...prev,
      emailSteps: (prev.emailSteps || []).filter((_, i) => i !== index),
    }));
  };

  const emailSections = [
    { id: 'basic', name: 'Thông tin cơ bản', icon: HiOutlineMail },
    { id: 'recipient', name: 'Email người nhận', icon: HiOutlineUserAdd },
    { id: 'cc', name: 'CC', icon: HiOutlineMail, badge: formData.ccEnabled },
    { id: 'bcc', name: 'BCC', icon: HiOutlineMail, badge: formData.bccEnabled },
    { id: 'sendMode', name: 'Hình thức gửi', icon: HiOutlineLightningBolt },
    { id: 'templates', name: 'Danh sách email gửi', icon: HiOutlineDocument },
    { id: 'maxSend', name: 'Giới hạn gửi', icon: HiOutlineExclamationCircle, badge: formData.maxSendEnabled },
  ];

  const renderEmailSection = () => {
    switch (selectedEmailSection) {
      case 'basic':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tên node</label>
              <input
                type="text"
                value={formData.label}
                onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="Gửi Email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email gửi (SMTP đã cấu hình) <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.fromEmailId || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, fromEmailId: parseInt(e.target.value, 10) || '' }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="">-- Chọn email gửi --</option>
                {emailSettings.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.email})
                  </option>
                ))}
              </select>
              {emailSettings.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Chưa có SMTP đang hoạt động. Vào Cài đặt Email để thêm và bật trạng thái "active".
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="saveMessageLog"
                checked={formData.saveMessageLog}
                onChange={(e) => setFormData((prev) => ({ ...prev, saveMessageLog: e.target.checked }))}
                className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
              />
              <label htmlFor="saveMessageLog" className="text-sm text-gray-700">
                Lưu lại lịch sử tin nhắn đã gửi cho từng khách hàng
              </label>
            </div>
          </div>
        );

      case 'recipient':
        return (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">Email người nhận <span className="text-red-500">*</span></h4>

            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="recipientSource"
                  value="manual"
                  checked={formData.recipientSource === 'manual'}
                  onChange={(e) => setFormData((prev) => ({ ...prev, recipientSource: e.target.value }))}
                  className="text-primary-500 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Nhập thủ công</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="recipientSource"
                  value="node"
                  checked={formData.recipientSource === 'node'}
                  onChange={(e) => setFormData((prev) => ({ ...prev, recipientSource: e.target.value }))}
                  className="text-primary-500 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Lấy từ node trước</span>
              </label>
            </div>

            {formData.recipientSource === 'manual' ? (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Danh sách email</label>
                <textarea
                  value={formData.recipientEmails}
                  onChange={(e) => setFormData((prev) => ({ ...prev, recipientEmails: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  rows={6}
                  placeholder="Nhập email, mỗi email trên một dòng hoặc cách nhau bằng dấu phẩy&#10;vd: email1@gmail.com, email2@gmail.com"
                />
                <p className="text-xs text-gray-400 mt-1">Nhập nhiều email cách nhau bằng dấu phẩy hoặc xuống dòng</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Chọn node dữ liệu</label>
                  <select
                    value={formData.recipientNodeId}
                    onChange={(e) => setFormData((prev) => ({ ...prev, recipientNodeId: e.target.value, recipientField: '' }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">-- Chọn node phía trước --</option>
                    {upstreamNodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.data?.label || n.data?.nodeType || n.type}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Chọn cột email</label>
                  {sourceSchema.length ? (
                    <select
                      value={formData.recipientField}
                      onChange={(e) => setFormData((prev) => ({ ...prev, recipientField: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">-- Chọn cột --</option>
                      {sourceSchema.map((f) => (
                        <option key={f.key} value={f.key}>{f.key}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={formData.recipientField}
                      onChange={(e) => setFormData((prev) => ({ ...prev, recipientField: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      placeholder="VD: email"
                    />
                  )}
                  <p className="text-xs text-gray-400 mt-1">Chọn node phía trước và cột dữ liệu dùng để lấy email</p>
                </div>
              </div>
            )}
          </div>
        );

      case 'cc':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-900">CC (Carbon Copy)</h4>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, ccEnabled: !prev.ccEnabled }))}
                className={`px-3 py-1.5 text-xs rounded-lg ${formData.ccEnabled ? 'bg-primary-50 text-primary-700' : 'bg-gray-100 text-gray-600'}`}
              >
                {formData.ccEnabled ? 'Đã bật' : 'Tắt'}
              </button>
            </div>

            {formData.ccEnabled ? (
              <>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="ccSource"
                      value="manual"
                      checked={formData.ccSource === 'manual'}
                      onChange={(e) => setFormData((prev) => ({ ...prev, ccSource: e.target.value }))}
                      className="text-primary-500 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">Nhập thủ công</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="ccSource"
                      value="node"
                      checked={formData.ccSource === 'node'}
                      onChange={(e) => setFormData((prev) => ({ ...prev, ccSource: e.target.value }))}
                      className="text-primary-500 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">Lấy từ node trước</span>
                  </label>
                </div>

                {formData.ccSource === 'manual' ? (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Danh sách email CC</label>
                    <textarea
                      value={formData.ccEmails}
                      onChange={(e) => setFormData((prev) => ({ ...prev, ccEmails: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      rows={4}
                      placeholder="Nhập email, mỗi email trên một dòng hoặc cách nhau bằng dấu phẩy"
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Chọn node dữ liệu</label>
                      <select
                        value={formData.ccNodeId}
                        onChange={(e) => setFormData((prev) => ({ ...prev, ccNodeId: e.target.value, ccField: '' }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">-- Chọn node phía trước --</option>
                        {upstreamNodes.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.data?.label || n.data?.nodeType || n.type}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Chọn cột email</label>
                      {getSchemaForNodeId(formData.ccNodeId).length ? (
                        <select
                          value={formData.ccField}
                          onChange={(e) => setFormData((prev) => ({ ...prev, ccField: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        >
                          <option value="">-- Chọn cột --</option>
                          {getSchemaForNodeId(formData.ccNodeId).map((f) => (
                            <option key={f.key} value={f.key}>{f.key}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={formData.ccField}
                          onChange={(e) => setFormData((prev) => ({ ...prev, ccField: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                          placeholder="VD: email"
                        />
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs text-gray-500">
                Bật chức năng CC để gửi bản sao email đến những người khác.
              </div>
            )}
          </div>
        );

      case 'bcc':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-900">BCC (Blind Carbon Copy)</h4>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, bccEnabled: !prev.bccEnabled }))}
                className={`px-3 py-1.5 text-xs rounded-lg ${formData.bccEnabled ? 'bg-primary-50 text-primary-700' : 'bg-gray-100 text-gray-600'}`}
              >
                {formData.bccEnabled ? 'Đã bật' : 'Tắt'}
              </button>
            </div>

            {formData.bccEnabled ? (
              <>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="bccSource"
                      value="manual"
                      checked={formData.bccSource === 'manual'}
                      onChange={(e) => setFormData((prev) => ({ ...prev, bccSource: e.target.value }))}
                      className="text-primary-500 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">Nhập thủ công</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="bccSource"
                      value="node"
                      checked={formData.bccSource === 'node'}
                      onChange={(e) => setFormData((prev) => ({ ...prev, bccSource: e.target.value }))}
                      className="text-primary-500 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">Lấy từ node trước</span>
                  </label>
                </div>

                {formData.bccSource === 'manual' ? (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Danh sách email BCC</label>
                    <textarea
                      value={formData.bccEmails}
                      onChange={(e) => setFormData((prev) => ({ ...prev, bccEmails: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      rows={4}
                      placeholder="Nhập email, mỗi email trên một dòng hoặc cách nhau bằng dấu phẩy"
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Chọn node dữ liệu</label>
                      <select
                        value={formData.bccNodeId}
                        onChange={(e) => setFormData((prev) => ({ ...prev, bccNodeId: e.target.value, bccField: '' }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">-- Chọn node phía trước --</option>
                        {upstreamNodes.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.data?.label || n.data?.nodeType || n.type}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Chọn cột email</label>
                      {getSchemaForNodeId(formData.bccNodeId).length ? (
                        <select
                          value={formData.bccField}
                          onChange={(e) => setFormData((prev) => ({ ...prev, bccField: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        >
                          <option value="">-- Chọn cột --</option>
                          {getSchemaForNodeId(formData.bccNodeId).map((f) => (
                            <option key={f.key} value={f.key}>{f.key}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={formData.bccField}
                          onChange={(e) => setFormData((prev) => ({ ...prev, bccField: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                          placeholder="VD: email"
                        />
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs text-gray-500">
                Bật chức năng BCC để gửi bản sao ẩn email đến những người khác.
              </div>
            )}
          </div>
        );

      case 'sendMode':
        return (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">Hình thức gửi</h4>

            <div className="flex flex-col gap-3">
              <label className="flex items-start gap-3 cursor-pointer p-3 border rounded-lg hover:bg-gray-50">
                <input
                  type="radio"
                  name="sendMode"
                  value="all"
                  checked={formData.sendMode === 'all'}
                  onChange={(e) => setFormData((prev) => ({ ...prev, sendMode: e.target.value }))}
                  className="mt-1 text-primary-500 focus:ring-primary-500"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900">Gửi cùng lúc</div>
                  <div className="text-xs text-gray-500 mt-1">Gửi tất cả email ngay lập tức</div>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer p-3 border rounded-lg hover:bg-gray-50">
                <input
                  type="radio"
                  name="sendMode"
                  value="schedule"
                  checked={formData.sendMode === 'schedule'}
                  onChange={(e) => setFormData((prev) => ({ ...prev, sendMode: e.target.value }))}
                  className="mt-1 text-primary-500 focus:ring-primary-500"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900">Theo lịch</div>
                  <div className="text-xs text-gray-500 mt-1">Gửi email theo lịch trình đã cấu hình</div>
                </div>
              </label>
            </div>
          </div>
        );

      case 'templates':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-900">Danh sách email gửi</h4>
              <button
                type="button"
                onClick={handleAddEmailStep}
                className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
              >
                <HiOutlinePlus className="w-4 h-4" />
                Thêm email
              </button>
            </div>

            {(formData.emailSteps || []).length === 0 && (
              <div className="text-center py-8 text-sm text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
                Chưa có email nào. Hãy thêm email.
              </div>
            )}

            <div className="space-y-3">
              {(formData.emailSteps || []).map((step, idx) => (
                <div key={step.id || idx} className="border border-gray-200 rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-800">Email #{idx + 1}</div>
                    {(formData.emailSteps || []).length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveEmailStep(idx)}
                        className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1"
                      >
                        <HiOutlineTrash className="w-3.5 h-3.5" />
                        Xóa
                      </button>
                    )}
                  </div>

                  {formData.sendMode === 'schedule' && (
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Sau bao lâu gửi</label>
                        <input
                          type="number"
                          min={0}
                          value={step.delayValue || 0}
                          onChange={(e) => handleEmailStepChange(idx, 'delayValue', parseInt(e.target.value, 10) || 0)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Đơn vị</label>
                        <select
                          value={step.delayUnit || 'minutes'}
                          onChange={(e) => handleEmailStepChange(idx, 'delayUnit', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm"
                        >
                          <option value="minutes">Phút</option>
                          <option value="hours">Giờ</option>
                          <option value="days">Ngày</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Tính từ</label>
                        <select
                          value={step.delayFrom || 'start'}
                          onChange={(e) => handleEmailStepChange(idx, 'delayFrom', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm"
                        >
                          <option value="start">Lúc chạy</option>
                          <option value="prev">Email trước</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Template Email</label>
                    <TemplateSearchSelect
                      value={step.templateId || ''}
                      options={emailTemplateOptions}
                      onChange={(nextValue) => handleEmailStepTemplateSelect(idx, nextValue)}
                      placeholder="-- Chọn template --"
                      searchPlaceholder="Tìm template email..."
                      emptyText="Không tìm thấy template email phù hợp"
                      onPreview={() => handlePreviewEmailTemplate(step.templateId)}
                    />
                  </div>

                  {(step.templateMappings || []).length > 0 && (
                    <div className="space-y-3">
                      <div className="text-xs font-medium text-gray-700">Mapping biến template</div>
                      {(step.templateMappings || []).map((m, mIdx) => (
                        <div key={m.key || mIdx} className="bg-gray-50 rounded-lg p-3 space-y-3">
                          <div className="text-xs font-medium text-gray-800">{m.key}</div>
                          <div className="flex gap-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`step-${idx}-map-${mIdx}`}
                                value="manual"
                                checked={m.sourceType === 'manual'}
                                onChange={(e) => handleEmailStepMappingChange(idx, mIdx, 'sourceType', e.target.value)}
                                className="text-primary-500 focus:ring-primary-500"
                              />
                              <span className="text-xs text-gray-700">Thủ công</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`step-${idx}-map-${mIdx}`}
                                value="node"
                                checked={m.sourceType === 'node'}
                                onChange={(e) => handleEmailStepMappingChange(idx, mIdx, 'sourceType', e.target.value)}
                                className="text-primary-500 focus:ring-primary-500"
                              />
                              <span className="text-xs text-gray-700">Từ node</span>
                            </label>
                          </div>

                          {m.sourceType === 'manual' ? (
                            <input
                              type="text"
                              value={m.value || ''}
                              onChange={(e) => handleEmailStepMappingChange(idx, mIdx, 'value', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm"
                              placeholder="Nhập giá trị"
                            />
                          ) : (
                            <div className="space-y-2">
                              <select
                                value={m.nodeId || ''}
                                onChange={(e) => handleEmailStepMappingChange(idx, mIdx, 'nodeId', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm"
                              >
                                <option value="">-- Chọn node --</option>
                                {upstreamNodes.map((n) => (
                                  <option key={n.id} value={n.id}>
                                    {n.data?.label || n.data?.nodeType || n.type}
                                  </option>
                                ))}
                              </select>
                              {getSchemaForNodeId(m.nodeId || '').length ? (
                                <select
                                  value={m.field || ''}
                                  onChange={(e) => handleEmailStepMappingChange(idx, mIdx, 'field', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm"
                                >
                                  <option value="">-- Chọn cột --</option>
                                  {getSchemaForNodeId(m.nodeId || '').map((f) => (
                                    <option key={f.key} value={f.key}>{f.key}</option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  value={m.field || ''}
                                  onChange={(e) => handleEmailStepMappingChange(idx, mIdx, 'field', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm"
                                  placeholder="VD: ten_khach"
                                />
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-xs text-blue-700">
                <strong>Lưu ý:</strong> Mapping biến template để thay thế dữ liệu động trong email.
              </p>
            </div>

            <NodeConfigTemplatePreviewModal
              isOpen={isPreviewOpen}
              onClose={() => setIsPreviewOpen(false)}
              template={previewTemplate}
              subjectLabel="Tiêu đề email"
              onOpenAttachment={onOpenTemplateAttachment}
            />
          </div>
        );

      case 'maxSend':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-900">Giới hạn số tin gửi</h4>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({
                  ...prev,
                  maxSendEnabled: !prev.maxSendEnabled,
                  maxSendCount: prev.maxSendCount || 100,
                }))}
                className={`px-3 py-1.5 text-xs rounded-lg ${formData.maxSendEnabled ? 'bg-primary-50 text-primary-700' : 'bg-gray-100 text-gray-600'}`}
              >
                {formData.maxSendEnabled ? 'Đã bật' : 'Tắt'}
              </button>
            </div>

            {formData.maxSendEnabled ? (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Số tin nhắn tối đa trong một lần chạy</label>
                <input
                  type="number"
                  min={1}
                  value={formData.maxSendCount}
                  onChange={(e) => setFormData((prev) => ({ ...prev, maxSendCount: parseInt(e.target.value, 10) || 1 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Giới hạn số lượng email tối đa sẽ gửi trong một lần chạy chiến dịch để tránh spam hoặc quá tải.
                </p>
              </div>
            ) : (
              <div className="text-xs text-gray-500">
                Mặc định sẽ gửi không giới hạn số lượng. Bật để thiết lập giới hạn.
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex" style={{ minHeight: '500px' }}>
      <div className="w-64 border-r border-gray-200 flex flex-col">
        <div className="p-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700">Cài đặt</h3>
        </div>
        <div className="flex-1 overflow-y-auto">
          {emailSections.map((section) => {
            const Icon = section.icon;
            return (
              <div
                key={section.id}
                onClick={() => setSelectedEmailSection(section.id)}
                className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedEmailSection === section.id
                    ? 'bg-primary-50 border-l-4 border-primary-600'
                    : 'border-l-4 border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${selectedEmailSection === section.id ? 'text-primary-600' : 'text-gray-500'}`} />
                    <span className={`text-sm ${selectedEmailSection === section.id ? 'font-medium text-primary-900' : 'text-gray-700'}`}>
                      {section.name}
                    </span>
                  </div>
                  {section.badge && (
                    <span className="w-2 h-2 rounded-full bg-primary-600"></span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {renderEmailSection()}
      </div>
    </div>
  );
};
