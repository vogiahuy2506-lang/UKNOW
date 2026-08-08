import { useEffect, useState } from 'react';
import { HiOutlineClock } from 'react-icons/hi';
import { updateAiHandoffAutoResume } from '../auth/services/authApi.service';

const OPTIONS = [null, 5, 15, 30, 60];

/**
 * Owner-wide: auto-resume AI after handoff timeout (all chatbots / channels).
 * Saves via its own PATCH — not part of chatbot form Save.
 */
export default function AiHandoffAutoResumeCard({ data, t, onSaved }) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    const mins = data?.aiHandoffAutoResumeMinutes;
    setValue(mins != null && Number(mins) > 0 ? String(mins) : '');
  }, [data?.aiHandoffAutoResumeMinutes]);

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSavedOk(false);
    setSaving(true);
    try {
      const trimmed = String(value || '').trim();
      const payload = {
        aiHandoffAutoResumeMinutes: trimmed === '' ? null : Number.parseInt(trimmed, 10),
      };
      if (
        payload.aiHandoffAutoResumeMinutes != null
        && !OPTIONS.includes(payload.aiHandoffAutoResumeMinutes)
      ) {
        setError(t('aiHandoffResume.invalid'));
        return;
      }
      const res = await updateAiHandoffAutoResume(payload);
      const next = res?.data?.aiHandoffAutoResumeMinutes ?? null;
      setValue(next != null ? String(next) : '');
      setSavedOk(true);
      onSaved?.(next);
    } catch (err) {
      setError(err?.response?.data?.message || t('aiHandoffResume.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSave}
      className="rounded-xl border border-gray-200 bg-white p-4 space-y-3"
    >
      <div className="flex items-start gap-2">
        <HiOutlineClock className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">
            {t('aiHandoffResume.title')}
          </h3>
          <p className="mt-1 text-xs text-gray-500 leading-relaxed">
            {t('aiHandoffResume.help')}
          </p>
          <p className="mt-1 text-xs font-medium text-slate-600">
            {t('aiHandoffResume.scopeNote')}
          </p>
          <p className="mt-1 text-xs text-gray-500 leading-relaxed">
            {t('aiHandoffResume.toggleNote')}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="ai-handoff-auto-resume">
          {t('aiHandoffResume.title')}
        </label>
        <select
          id="ai-handoff-auto-resume"
          value={value}
          onChange={(ev) => {
            setSavedOk(false);
            setValue(ev.target.value);
          }}
          className="w-full sm:max-w-[14rem] rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          <option value="">{t('aiHandoffResume.off')}</option>
          <option value="5">{t('aiHandoffResume.minutes', { n: 5 })}</option>
          <option value="15">{t('aiHandoffResume.minutes', { n: 15 })}</option>
          <option value="30">{t('aiHandoffResume.minutes', { n: 30 })}</option>
          <option value="60">{t('aiHandoffResume.minutes', { n: 60 })}</option>
        </select>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {savedOk && !error && (
        <p className="text-sm text-green-600">{t('aiHandoffResume.saved')}</p>
      )}
    </form>
  );
}
