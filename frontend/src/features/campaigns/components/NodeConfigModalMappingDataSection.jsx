import { HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi';
import { useI18n } from '../../../i18n';

/**
 * Section UI for mapping-data node configuration.
 *
 * @param {Object} props section props
 * @param {Object} props.formData current node form data
 * @param {Function} props.setFormData React setter for form data
 * @param {Array} props.emailTemplates available email templates
 * @param {Object|null} props.mappingTemplate selected mapping template detail
 * @param {Function} props.handleMappingTemplateSelect callback to select mapping template
 * @returns {JSX.Element}
 */
export const NodeConfigMappingDataSection = ({
  formData,
  setFormData,
  emailTemplates,
  zaloTemplates = [],
  mappingTemplate,
  handleMappingTemplateSelect,
}) => {
  const { t } = useI18n();
  const handleAddMapping = () => {
    setFormData((prev) => ({
      ...prev,
      mappings: [...prev.mappings, { variableName: '', sourceType: 'column', columnName: '', formula: '' }],
    }));
  };

  const handleRemoveMapping = (index) => {
    setFormData((prev) => ({
      ...prev,
      mappings: prev.mappings.filter((_, i) => i !== index),
    }));
  };

  const handleMappingFieldChange = (index, field, value) => {
    setFormData((prev) => ({
      ...prev,
      mappings: prev.mappings.map((m, i) => (i === index ? { ...m, [field]: value } : m)),
    }));
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('campaignNodeConfig.mappingData.nodeName')}</label>
        <input
          type="text"
          value={formData.label}
          onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          placeholder={t('campaignNodeConfig.mappingData.nodeNamePlaceholder')}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t('campaignNodeConfig.mappingData.templateToApply')} <span className="text-red-500">*</span>
        </label>
        <select
          value={formData.mappingTemplateId || ''}
          onChange={(e) => handleMappingTemplateSelect(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        >
          <option value="">{t('campaignNodeConfig.mappingData.selectTemplate')}</option>
          {emailTemplates.length > 0 && (
            <optgroup label="📧 Email">
              {emailTemplates.map((tpl) => (
                <option key={`email-${tpl.id}`} value={tpl.id}>
                  {tpl.templateName} ({tpl.category})
                </option>
              ))}
            </optgroup>
          )}
          {zaloTemplates.length > 0 && (
            <optgroup label="💬 Zalo">
              {zaloTemplates.map((tpl) => (
                <option key={`zalo-${tpl.id}`} value={tpl.id}>
                  {tpl.templateName}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {mappingTemplate && (
          <p className="text-xs text-gray-500 mt-1">
            {t('campaignNodeConfig.mappingData.templateLoaded', { name: mappingTemplate.templateName })}
          </p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">{t('campaignNodeConfig.mappingData.variableDefinitions')}</label>
          <button
            type="button"
            onClick={handleAddMapping}
            className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
          >
            <HiOutlinePlus className="w-4 h-4" />
            {t('campaignNodeConfig.mappingData.addVariable')}
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          {t('campaignNodeConfig.mappingData.mappingHint')}
        </p>

        <div className="space-y-3">
          {formData.mappings.map((mapping, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">{t('campaignNodeConfig.mappingData.variableName')}</label>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-400 text-sm">{'{{'}</span>
                    <input
                      type="text"
                      value={mapping.variableName}
                      onChange={(e) => handleMappingFieldChange(index, 'variableName', e.target.value)}
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-primary-500"
                      placeholder={t('campaignNodeConfig.mappingData.variableNamePlaceholder')}
                    />
                    <span className="text-gray-400 text-sm">{'}}'}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveMapping(index)}
                  className="p-1 text-gray-400 hover:text-red-500 mt-5"
                  disabled={formData.mappings.length === 1}
                >
                  <HiOutlineTrash className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-2">
                <label className="block text-xs text-gray-500 mb-1">{t('campaignNodeConfig.mappingData.dataSource')}</label>
                <select
                  value={mapping.sourceType}
                  onChange={(e) => handleMappingFieldChange(index, 'sourceType', e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-primary-500"
                >
                  <option value="column">{t('campaignNodeConfig.mappingData.fromSheetColumn')}</option>
                  <option value="formula">{t('campaignNodeConfig.mappingData.formulaFunction')}</option>
                  <option value="static">{t('campaignNodeConfig.mappingData.fixedValue')}</option>
                </select>
              </div>

              {mapping.sourceType === 'column' && (
                <div className="mt-2">
                  <label className="block text-xs text-gray-500 mb-1">{t('campaignNodeConfig.mappingData.columnName')}</label>
                  <input
                    type="text"
                    value={mapping.columnName}
                    onChange={(e) => handleMappingFieldChange(index, 'columnName', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-primary-500"
                    placeholder={t('campaignNodeConfig.mappingData.columnPlaceholder')}
                  />
                  <p className="text-xs text-gray-400 mt-1">{t('campaignNodeConfig.mappingData.columnHint')}</p>
                </div>
              )}

              {mapping.sourceType === 'formula' && (
                <div className="mt-2">
                  <label className="block text-xs text-gray-500 mb-1">{t('campaignNodeConfig.mappingData.formulaFunction')}</label>
                  <input
                    type="text"
                    value={mapping.formula}
                    onChange={(e) => handleMappingFieldChange(index, 'formula', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono focus:ring-2 focus:ring-primary-500"
                    placeholder={t('campaignNodeConfig.mappingData.formulaPlaceholder')}
                  />
                  <p className="text-xs text-gray-400 mt-1">{t('campaignNodeConfig.mappingData.formulaHint')}</p>
                </div>
              )}

              {mapping.sourceType === 'static' && (
                <div className="mt-2">
                  <label className="block text-xs text-gray-500 mb-1">{t('campaignNodeConfig.mappingData.fixedValue')}</label>
                  <input
                    type="text"
                    value={mapping.formula}
                    onChange={(e) => handleMappingFieldChange(index, 'formula', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-primary-500"
                    placeholder={t('campaignNodeConfig.mappingData.fixedValuePlaceholder')}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-amber-50 p-3 rounded-lg">
        <p className="text-sm text-amber-700">
          <strong>{t('campaignNodeConfig.mappingData.example')}</strong>
        </p>
        <ul className="text-xs text-amber-600 mt-1 space-y-1 list-disc list-inside">
          <li><code className="bg-amber-100 px-1 rounded">ten_khach</code> → {t('campaignNodeConfig.mappingData.exampleMapping', { var: 'ten_khach', column: 'Tên khách hàng' })}</li>
          <li><code className="bg-amber-100 px-1 rounded">ho_ten_day_du</code> → {t('campaignNodeConfig.mappingData.exampleFunction')}</li>
          <li><code className="bg-amber-100 px-1 rounded">ngay_gui</code> → {t('campaignNodeConfig.mappingData.exampleNow')}</li>
        </ul>
      </div>
    </div>
  );
};
