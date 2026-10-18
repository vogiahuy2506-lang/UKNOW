import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi';
import useAsyncResource from '../simple/useAsyncResource';
import { CustomPanel, TemplatePanelView } from '../simple/ContentStep';
import { loadTemplates } from '../simple/loadTemplates';
import { FOLLOW_UP_DELAY_UNITS } from '../simple/simpleCampaign.helpers';
import {
  CUSTOM_BODY_MAX,
  CUSTOM_SUBJECT_MAX,
  createBlankContentStep,
  isContentValueChanged,
  validateContentValue,
} from './sections';

const INPUT_CLASS =
  'rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 hover:bg-white focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 dark:border-dk-border dark:bg-dk-inset dark:text-dk-text dark:placeholder:text-dk-muted dark:hover:bg-dk-surface dark:focus:bg-dk-inset';

let stepKeySeq = 0;
const withKey = (step) => {
  stepKeySeq += 1;
  return { ...step, key: `content-step-${stepKeySeq}` };
};

const stripKey = ({ key, ...step }) => step; // eslint-disable-line no-unused-vars

/**
 * Biểu mẫu mục "Nội dung" của MỘT khối gửi: danh sách tin (tối đa theo kênh), mỗi tin chọn mẫu có sẵn (ô chọn mẫu của trình từng bước) hoặc
 * tự soạn, tin sau có khoảng chờ (số + ngày / giờ / phút). Lưu / Huỷ. Không biết gì về sơ đồ — trả lại giá trị, `writeContent` lo phần ghi.
 *
 * @param {object} props
 * @param {object} props.value `readContent().items[].value`
 * @param {(value: object) => Promise<void>|void} props.onSave
 * @param {() => void} props.onCancel
 * @param {(dirty: boolean) => void} props.onDirtyChange
 * @param {boolean} [props.busy]
 */
