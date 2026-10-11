import { useI18n } from '../../../i18n';

/**
 * Section UI for manual trigger node configuration.
 *
 * @param {Object} props section props
 * @param {Object} props.formData current node form data
 * @param {Function} props.setFormData React setter for form data
 * @returns {JSX.Element}
 */
export const NodeConfigManualTriggerSection = ({ formData, setFormData }) => {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dk-text mb-1">{t('campaignNodeConfig.trigger.nodeName')}</label>
        <input
          type="text"
          value={formData.label}
          onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 dark:border-dk-border bg-white dark:bg-dk-raised text-gray-900 dark:text-dk-text rounded-lg focus:ring-2 focus:ring-primary-500"
          placeholder={t('campaignNodeConfig.trigger.nodeNamePlaceholder')}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dk-text mb-1">{t('campaignNodeConfig.trigger.description')}</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 dark:border-dk-border bg-white dark:bg-dk-raised text-gray-900 dark:text-dk-text rounded-lg focus:ring-2 focus:ring-primary-500"
          rows={3}
          placeholder={t('campaignNodeConfig.trigger.descriptionPlaceholder')}
        />
      </div>
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-transparent dark:border-blue-900/40 p-3 rounded-lg">
        <p className="text-sm text-blue-700 dark:text-blue-300">
          <strong>{t('campaignNodeConfig.trigger.note')}:</strong> {t('campaignNodeConfig.trigger.noteTriggerLaunch')}
        </p>
      </div>
    </div>
  );
};
