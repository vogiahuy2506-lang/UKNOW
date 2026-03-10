import { useEffect, useMemo, useState } from 'react';
import {
  HiOutlineDocument,
  HiOutlineLightningBolt,
  HiOutlineMail,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineUserAdd,
} from 'react-icons/hi';
import NodeConfigTemplatePreviewModal from './NodeConfigTemplatePreviewModal';
import TemplateSearchSelect from './TemplateSearchSelect';

const parseListText = (input) =>
  String(input || '')
    .split(/[\n,;]/g)
    .map((item) => item.trim())
    .filter(Boolean);

const normalizeMappingSourceType = (sourceType) =>
  String(sourceType || '').trim() === 'node' ? 'node' : 'manual';

/**
 * Build stable variable mappings for one selected Zalo template.
 *
 * @param {Object} input mapping build input
 * @param {Object|null} input.template selected template object
 * @param {Array} input.currentMappings existing mappings in step config
 * @param {string} input.defaultNodeId fallback source node id
 * @param {Function} input.normalizeTemplateVariables parser for template variable names
 * @returns {Array<{key: string, sourceType: 'manual'|'node', nodeId: string, field: string, value: string}>}
 */
const buildTemplateStepMappings = ({
  template,
  currentMappings = [],
  defaultNodeId = '',
  normalizeTemplateVariables,
}) => {
  const variables = typeof normalizeTemplateVariables === 'function'
    ? normalizeTemplateVariables(template)
    : [];
  if (!variables.length) return [];

  const existingMap = new Map((Array.isArray(currentMappings) ? currentMappings : []).map((item) => [item?.key, item]));
  return variables.map((key) => {
    const existing = existingMap.get(key) || null;
    return {
      key,
      sourceType: normalizeMappingSourceType(existing?.sourceType),
      nodeId: String(existing?.nodeId || defaultNodeId || '').trim(),
      field: String(existing?.field || '').trim(),
      value: existing?.value ?? '',
    };
  });
};