export default function ContentSectionForm({ value, onSave, onCancel, onDirtyChange, busy = false, t }) {
  const { channel, kind, maxSteps } = value;
  const initial = useRef(value).current;
  const [steps, setSteps] = useState(() => value.steps.map(withKey));
  const templates = useAsyncResource(() => loadTemplates(kind), [kind]);

  const current = useMemo(() => ({ ...value, steps: steps.map(stripKey) }), [steps, value]);
  const dirty = useMemo(() => isContentValueChanged(current, initial), [current, initial]);
  const validity = useMemo(() => validateContentValue(current), [current]);
  const canAdd = steps.length < maxSteps;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const patchStep = useCallback((key, patch) => {
    setSteps((list) => list.map((step) => (step.key === key ? { ...step, ...patch } : step)));
  }, []);
  const patchContent = useCallback((key, patch) => {
    setSteps((list) => list.map((step) => (step.key === key ? { ...step, content: { ...step.content, ...patch } } : step)));
  }, []);
  const addStep = () => setSteps((list) => (list.length >= maxSteps ? list : [...list, withKey(createBlankContentStep(channel))]));
  const removeStep = (key) => setSteps((list) => list.filter((step) => step.key !== key));

  const canSave = dirty && validity.ok && !busy;
  const bodyMax = CUSTOM_BODY_MAX[channel];

  return (
    <div data-testid="settings-content-form" className="min-w-0 space-y-4">
      {steps.map((step, index) => {
        const idPrefix = `settings-content-${value.nodeId}-${step.key}`;
        const problem = validity.steps[index];
        const mode = step.content.mode;
        return (
          <section
            key={step.key}
            className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 dark:border-dk-border dark:bg-dk-surface sm:p-4"
            data-testid={`settings-content-step-${index}`}
          >
            <div className="flex items-start justify-between gap-3">
              <h4 className="text-sm font-bold text-slate-900 dark:text-dk-text">{t('simpleCampaign.content.followUp.title', { n: index + 1 })}</h4>
              {index > 0 && (
                <button
                  type="button"
                  onClick={() => removeStep(step.key)}
                  disabled={busy}
                  aria-label={t('simpleCampaign.content.followUp.removeAria', { n: index + 1 })}
                  data-testid={`settings-content-remove-${index}`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  <HiOutlineTrash className="h-4 w-4" aria-hidden="true" />
                  {t('simpleCampaign.content.followUp.remove')}
                </button>
              )}
            </div>

            {index > 0 && (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <label htmlFor={`${idPrefix}-delay`} className="text-sm font-semibold text-slate-800 dark:text-dk-text">{t('simpleCampaign.content.followUp.sendAfter')}</label>
                <div className="flex items-center gap-2">
                  <input
                    id={`${idPrefix}-delay`}
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    value={step.delayValue}
                    onChange={(event) => patchStep(step.key, { delayValue: event.target.value })}
                    aria-invalid={Boolean(problem.delay)}
                    data-testid={`settings-content-delay-${index}`}
                    className={`w-24 ${INPUT_CLASS}`}
                  />
                  <select
                    value={step.delayUnit}
                    onChange={(event) => patchStep(step.key, { delayUnit: event.target.value })}
                    aria-label={t('simpleCampaign.content.followUp.unitAria')}
                    data-testid={`settings-content-unit-${index}`}
                    className={`w-28 ${INPUT_CLASS}`}
                  >
                    {FOLLOW_UP_DELAY_UNITS.map((unit) => (
                      <option key={unit} value={unit}>{t(`simpleCampaign.content.followUp.unit.${unit}`)}</option>
                    ))}
                  </select>
                </div>
                <span className="text-sm text-slate-600 dark:text-dk-text2" data-testid={`settings-content-from-${index}`}>
                  {step.delayFrom === 'prev' ? t('simpleCampaign.content.followUp.afterPrev') : t('campaignSettings.content.form.afterFirst')}
                </span>
              </div>
            )}
            {problem.delay && (
              <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400" data-testid={`settings-content-delay-error-${index}`}>
                {problem.delay === 'tooLong' ? t('campaignSettings.content.form.delayTooLong') : t('simpleCampaign.content.followUp.delayInvalid')}
              </p>
            )}

            <div className="mt-3 inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-dk-border" role="group" aria-label={t('campaignSettings.content.form.modeAria', { n: index + 1 })}>
              {[['template', 'simpleCampaign.content.template.title'], ['custom', 'simpleCampaign.content.custom.title']].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={mode === id}
                  onClick={() => patchContent(step.key, { mode: id })}
                  data-testid={`settings-content-mode-${index}-${id}`}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === id ? 'bg-primary-500 text-white' : 'text-slate-700 hover:bg-slate-100 dark:text-dk-text dark:hover:bg-dk-raised'}`}
                >
                  {t(label)}
                </button>
              ))}
            </div>

            <div className="mt-3 min-w-0 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-dk-border dark:bg-dk-bg/40" data-testid={`${idPrefix}-panel`}>
              {mode === 'custom' ? (
                <CustomPanel
                  isEmail={channel === 'email'}
                  channel={channel}
                  content={step.content}
                  patchContent={(patch) => patchContent(step.key, patch)}
                  t={t}
                  idPrefix={idPrefix}
                  bodyMax={bodyMax}
                  subjectMax={CUSTOM_SUBJECT_MAX}
                />
              ) : (
                <TemplatePanelView
                  resource={templates}
                  kind={kind}
                  channel={channel}
                  content={step.content}
                  patchContent={(patch) => patchContent(step.key, patch)}
                  t={t}
                  idPrefix={idPrefix}
                />
              )}
            </div>
          </section>
        );
      })}

      <div>
        <button
          type="button"
          onClick={addStep}
          disabled={!canAdd || busy}
          data-testid="settings-content-add"
          className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-orange-400 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dk-border dark:text-dk-text dark:hover:border-orange-400"
        >
          <HiOutlinePlus className="h-4 w-4" aria-hidden="true" />
          {t('simpleCampaign.content.followUp.add')}
        </button>
        {!canAdd && (
          <p className="mt-1 text-xs text-slate-500 dark:text-dk-text2" data-testid="settings-content-max">{t('simpleCampaign.content.followUp.max', { max: maxSteps })}</p>
        )}
      </div>

      {dirty && !validity.ok && (
        <p className="text-xs text-amber-700 dark:text-amber-300" data-testid="settings-content-incomplete">{t('campaignSettings.content.form.incomplete')}</p>
      )}
      {channel !== 'telegram' && channel !== 'whatsapp' && steps.some((step) => step.content.mode === 'custom') && (
        <p className="text-xs text-slate-500 dark:text-dk-text2" data-testid="settings-content-custom-hint">{t('campaignSettings.content.form.customHint')}</p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-dk-text dark:hover:bg-dk-raised"
          data-testid="settings-content-cancel"
        >
          {t('campaignSettings.section.cancel')}
        </button>
        <button
          type="button"
          onClick={() => onSave(current)}
          disabled={!canSave}
          data-testid="settings-content-save"
          className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('campaignSettings.section.save')}
        </button>
      </div>
    </div>
  );
}
