/**
 * P7 (PLAN_TG_WA_DAY_DU) — soạn NHIỀU BƯỚC (tối đa 5) cho node send_telegram / send_whatsapp.
 *
 * Mỗi bước: mẫu tin + tệp đính kèm (P5) + nội dung; bước 2 trở đi có "gửi sau ... phút/giờ/ngày kể từ bước
 * trước" (`delayValue`, `delayUnit` — cùng hình dạng node Zalo, backend `channelSteps.util.js`). Bước 1 không trễ.
 * Một bước duy nhất thì giao diện Y HỆT trước P7 (không tiêu đề bước) — chỉ thêm nút "Thêm bước".
 *
 * @param {Object} props
 * @param {'telegram'|'whatsapp'} props.channel
 * @param {Array<object>} props.steps `formData.steps`
 * @param {Function} props.setFormData
 * @param {Array<object>} [props.templates]
 * @param {Function} [props.fetchTemplateById]
 * @param {number} props.messageMax
 * @param {string} props.i18nPrefix 'telegramNodeSend' | 'whatsappNodeSend' (messageRequired/messagePlaceholder/variableHint)
 * @param {Array<string>} [props.columnVariableKeys] tên cột khối dữ liệu -> nút chèn {{cột}} (WhatsApp)
 * @returns {JSX.Element}
 */
import { useI18n } from '../../../i18n';
import { applyTemplateToStep, clearTemplateFromStep } from '../utils/channelAttachments';
import { MAX_CHANNEL_STEPS, createEmptyChannelStep } from '../utils/channelSteps';
import ChannelTemplateAttachmentPicker from './ChannelTemplateAttachmentPicker';