const DataSourceSelector = ({
  sourceMode,
  onSourceModeChange,
  manualValue,
  onManualValueChange,
  manualLabel,
  manualPlaceholder,
  upstreamNodes = [],
  selectedNodeId,
  onNodeIdChange,
  selectedField,
  onFieldChange,
  fieldLabel,
  nodeSchema = [],
}) => (
  <div className="space-y-3 rounded-lg border border-gray-200 p-3">
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Nguồn dữ liệu</label>
      <select
        value={sourceMode}
        onChange={(e) => onSourceModeChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
      >
        <option value="manual">Nhập thủ công</option>
        <option value="node">Lấy từ node trước đó</option>
      </select>
    </div>

    {sourceMode === 'manual' ? (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{manualLabel}</label>
        <textarea
          rows={4}
          value={manualValue}
          onChange={(e) => onManualValueChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          placeholder={manualPlaceholder}
        />
      </div>
    ) : (
      <>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Node dữ liệu</label>
          <select
            value={selectedNodeId}
            onChange={(e) => onNodeIdChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="">-- Chọn node --</option>
            {upstreamNodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.data?.label || node.data?.nodeType || node.type}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{fieldLabel}</label>
          <select
            value={selectedField}
            onChange={(e) => onFieldChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="">-- Chọn cột --</option>
            {nodeSchema.map((column) => (
              <option key={column.key} value={column.key}>
                {column.key}
              </option>
            ))}
          </select>
        </div>
      </>
    )}
  </div>
);

const buildDefaultZaloStep = () => ({
  id: `zalo-step-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
  delayValue: 0,
  delayUnit: 'minutes',
  delayFrom: 'start',
  templateId: '',
});

const ZaloSendModeSection = ({ formData, setFormData, sendModeKey = 'all' }) => (
  <div className="space-y-4">
    <h4 className="font-medium text-gray-900">Hình thức gửi</h4>

    <div className="flex flex-col gap-3">
      <label className="flex items-start gap-3 cursor-pointer p-3 border rounded-lg hover:bg-gray-50">
        <input
          type="radio"
          name={sendModeKey}
          value="all"
          checked={formData[sendModeKey] === 'all'}
          onChange={(e) => setFormData((prev) => ({ ...prev, [sendModeKey]: e.target.value }))}
          className="mt-1 text-primary-500 focus:ring-primary-500"
        />
        <div>
          <div className="text-sm font-medium text-gray-900">Gửi cùng lúc</div>
          <div className="text-xs text-gray-500 mt-1">Gửi tất cả tin nhắn ngay lập tức</div>
        </div>
      </label>
      <label className="flex items-start gap-3 cursor-pointer p-3 border rounded-lg hover:bg-gray-50">
        <input
          type="radio"
          name={sendModeKey}
          value="schedule"
          checked={formData[sendModeKey] === 'schedule'}
          onChange={(e) => setFormData((prev) => ({ ...prev, [sendModeKey]: e.target.value }))}
          className="mt-1 text-primary-500 focus:ring-primary-500"
        />
        <div>
          <div className="text-sm font-medium text-gray-900">Theo lịch</div>
          <div className="text-xs text-gray-500 mt-1">Gửi tin nhắn theo lịch trình đã cấu hình</div>
        </div>
      </label>
    </div>
  </div>
);

const ZaloTemplateListSection = ({
  formData,
  setFormData,
  templates = [],
  fetchTemplateById,
  sendModeKey,
  stepsKey,
  title,
  addLabel,
  upstreamNodes = [],
  getSchemaForNodeId,
  defaultSourceNodeId = '',
  normalizeTemplateVariables,
  onOpenTemplateAttachment,
}) => {
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const steps = Array.isArray(formData[stepsKey]) ? formData[stepsKey] : [];
  const sendMode = formData[sendModeKey] || 'all';
  const templateOptions = useMemo(
    () => templates.map((item) => ({
      id: item.id,
      label: String(item.templateName || `Template #${item.id}`),
      description: String(item.category || '').trim(),
    })),
    [templates]
  );

  useEffect(() => {
    if (!steps.length) return;
    const templateMap = new Map(
      templates.map((template) => [String(template?.id || '').trim(), template])
    );
    let hasChanged = false;
    const nextSteps = steps.map((step) => {
      const templateId = String(step?.templateId || '').trim();
      if (!templateId) return step;
      const selectedTemplate = templateMap.get(templateId);
      if (!selectedTemplate) return step;
      const nextMappings = buildTemplateStepMappings({
        template: selectedTemplate,
        currentMappings: step?.templateMappings || [],
        defaultNodeId: defaultSourceNodeId,
        normalizeTemplateVariables,
      });
      const currentMappings = Array.isArray(step?.templateMappings) ? step.templateMappings : [];
      const isSameMappings = currentMappings.length === nextMappings.length
        && currentMappings.every((mapping, index) =>
          String(mapping?.key || '').trim() === String(nextMappings[index]?.key || '').trim()
        );
      if (!nextMappings.length || isSameMappings) return step;
      hasChanged = true;
      return {
        ...step,
        templateMappings: nextMappings,
      };
    });
    if (!hasChanged) return;
    setFormData((prev) => ({
      ...prev,
      [stepsKey]: nextSteps,
    }));
  }, [defaultSourceNodeId, normalizeTemplateVariables, setFormData, steps, stepsKey, templates]);

  const handleStepChange = (index, field, value) => {
    setFormData((prev) => ({
      ...prev,
      [stepsKey]: (Array.isArray(prev[stepsKey]) ? prev[stepsKey] : []).map((step, idx) =>
        idx === index ? { ...step, [field]: value } : step
      ),
    }));
  };

  const handleAddStep = () => {
    setFormData((prev) => ({
      ...prev,
      [stepsKey]: [...(Array.isArray(prev[stepsKey]) ? prev[stepsKey] : []), buildDefaultZaloStep()],
    }));
  };

  const handleRemoveStep = (index) => {
    setFormData((prev) => ({
      ...prev,
      [stepsKey]: (Array.isArray(prev[stepsKey]) ? prev[stepsKey] : []).filter((_, idx) => idx !== index),
    }));
  };

  const handleTemplateSelect = async (index, value) => {
    const selectedTemplateId = parseInt(value, 10) || '';
    const selectedTemplateFromList = templates.find((template) => String(template.id) === String(selectedTemplateId)) || null;
    let selectedTemplate = selectedTemplateFromList;

    if (selectedTemplateId && typeof fetchTemplateById === 'function') {
      try {
        const detailedTemplate = await fetchTemplateById(selectedTemplateId);
        if (detailedTemplate) {
          selectedTemplate = detailedTemplate;
        }
      } catch {
        // Fallback to template list data when detail API fails.
      }
    }

    setFormData((prev) => {
      const currentSteps = Array.isArray(prev[stepsKey]) ? prev[stepsKey] : [];
      return {
        ...prev,
        [stepsKey]: currentSteps.map((step, idx) => {
          if (idx !== index) return step;
          return {
            ...step,
            templateId: selectedTemplateId,
            templateMappings: selectedTemplate
              ? buildTemplateStepMappings({
                  template: selectedTemplate,
                  currentMappings: step?.templateMappings || [],
                  defaultNodeId: defaultSourceNodeId,
                  normalizeTemplateVariables,
                })
              : [],
          };
        }),
      };
    });
  };

  const handleStepMappingChange = (stepIndex, mappingIndex, field, value) => {
    setFormData((prev) => {
      const currentSteps = Array.isArray(prev[stepsKey]) ? prev[stepsKey] : [];
      const nextSteps = currentSteps.map((step, idx) => {
        if (idx !== stepIndex) return step;
        const mappings = Array.isArray(step?.templateMappings) ? step.templateMappings : [];
        return {
          ...step,
          templateMappings: mappings.map((mapping, mapIndex) => {
            if (mapIndex !== mappingIndex) return mapping;
            const nextMapping = {
              ...mapping,
              [field]: value,
            };
            if (field === 'sourceType') {
              nextMapping.sourceType = normalizeMappingSourceType(value);
              if (nextMapping.sourceType === 'manual') {
                nextMapping.nodeId = '';
                nextMapping.field = '';
              } else {
                nextMapping.nodeId = String(nextMapping.nodeId || defaultSourceNodeId || '').trim();
              }
            }
            if (field === 'nodeId') {
              nextMapping.field = '';
            }
            return nextMapping;
          }),
        };
      });
      return {
        ...prev,
        [stepsKey]: nextSteps,
      };
    });
  };

  const handlePreviewTemplate = async (templateId) => {
    const id = parseInt(templateId, 10);
    if (!id) return;
    const selectedFromList = templates.find((item) => String(item.id) === String(id)) || null;
    if (selectedFromList?.bodyHtml || selectedFromList?.bodyText) {
      setPreviewTemplate(selectedFromList);
      setIsPreviewOpen(true);
      return;
    }
    if (typeof fetchTemplateById !== 'function') return;
    try {
      const detailed = await fetchTemplateById(id);
      if (!detailed) return;
      setPreviewTemplate(detailed);
      setIsPreviewOpen(true);
    } catch {
      // Keep silent like current node config UX.
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-gray-900">{title}</h4>
        <button
          type="button"
          onClick={handleAddStep}
          className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
        >
          <HiOutlinePlus className="w-4 h-4" />
          {addLabel}
        </button>
      </div>

      {steps.length === 0 && (
        <div className="text-center py-8 text-sm text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
          Chưa có template nào. Hãy thêm template.
        </div>
      )}

      <div className="space-y-3">
        {steps.map((step, idx) => (
          <div key={step.id || idx} className="border border-gray-200 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-800">Template #{idx + 1}</div>
              {steps.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveStep(idx)}
                  className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1"
                >
                  <HiOutlineTrash className="w-3.5 h-3.5" />
                  Xóa
                </button>
              )}
            </div>

            {sendMode === 'schedule' && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Sau bao lâu gửi</label>
                  <input
                    type="number"
                    min={0}
                    value={step.delayValue || 0}
                    onChange={(e) => handleStepChange(idx, 'delayValue', parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Đơn vị</label>
                  <select
                    value={step.delayUnit || 'minutes'}
                    onChange={(e) => handleStepChange(idx, 'delayUnit', e.target.value)}
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
                    onChange={(e) => handleStepChange(idx, 'delayFrom', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm"
                  >
                    <option value="start">Lúc chạy</option>
                    <option value="prev">Template trước</option>
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs text-gray-500 mb-1">Template Zalo</label>
              <TemplateSearchSelect
                value={step.templateId || ''}
                options={templateOptions}
                onChange={(nextValue) => handleTemplateSelect(idx, nextValue)}
                placeholder="-- Chọn template --"
                searchPlaceholder="Tìm template Zalo..."
                emptyText="Không tìm thấy template Zalo phù hợp"
                onPreview={() => handlePreviewTemplate(step.templateId)}
              />
            </div>

            {(step.templateMappings || []).length > 0 && (
              <div className="space-y-3">
                <div className="text-xs font-medium text-gray-700">Mapping biến template</div>
                {(step.templateMappings || []).map((mapping, mappingIndex) => {
                  const selectedNodeId = String(mapping?.nodeId || defaultSourceNodeId || '').trim();
                  const schema = selectedNodeId && typeof getSchemaForNodeId === 'function'
                    ? getSchemaForNodeId(selectedNodeId)
                    : [];
                  const mappingSourceType = normalizeMappingSourceType(mapping?.sourceType);
                  return (
                    <div key={`${mapping.key || mappingIndex}-${mappingIndex}`} className="bg-gray-50 rounded-lg p-3 space-y-3">
                      <div className="text-xs font-medium text-gray-800">{mapping.key}</div>
                      <div className="flex gap-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name={`${stepsKey}-${idx}-mapping-${mappingIndex}`}
                            value="manual"
                            checked={mappingSourceType === 'manual'}
                            onChange={(e) => handleStepMappingChange(idx, mappingIndex, 'sourceType', e.target.value)}
                            className="text-primary-500 focus:ring-primary-500"
                          />
                          <span className="text-xs text-gray-700">Thủ công</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name={`${stepsKey}-${idx}-mapping-${mappingIndex}`}
                            value="node"
                            checked={mappingSourceType === 'node'}
                            onChange={(e) => handleStepMappingChange(idx, mappingIndex, 'sourceType', e.target.value)}
                            className="text-primary-500 focus:ring-primary-500"
                          />
                          <span className="text-xs text-gray-700">Từ node</span>
                        </label>
                      </div>
                      {mappingSourceType === 'manual' ? (
                        <input
                          type="text"
                          value={mapping?.value || ''}
                          onChange={(e) => handleStepMappingChange(idx, mappingIndex, 'value', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm"
                          placeholder="Nhập giá trị thủ công"
                        />
                      ) : (
                        <div className="space-y-2">
                          <select
                            value={selectedNodeId}
                            onChange={(e) => handleStepMappingChange(idx, mappingIndex, 'nodeId', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm"
                          >
                            <option value="">-- Chọn node --</option>
                            {upstreamNodes.map((upstreamNode) => (
                              <option key={upstreamNode.id} value={upstreamNode.id}>
                                {upstreamNode.data?.label || upstreamNode.data?.nodeType || upstreamNode.type}
                              </option>
                            ))}
                          </select>
                          <select
                            value={mapping?.field || ''}
                            onChange={(e) => handleStepMappingChange(idx, mappingIndex, 'field', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm"
                          >
                            <option value="">-- Chọn cột --</option>
                            {schema.map((column) => (
                              <option key={column.key} value={column.key}>
                                {column.key}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="bg-blue-50 p-3 rounded-lg">
        <p className="text-xs text-blue-700">
          <strong>Lưu ý:</strong> Chọn template để dùng đúng nội dung đã quản lý trong mục template Zalo.
        </p>
      </div>

      <NodeConfigTemplatePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        template={previewTemplate}
        subjectLabel="Tiêu đề tin nhắn"
        onOpenAttachment={onOpenTemplateAttachment}
      />
    </div>
  );
};

/**
 * Section UI cho node gửi tin nhắn Zalo cá nhân.
 *
 * @param {Object} props section props
 * @returns {JSX.Element}
 */
export const NodeConfigSendZaloPersonalSection = ({
  formData,
  setFormData,
  selectedSection,
  setSelectedSection,
  upstreamNodes = [],
  phoneSourceSchema = [],
  zaloTemplates = [],
  fetchTemplateById,
  getSchemaForNodeId,
  normalizeTemplateVariables,
  onOpenTemplateAttachment,
}) => {
  const recipientType = String(formData.zaloRecipientType || 'phone').trim() === 'uid'
    ? 'uid'
    : 'phone';

  const sections = [
    { id: 'basic', name: 'Thông tin cơ bản', icon: HiOutlineMail },
    { id: 'sendMode', name: 'Hình thức gửi', icon: HiOutlineLightningBolt },
    { id: 'templates', name: 'Danh sách template gửi', icon: HiOutlineDocument },
  ];

  const renderSection = () => {
    if (selectedSection === 'sendMode') {
      return (
        <ZaloSendModeSection
          formData={formData}
          setFormData={setFormData}
          sendModeKey="zaloPersonalSendMode"
        />
      );
    }

    if (selectedSection === 'templates') {
      return (
        <ZaloTemplateListSection
          formData={formData}
          setFormData={setFormData}
          templates={zaloTemplates}
          sendModeKey="zaloPersonalSendMode"
          stepsKey="zaloPersonalTemplateSteps"
          title="Danh sách template gửi"
          addLabel="Thêm template"
          fetchTemplateById={fetchTemplateById}
          upstreamNodes={upstreamNodes}
          getSchemaForNodeId={getSchemaForNodeId}
          defaultSourceNodeId={formData.zaloRecipientNodeId || ''}
          normalizeTemplateVariables={normalizeTemplateVariables}
          onOpenTemplateAttachment={onOpenTemplateAttachment}
        />
      );
    }

    return (
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tên node</label>
          <input
            type="text"
            value={formData.label}
            onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            placeholder="Gửi tin nhắn Zalo cá nhân"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Loại người nhận</label>
          <select
            value={recipientType}
            onChange={(e) => setFormData((prev) => ({
              ...prev,
              zaloRecipientType: e.target.value,
              zaloRecipientField: '',
            }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="phone">Số điện thoại (mặc định)</option>
            <option value="uid">UID Zalo</option>
          </select>
        </div>

        <DataSourceSelector
          sourceMode={formData.zaloRecipientSource || 'manual'}
          onSourceModeChange={(value) => setFormData((prev) => ({ ...prev, zaloRecipientSource: value }))}
          manualValue={formData.zaloRecipientPhones || ''}
          onManualValueChange={(value) => setFormData((prev) => ({ ...prev, zaloRecipientPhones: value }))}
          manualLabel={recipientType === 'uid' ? 'Danh sách UID Zalo' : 'Danh sách số điện thoại'}
          manualPlaceholder={recipientType === 'uid' ? 'VD: 123456789012345678' : 'VD: 0912345678, 0987654321'}
          upstreamNodes={upstreamNodes}
          selectedNodeId={formData.zaloRecipientNodeId || ''}
          onNodeIdChange={(value) => setFormData((prev) => ({ ...prev, zaloRecipientNodeId: value }))}
          selectedField={formData.zaloRecipientField || ''}
          onFieldChange={(value) => setFormData((prev) => ({ ...prev, zaloRecipientField: value }))}
          fieldLabel={recipientType === 'uid' ? 'Cột UID' : 'Cột số điện thoại'}
          nodeSchema={phoneSourceSchema}
        />

        <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-700">
          Tài khoản gửi được lấy từ node <strong>Chọn tài khoản Zalo</strong> ở upstream.
        </div>
      </div>
    );
  };

  return (
    <div className="flex" style={{ minHeight: '500px' }}>
      <div className="w-64 border-r border-gray-200 flex flex-col">
        <div className="p-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700">Cài đặt</h3>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <div
                key={section.id}
                onClick={() => setSelectedSection(section.id)}
                className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedSection === section.id
                    ? 'bg-primary-50 border-l-4 border-primary-600'
                    : 'border-l-4 border-transparent'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${selectedSection === section.id ? 'text-primary-600' : 'text-gray-500'}`} />
                  <span className={`text-sm ${selectedSection === section.id ? 'font-medium text-primary-900' : 'text-gray-700'}`}>
                    {section.name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {renderSection()}
      </div>
    </div>
  );
};

/**
 * Section UI cho node gửi lời mời kết bạn Zalo theo số điện thoại.
 *
 * @param {Object} props section props
 * @returns {JSX.Element}
 */
export const NodeConfigSendZaloFriendRequestSection = ({
  formData,
  setFormData,
  upstreamNodes = [],
  phoneSourceSchema = [],
  getSchemaForNodeId,
  zaloTemplates = [],
  selectedTemplate = null,
  normalizeTemplateVariables,
}) => {
  const templateVariables = selectedTemplate
    ? normalizeTemplateVariables(selectedTemplate)
    : [];

  const handleTemplateChange = (value) => {
    const selectedId = String(value || '').trim();
    setFormData((prev) => {
      const template = zaloTemplates.find((item) => String(item.id) === selectedId) || null;
      const selectedTemplateVariables = template ? normalizeTemplateVariables(template) : [];
      const templateBody = String(template?.bodyText || template?.bodyHtml || '').trim();
      const existingMap = new Map((prev.zaloFriendTemplateMappings || []).map((m) => [m.key, m]));
      const mappings = selectedTemplateVariables.length
        ? selectedTemplateVariables.map((key) => {
            const existing = existingMap.get(key) || null;
            return {
              key,
              sourceType: existing?.sourceType === 'recipient_field'
                ? 'node'
                : (existing?.sourceType || 'manual'),
              nodeId: existing?.nodeId || prev.zaloFriendNodeId || '',
              field: existing?.field || '',
              value: existing?.value || '',
            };
          })
        : (prev.zaloFriendTemplateMappings || []);
      return {
        ...prev,
        zaloFriendTemplateId: selectedId,
        zaloFriendTemplateBody: templateBody || prev.zaloFriendTemplateBody || '',
        zaloFriendTemplateMappings: mappings,
      };
    });
  };

  return (
  <div className="space-y-4">
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Tên node</label>
      <input
        type="text"
        value={formData.label}
        onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        placeholder="Gửi lời mời kết bạn Zalo"
      />
    </div>

    <DataSourceSelector
      sourceMode={formData.zaloFriendSource || 'manual'}
      onSourceModeChange={(value) => setFormData((prev) => ({ ...prev, zaloFriendSource: value }))}
      manualValue={formData.zaloFriendPhones || ''}
      onManualValueChange={(value) => setFormData((prev) => ({ ...prev, zaloFriendPhones: value }))}
      manualLabel="Danh sách số điện thoại"
      manualPlaceholder="VD: 0912345678, 0987654321"
      upstreamNodes={upstreamNodes}
      selectedNodeId={formData.zaloFriendNodeId || ''}
      onNodeIdChange={(value) => setFormData((prev) => ({ ...prev, zaloFriendNodeId: value }))}
      selectedField={formData.zaloFriendField || ''}
      onFieldChange={(value) => setFormData((prev) => ({ ...prev, zaloFriendField: value }))}
      fieldLabel="Cột số điện thoại"
      nodeSchema={phoneSourceSchema}
    />

    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Nguồn nội dung lời mời <span className="text-red-500">*</span>
      </label>
      <select
        value={formData.zaloFriendContentMode || 'manual'}
        onChange={(e) => setFormData((prev) => ({ ...prev, zaloFriendContentMode: e.target.value }))}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
      >
        <option value="manual">Nhập lời mời thủ công</option>
        <option value="template">Chọn từ template Zalo</option>
      </select>
    </div>

    {(formData.zaloFriendContentMode || 'manual') === 'manual' ? (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Lời nhắn mời kết bạn <span className="text-red-500">*</span>
        </label>
        <textarea
          rows={3}
          value={formData.zaloFriendRequestMessage || ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, zaloFriendRequestMessage: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          placeholder="Xin chào, hãy kết bạn với tôi!"
        />
      </div>
    ) : (
      <div className="space-y-3 rounded-lg border border-gray-200 p-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Template Zalo <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.zaloFriendTemplateId || ''}
            onChange={(e) => handleTemplateChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="">-- Chọn template --</option>
            {zaloTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.templateName}
              </option>
            ))}
          </select>
        </div>

        {templateVariables.length > 0 && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Mapping biến template</label>
            {(formData.zaloFriendTemplateMappings || []).map((mapping, idx) => (
              <div key={`${mapping.key}-${idx}`} className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={mapping.key}
                  disabled
                  className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600"
                />
                <select
                  value={mapping.sourceType === 'recipient_field' ? 'node' : (mapping.sourceType || 'manual')}
                  onChange={(e) => setFormData((prev) => {
                    const next = [...(prev.zaloFriendTemplateMappings || [])];
                    next[idx] = {
                      ...next[idx],
                      sourceType: e.target.value,
                    };
                    return { ...prev, zaloFriendTemplateMappings: next };
                  })}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="manual">Giá trị thủ công</option>
                  <option value="node">Lấy từ node phía trước</option>
                </select>
                {(mapping.sourceType === 'recipient_field' ? 'node' : (mapping.sourceType || 'manual')) === 'node' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <select
                      value={mapping.nodeId || formData.zaloFriendNodeId || ''}
                      onChange={(e) => setFormData((prev) => {
                        const next = [...(prev.zaloFriendTemplateMappings || [])];
                        next[idx] = {
                          ...next[idx],
                          nodeId: e.target.value,
                          field: '',
                        };
                        return { ...prev, zaloFriendTemplateMappings: next };
                      })}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">-- Chọn node --</option>
                      {upstreamNodes.map((node) => (
                        <option key={node.id} value={node.id}>
                          {node.data?.label || node.data?.nodeType || node.type}
                        </option>
                      ))}
                    </select>
                    <select
                      value={mapping.field || ''}
                      onChange={(e) => setFormData((prev) => {
                        const next = [...(prev.zaloFriendTemplateMappings || [])];
                        next[idx] = {
                          ...next[idx],
                          field: e.target.value,
                        };
                        return { ...prev, zaloFriendTemplateMappings: next };
                      })}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">-- Chọn cột --</option>
                      {(mapping.nodeId
                        ? (typeof getSchemaForNodeId === 'function' ? getSchemaForNodeId(mapping.nodeId) : [])
                        : phoneSourceSchema
                      ).map((column) => (
                        <option key={column.key} value={column.key}>
                          {column.key}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={mapping.value || ''}
                    onChange={(e) => setFormData((prev) => {
                      const next = [...(prev.zaloFriendTemplateMappings || [])];
                      next[idx] = {
                        ...next[idx],
                        value: e.target.value,
                      };
                      return { ...prev, zaloFriendTemplateMappings: next };
                    })}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="Giá trị thủ công"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )}

    <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-700">
      Node sẽ tự tìm user theo số điện thoại rồi gửi lời mời kết bạn từ tài khoản đã chọn.
    </div>
  </div>
  );
};

/**
 * Section UI cho node gửi tin nhắn nhóm Zalo.
 *
 * @param {Object} props section props
 * @returns {JSX.Element}
 */
export const NodeConfigSendZaloGroupSection = ({
  formData,
  setFormData,
  selectedSection,
  setSelectedSection,
  upstreamNodes = [],
  groupSourceSchema = [],
  zaloTemplates = [],
  fetchTemplateById,
  getSchemaForNodeId,
  normalizeTemplateVariables,
  onOpenTemplateAttachment,
}) => {
  const selectedGroupCount = parseListText(formData.zaloGroupIds || '').length;

  const sections = [
    { id: 'basic', name: 'Thông tin cơ bản', icon: HiOutlineMail },
    { id: 'sendMode', name: 'Hình thức gửi', icon: HiOutlineLightningBolt },
    { id: 'templates', name: 'Danh sách template gửi', icon: HiOutlineDocument },
  ];

  const renderSection = () => {
    if (selectedSection === 'sendMode') {
      return (
        <ZaloSendModeSection
          formData={formData}
          setFormData={setFormData}
          sendModeKey="zaloGroupSendMode"
        />
      );
    }

    if (selectedSection === 'templates') {
      return (
        <ZaloTemplateListSection
          formData={formData}
          setFormData={setFormData}
          templates={zaloTemplates}
          sendModeKey="zaloGroupSendMode"
          stepsKey="zaloGroupTemplateSteps"
          title="Danh sách template gửi"
          addLabel="Thêm template"
          fetchTemplateById={fetchTemplateById}
          upstreamNodes={upstreamNodes}
          getSchemaForNodeId={getSchemaForNodeId}
          defaultSourceNodeId={formData.zaloGroupNodeId || ''}
          normalizeTemplateVariables={normalizeTemplateVariables}
          onOpenTemplateAttachment={onOpenTemplateAttachment}
        />
      );
    }

    return (
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tên node</label>
          <input
            type="text"
            value={formData.label}
            onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            placeholder="Gửi tin nhắn nhóm Zalo"
          />
        </div>

        <DataSourceSelector
          sourceMode={formData.zaloGroupSource || 'manual'}
          onSourceModeChange={(value) => setFormData((prev) => ({ ...prev, zaloGroupSource: value }))}
          manualValue={formData.zaloGroupIds || ''}
          onManualValueChange={(value) => setFormData((prev) => ({ ...prev, zaloGroupIds: value }))}
          manualLabel="Danh sách Group ID"
          manualPlaceholder="VD: 1234567890123456789"
          upstreamNodes={upstreamNodes}
          selectedNodeId={formData.zaloGroupNodeId || ''}
          onNodeIdChange={(value) => setFormData((prev) => ({ ...prev, zaloGroupNodeId: value }))}
          selectedField={formData.zaloGroupField || ''}
          onFieldChange={(value) => setFormData((prev) => ({ ...prev, zaloGroupField: value }))}
          fieldLabel="Cột Group ID"
          nodeSchema={groupSourceSchema}
        />

        <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-700">
          {selectedGroupCount > 0
            ? `Đang có ${selectedGroupCount} nhóm trong danh sách gửi.`
            : 'Bạn có thể lấy Group ID từ node trước hoặc nhập thủ công (mỗi dòng 1 id).'}
        </div>
      </div>
    );
  };

  return (
    <div className="flex" style={{ minHeight: '500px' }}>
      <div className="w-64 border-r border-gray-200 flex flex-col">
        <div className="p-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700">Cài đặt</h3>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <div
                key={section.id}
                onClick={() => setSelectedSection(section.id)}
                className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedSection === section.id
                    ? 'bg-primary-50 border-l-4 border-primary-600'
                    : 'border-l-4 border-transparent'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${selectedSection === section.id ? 'text-primary-600' : 'text-gray-500'}`} />
                  <span className={`text-sm ${selectedSection === section.id ? 'font-medium text-primary-900' : 'text-gray-700'}`}>
                    {section.name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {renderSection()}
      </div>
    </div>
  );
};
