import { useEffect, useMemo, useState } from 'react';
import { HiOutlineChatAlt2 } from 'react-icons/hi';
import chatbotApi from '../services/chatbotApi.service';
import { useI18n } from '../../../i18n';

const WINDOWS = [
  { id: 'minute', labelKey: 'chatbot.studio.replyLimitMinute' },
  { id: 'hour', labelKey: 'chatbot.studio.replyLimitHour' },
  { id: 'day', labelKey: 'chatbot.studio.replyLimitDay' },
  { id: 'month', labelKey: 'chatbot.studio.replyLimitMonth' },
];

const emptyRule = () => ({ enabled: false, limit: '', action: 'silent', message: '' });

function toFormConfig(raw) {
  const windows = raw?.windows || {};
  return Object.fromEntries(WINDOWS.map(({ id }) => {
    const rule = windows[id] || {};
    const hasLimit = Number(rule.limit) > 0;
    return [id, {
      enabled: hasLimit,
      limit: hasLimit ? String(rule.limit) : '',
      action: rule.action === 'notify' ? 'notify' : 'silent',
      message: String(rule.message || ''),
    }];
  }));
}

function toPayload(config) {
  return {
    version: 1,
    windows: Object.fromEntries(WINDOWS.map(({ id }) => {
      const rule = config[id] || emptyRule();
      return [id, {
        limit: (rule.enabled && rule.limit !== '') ? Number(rule.limit) : null,
        action: rule.action,
        message: rule.action === 'notify' ? rule.message.trim() : '',
      }];
    })),
  };
}

export default function ChatbotReplyLimitsCard({ chatbot, onSaved }) {
  const { t } = useI18n();
  const [config, setConfig] = useState(() => toFormConfig(chatbot?.reply_limit_config));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setConfig(toFormConfig(chatbot?.reply_limit_config));
    setError('');
  }, [chatbot?.id, chatbot?.reply_limit_config]);

  const enabledCount = useMemo(
    () => WINDOWS.filter(({ id }) => config[id]?.enabled).length,
    [config]
  );

  const updateRule = (windowId, patch) => {
    setError('');
    setConfig((prev) => ({
      ...prev,
      [windowId]: { ...(prev[windowId] || emptyRule()), ...patch },
    }));
  };

  const handleSave = async () => {
    for (const { id, labelKey } of WINDOWS) {
      const label = t(labelKey);
      const rule = config[id];
      if (rule.enabled) {
        const limit = Number(rule.limit);
        if (rule.limit === '' || !Number.isInteger(limit) || limit <= 0) {
          setError(t('chatbot.studio.replyLimitPositiveInteger', { period: label }));
          return;
        }
      }
      if (rule.enabled && rule.action === 'notify' && rule.message.trim().length > 500) {
        setError(t('chatbot.studio.replyLimitMessageTooLong', { period: label }));
        return;
      }
    }

    setSaving(true);
    setError('');
    try {
      const replyLimitConfig = toPayload(config);
      const response = await chatbotApi.updateChatbot(chatbot.id, {
        reply_limit_config: replyLimitConfig,
      });
      const updated = {
        ...chatbot,
        ...(response?.data || {}),
        reply_limit_config: response?.data?.reply_limit_config || replyLimitConfig,
      };
      setConfig(toFormConfig(updated.reply_limit_config || replyLimitConfig));
      onSaved?.(updated);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || t('chatbot.studio.replyLimitSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
      <div className="flex items-start gap-3">
        <HiOutlineChatAlt2 className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">{t('chatbot.studio.replyLimitsTitle')}</h3>
            <span className="text-xs text-slate-500">
              {t('chatbot.studio.replyLimitsEnabled', { count: enabledCount })}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {t('chatbot.studio.replyLimitsHelp')}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {WINDOWS.map(({ id, labelKey }) => {
          const label = t(labelKey);
          const rule = config[id] || emptyRule();
          const enabled = rule.enabled;
          return (
            <div key={id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex min-w-[7rem] items-center gap-2 text-sm font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) => updateRule(id, { 
                      enabled: event.target.checked,
                      limit: event.target.checked && rule.limit === '' ? '1' : rule.limit
                    })}
                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  {label}
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  disabled={!enabled}
                  value={rule.limit}
                  onChange={(event) => updateRule(id, { limit: event.target.value })}
                  aria-label={t('chatbot.studio.replyLimitCountAria', { period: label.toLowerCase() })}
                  className="h-9 w-28 rounded-md border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                />
                <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
                  {[
                    ['silent', t('chatbot.studio.replyLimitSilent')],
                    ['notify', t('chatbot.studio.replyLimitNotify')],
                  ].map(([value, text]) => (
                    <button
                      key={value}
                      type="button"
                      disabled={!enabled}
                      onClick={() => updateRule(id, { action: value })}
                      className={`h-8 px-3 text-xs font-medium rounded ${
                        rule.action === value && enabled
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:bg-slate-50 disabled:text-slate-300'
                      }`}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>

              {enabled && rule.action === 'notify' && (
                <div>
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={rule.message}
                    onChange={(event) => updateRule(id, { message: event.target.value })}
                    placeholder={t('chatbot.studio.replyLimitMessagePlaceholder')}
                    className="w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  />
                  <p className="mt-1 text-right text-[11px] text-slate-400">{rule.message.length}/500</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {saving ? t('common.saving') : t('chatbot.studio.replyLimitSave')}
        </button>
      </div>
    </section>
  );
}