const ChannelStepsEditor = ({
  channel,
  steps,
  setFormData,
  templates = [],
  fetchTemplateById,
  messageMax,
  i18nPrefix,
  columnVariableKeys = [],
}) => {
  const { t } = useI18n();
  const list = Array.isArray(steps) && steps.length ? steps : [createEmptyChannelStep(0)];
  const isMulti = list.length > 1;

  const updateStep = (index, updater) => {
    setFormData((prev) => {
      const current = Array.isArray(prev.steps) && prev.steps.length ? prev.steps : [createEmptyChannelStep(0)];
      return {
        ...prev,
        steps: current.map((step, i) => (i === index ? updater(step || {}) : step)),
      };
    });
  };

  const handleMessageChange = (index, value) => updateStep(index, (step) => ({ ...step, message: value }));

  const handleApplyTemplate = (index, template) => updateStep(index, (step) => (
    template ? applyTemplateToStep(step, template) : clearTemplateFromStep(step)
  ));

  const handleRemoveAttachment = (index, attachmentIndex) => updateStep(index, (step) => ({
    ...step,
    attachments: (Array.isArray(step.attachments) ? step.attachments : []).filter((_, i) => i !== attachmentIndex),
  }));

  const handleInsertColumnVariable = (index, key) => {
    setFormData((prev) => {
      const current = Array.isArray(prev.steps) && prev.steps.length ? prev.steps : [createEmptyChannelStep(0)];
      const message = current[index]?.message || '';
      const next = `${message}${message && !/\s$/.test(message) ? ' ' : ''}{{${key}}}`;
      if (next.length > messageMax) return prev;
      return { ...prev, steps: current.map((step, i) => (i === index ? { ...step, message: next } : step)) };
    });
  };

  const handleDelayChange = (index, field, value) => updateStep(index, (step) => ({
    ...step,
    [field]: field === 'delayValue' ? Math.max(0, Number.parseInt(value, 10) || 0) : value,
  }));

  const handleAddStep = () => {
    setFormData((prev) => {
      const current = Array.isArray(prev.steps) && prev.steps.length ? prev.steps : [createEmptyChannelStep(0)];
      if (current.length >= MAX_CHANNEL_STEPS) return prev;
      return { ...prev, steps: [...current, createEmptyChannelStep(current.length)] };
    });
  };

  const handleRemoveStep = (index) => {
    setFormData((prev) => {
      const current = Array.isArray(prev.steps) ? prev.steps : [];
      if (current.length <= 1) return prev;
      return { ...prev, steps: current.filter((_, i) => i !== index) };
    });
  };

  return (
    <div className="space-y-4" data-testid="channel-steps-editor">
      {list.map((step, index) => {
        const messageValue = step?.message || '';
        return (
          <div
            key={index}
            data-testid={`channel-step-${index + 1}`}
            className={isMulti ? 'space-y-3 border border-gray-200 rounded-lg p-3' : 'space-y-4'}
          >
            {isMulti && (
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-800">{t('channelSteps.stepTitle', { n: index + 1 })}</p>
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveStep(index)}
                    className="text-xs font-medium text-red-600 hover:text-red-700"
                  >
                    {t('channelSteps.removeStep')}
                  </button>
                )}
              </div>
            )}

            {index > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700" data-testid={`channel-step-delay-${index + 1}`}>
                <span>{t('channelSteps.sendAfter')}</span>
                <input
                  type="number"
                  min={0}
                  aria-label={t('channelSteps.delayValueLabel', { n: index + 1 })}
                  value={step?.delayValue ?? 0}
                  onChange={(e) => handleDelayChange(index, 'delayValue', e.target.value)}
                  className="w-20 px-2 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
                <select
                  aria-label={t('channelSteps.delayUnitLabel', { n: index + 1 })}
                  value={step?.delayUnit || 'minutes'}
                  onChange={(e) => handleDelayChange(index, 'delayUnit', e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="minutes">{t('channelSteps.unitMinutes')}</option>
                  <option value="hours">{t('channelSteps.unitHours')}</option>
                  <option value="days">{t('channelSteps.unitDays')}</option>
                </select>
                <span>{t('channelSteps.sinceStep', { n: index })}</span>
              </div>
            )}

            <ChannelTemplateAttachmentPicker
              channel={channel}
              templates={templates}
              fetchTemplateById={fetchTemplateById}
              templateId={step?.templateId || ''}
              attachments={Array.isArray(step?.attachments) ? step.attachments : []}
              onApply={(template) => handleApplyTemplate(index, template)}
              onRemoveAttachment={(attachmentIndex) => handleRemoveAttachment(index, attachmentIndex)}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t(`${i18nPrefix}.messageRequired`)} <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={6}
                value={messageValue}
                onChange={(e) => handleMessageChange(index, e.target.value)}
                maxLength={messageMax}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder={t(`${i18nPrefix}.messagePlaceholder`)}
              />
              <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                <span>{t(`${i18nPrefix}.variableHint`)}</span>
                <span>{messageValue.length}/{messageMax}</span>
              </div>
              {columnVariableKeys.length > 0 && (
                <div className="mt-2" data-testid={index === 0 ? 'whatsapp-column-variables' : `whatsapp-column-variables-${index + 1}`}>
                  <p className="text-xs text-gray-500 mb-1">{t('whatsappNodeSend.columnVariablesHint')}</p>
                  <div className="flex flex-wrap gap-1">
                    {columnVariableKeys.map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleInsertColumnVariable(index, key)}
                        className="px-2 py-0.5 text-xs font-mono bg-gray-100 border border-gray-200 rounded hover:bg-gray-200"
                      >
                        {`{{${key}}}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div>
        <button
          type="button"
          onClick={handleAddStep}
          disabled={list.length >= MAX_CHANNEL_STEPS}
          data-testid="channel-step-add"
          className="px-3 py-1.5 text-sm font-semibold bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-60"
        >
          {t('channelSteps.addStep')}
        </button>
        <p className="mt-1 text-xs text-gray-500">
          {list.length >= MAX_CHANNEL_STEPS
            ? t('channelSteps.maxReached', { max: MAX_CHANNEL_STEPS })
            : t('channelSteps.addHint', { max: MAX_CHANNEL_STEPS })}
        </p>
      </div>
    </div>
  );
};

export default ChannelStepsEditor;
