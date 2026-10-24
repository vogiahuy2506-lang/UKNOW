import { useEffect, useMemo, useState } from 'react';
import {
  HiOutlineDocument,
  HiOutlineLink,
  HiOutlineTable,
} from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import { NodeConfigDataColumnPicker } from './NodeConfigDataColumnPicker';

/**
 * Section UI for read-sheet node configuration.
 *
 * @param {Object} props section props
 * @param {Object} props.formData current node form data
 * @param {Function} props.setFormData React setter for form data
 * @param {string} props.selectedReadSheetSection active section id
 * @param {Function} props.setSelectedReadSheetSection section state setter
 * @param {Function} props.handleCheckSheetConnection sheet connection callback
 * @param {boolean} props.isCheckingSheet loading flag for check connection action
 * @returns {JSX.Element}
 */
export const NodeConfigReadSheetSection = ({
  formData,
  setFormData,
  selectedReadSheetSection,
  setSelectedReadSheetSection,
  handleCheckSheetConnection,
  isCheckingSheet,
}) => {
  const t = useI18n('readSheetSection');
  const [lastAutoCheckConnectionKey, setLastAutoCheckConnectionKey] = useState('');
  const connectionSignature = useMemo(
    () => [
      formData.sheetUrl || '',
      formData.sheetName || '',
      formData.headerRow || 1,
      formData.dataStartRow || 2,
    ].join('|'),
    [formData.dataStartRow, formData.headerRow, formData.sheetName, formData.sheetUrl]
  );

  useEffect(() => {
    if (selectedReadSheetSection !== 'connection') return;
    if (isCheckingSheet) return;
    if (!String(formData.sheetUrl || '').trim()) return;
    if (Array.isArray(formData.columns) && formData.columns.length > 0) return;
    if (lastAutoCheckConnectionKey === connectionSignature) return;

    setLastAutoCheckConnectionKey(connectionSignature);
    handleCheckSheetConnection();
  }, [
    connectionSignature,
    formData.columns,
    formData.sheetUrl,
    handleCheckSheetConnection,
    isCheckingSheet,
    lastAutoCheckConnectionKey,
    selectedReadSheetSection,
  ]);

  const readSheetSections = [
    { id: 'basic', name: t('basicInfo'), icon: HiOutlineDocument },
    { id: 'config', name: t('sheetConfig'), icon: HiOutlineTable },
    {
      id: 'connection',
      name: t('connection'),
      icon: HiOutlineLink,
      badge: Array.isArray(formData.columns) && formData.columns.length > 0,
    },
  ];

  const renderReadSheetSection = () => {
    switch (selectedReadSheetSection) {
      case 'basic':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-dk-text">{t('nodeName')}</label>
              <input
                type="text"
                value={formData.label}
                onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:border-dk-border-strong dark:bg-dk-inset dark:text-dk-text dark:placeholder-dk-muted"
                placeholder={t('readSheetPlaceholder')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-dk-text">
                {t('sheetUrl')} <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                data-section-focus
                value={formData.sheetUrl}
                onChange={(e) => setFormData((prev) => ({ ...prev, sheetUrl: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:border-dk-border-strong dark:bg-dk-inset dark:text-dk-text dark:placeholder-dk-muted"
                placeholder={t('sheetUrlPlaceholder')}
              />
              <p className="text-xs text-gray-500 mt-1 dark:text-dk-text2">{t('sharePermission')}</p>
            </div>
            <div className="bg-blue-50 p-3 rounded-lg dark:bg-blue-950/40">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                <strong>{t('campaignNodeConfig.trigger.note')}:</strong> {t('readSheetNote')}
              </p>
            </div>
          </div>
        );

      case 'config':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-dk-text">{t('sheetName')}</label>
                <input
                  type="text"
                  value={formData.sheetName}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, sheetName: e.target.value, sheetNameSource: undefined }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:border-dk-border-strong dark:bg-dk-inset dark:text-dk-text dark:placeholder-dk-muted"
                  placeholder={t('sheetNamePlaceholder')}
                />
                {formData.sheetNameSource === 'auto' && (
                  <p className="text-xs text-primary-600 mt-1 dark:text-primary-400">{t('sheetNameAutoFilled')}</p>
                )}
                <p className="text-xs text-gray-500 mt-1 dark:text-dk-text2">{t('sheetNameHint')}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-dk-text">{t('headerRow')}</label>
                <input
                  type="number"
                  min={1}
                  value={formData.headerRow}
                  onChange={(e) => setFormData((prev) => ({ ...prev, headerRow: parseInt(e.target.value, 10) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:border-dk-border-strong dark:bg-dk-inset dark:text-dk-text dark:placeholder-dk-muted"
                />
                <p className="text-xs text-gray-500 mt-1 dark:text-dk-text2">{t('headerRowHint')}</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-dk-text">{t('dataStartRow')}</label>
              <input
                type="number"
                min={1}
                value={formData.dataStartRow}
                onChange={(e) => setFormData((prev) => ({ ...prev, dataStartRow: parseInt(e.target.value, 10) }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:border-dk-border-strong dark:bg-dk-inset dark:text-dk-text dark:placeholder-dk-muted"
              />
              <p className="text-xs text-gray-500 mt-1 dark:text-dk-text2">{t('dataStartRowHint')}</p>
            </div>
            <div className="bg-amber-50 p-3 rounded-lg dark:bg-amber-950/40">
              <p className="text-sm text-amber-700 dark:text-amber-300">
                <strong>{t('tip') || 'Tip'}:</strong> {t('tipHeaderRow')}
              </p>
            </div>
          </div>
        );

      case 'connection':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCheckSheetConnection}
                disabled={isCheckingSheet}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isCheckingSheet
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed dark:bg-dk-strong dark:text-dk-text2'
                    : 'bg-primary-600 text-white hover:bg-primary-700'
                }`}
              >
                {isCheckingSheet ? t('checkingConnection') : t('checkConnection')}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-dk-text2">{t('checkConnectionHint')}</p>

            {Array.isArray(formData.columns) && formData.columns.length > 0 ? (
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 dark:bg-dk-raised dark:border-dk-border">
                <div className="flex items-center gap-2 mb-3">
                  <HiOutlineTable className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <span className="text-sm font-medium text-gray-700 dark:text-dk-text">{t('columnList', { count: formData.columns.length })}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.columns.map((col, idx) => (
                    <span
                      key={`${col}-${idx}`}
                      className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm bg-white border border-gray-200 text-gray-700 font-medium dark:bg-dk-surface dark:border-dk-border dark:text-dk-text"
                    >
                      {col}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center dark:border-dk-border">
                <HiOutlineTable className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-dk-text2">{t('noColumnsLoaded')}</p>
                <p className="text-xs text-gray-400 mt-1">{t('pressToLoadColumns')}</p>
              </div>
            )}

            <NodeConfigDataColumnPicker
              title={t('onlySelectedColumns')}
              options={(Array.isArray(formData.columns) ? formData.columns : []).map((c) => ({
                key: String(c || '').trim(),
                label: String(c || '').trim(),
              })).filter((o) => o.key)}
              selectedKeys={Array.isArray(formData.dataSelectedColumns) ? formData.dataSelectedColumns : []}
              setFormData={setFormData}
              formField="dataSelectedColumns"
              hint={t('columnHint')}
            />

            <div className="bg-green-50 p-3 rounded-lg dark:bg-green-950/40">
              <p className="text-sm text-green-700 dark:text-green-300">
                <strong>{t('common.success')}:</strong> {t('connectionSuccess')}
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex" style={{ minHeight: '500px' }}>
      <div className="w-64 border-r border-gray-200 flex flex-col dark:border-dk-border">
        <div className="p-3 border-b border-gray-200 dark:border-dk-border">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-dk-text">{t('settings')}</h3>
        </div>
        <div className="flex-1 overflow-y-auto">
          {readSheetSections.map((section) => {
            const Icon = section.icon;
            return (
              <div
                key={section.id}
                onClick={() => setSelectedReadSheetSection(section.id)}
                className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedReadSheetSection === section.id
                    ? 'bg-primary-50 border-l-4 border-primary-600 dark:bg-primary-950/40'
                    : 'border-l-4 border-transparent'
                } dark:hover:bg-dk-raised`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${selectedReadSheetSection === section.id ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-dk-text2'}`} />
                    <span className={`text-sm ${selectedReadSheetSection === section.id ? 'font-medium text-primary-900 dark:text-primary-300' : 'text-gray-700 dark:text-dk-text'}`}>
                      {section.name}
                    </span>
                  </div>
                  {section.badge && <span className="w-2 h-2 rounded-full bg-primary-600"></span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">{renderReadSheetSection()}</div>
    </div>
  );
};
