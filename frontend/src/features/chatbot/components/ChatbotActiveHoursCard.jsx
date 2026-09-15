import { useState, useMemo } from 'react';
import { HiOutlineClock } from 'react-icons/hi';
import { useI18n } from '../../../i18n';

const DEFAULT_OUTSIDE_MESSAGE = 'Hiện ngoài giờ hỗ trợ, chúng tôi sẽ phản hồi bạn sớm nhất.';

function toFormState(value) {
  if (!value || typeof value !== 'object') {
    return {
      mode: 'always', // 'always' (24/7) hoặc 'custom'
      start: '08:00',
      end: '17:30',
      outsideAction: 'silent', // 'silent' hoặc 'message'
      outsideMessage: DEFAULT_OUTSIDE_MESSAGE,
    };
  }

  return {
    mode: 'custom',
    start: value.start || '08:00',
    end: value.end || '17:30',
    outsideAction: value.outsideAction === 'message' ? 'message' : 'silent',
    outsideMessage: value.outsideMessage !== undefined ? value.outsideMessage : DEFAULT_OUTSIDE_MESSAGE,
  };
}

function toPayload(formState) {
  if (formState.mode === 'always') {
    return null;
  }
  return {
    start: formState.start,
    end: formState.end,
    outsideAction: formState.outsideAction,
    outsideMessage: formState.outsideAction === 'message' ? formState.outsideMessage.trim() : '',
  };
}

export default function ChatbotActiveHoursCard({ value, onChange, onValidityChange }) {
  const { t } = useI18n();
  const [state, setState] = useState(() => toFormState(value));
  const [error, setError] = useState('');

  const badgeText = useMemo(() => {
    if (state.mode === 'always') return '24/7';
    return `${state.start} – ${state.end}`;
  }, [state.mode, state.start, state.end]);

  const updateState = (patch) => {
    const next = { ...state, ...patch };
    setState(next);

    // Validation
    let msg = '';
    if (next.mode === 'custom') {
      if (next.start === next.end) {
        msg = t('chatbot.studio.activeHoursSameTime') || 'Giờ bắt đầu và giờ kết thúc không được trùng nhau';
      } else if (next.outsideAction === 'message' && !next.outsideMessage.trim()) {
        msg = t('chatbot.studio.activeHoursEmptyMessage') || 'Vui lòng nhập câu trả lời ngoài khung giờ';
      } else if (next.outsideAction === 'message' && next.outsideMessage.trim().length > 500) {
        msg = t('chatbot.studio.activeHoursMessageTooLong') || 'Câu trả lời không được vượt quá 500 ký tự';
      }
    }

    setError(msg);
    // Báo lỗi lên modal để chặn nút Lưu: không báo thì modal giữ cấu hình hợp lệ cũ và lưu âm thầm
    // bản cũ (ví dụ vẫn 24/7) trong khi chủ shop tưởng đã lưu khung giờ.
    onValidityChange?.(msg);
    if (!msg) onChange?.(toPayload(next));
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
      <div className="flex items-start gap-3">
        <HiOutlineClock className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">
              {t('chatbot.studio.activeHoursTitle') || 'Khung giờ hoạt động'}
            </h3>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
              {badgeText}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {t('chatbot.studio.activeHoursHelp') || 'Chatbot chỉ tự động trả lời trong khung giờ đã định. Ngoài khung giờ sẽ không gọi AI và không trừ credit.'}
          </p>
        </div>
      </div>

      {/* Chế độ hoạt động */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <button
          type="button"
          onClick={() => updateState({ mode: 'always' })}
          className={`flex items-center justify-center rounded-md border px-3 py-2 font-medium transition-colors ${
            state.mode === 'always'
              ? 'border-primary-500 bg-primary-50 text-primary-700'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          {t('chatbot.studio.activeHoursAlways') || 'Luôn trả lời (24/7)'}
        </button>
        <button
          type="button"
          onClick={() => updateState({ mode: 'custom' })}
          className={`flex items-center justify-center rounded-md border px-3 py-2 font-medium transition-colors ${
            state.mode === 'custom'
              ? 'border-primary-500 bg-primary-50 text-primary-700'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          {t('chatbot.studio.activeHoursCustom') || 'Chỉ trả lời trong khung giờ'}
        </button>
      </div>

      {state.mode === 'custom' && (
        <div className="rounded-md border border-slate-100 bg-slate-50/50 p-3 space-y-3 text-xs">
          {/* Chọn giờ */}
          <div>
            <label className="block text-slate-700 font-medium mb-1">
              {t('chatbot.studio.activeHoursTimeRange') || 'Khung giờ được phép trả lời:'}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="time"
                aria-label="start-time"
                value={state.start}
                onChange={(e) => updateState({ start: e.target.value })}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 focus:border-primary-500 focus:outline-none"
              />
              <span className="text-slate-400">đến</span>
              <input
                type="time"
                aria-label="end-time"
                value={state.end}
                onChange={(e) => updateState({ end: e.target.value })}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 focus:border-primary-500 focus:outline-none"
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-400 leading-normal">
              {t('chatbot.studio.activeHoursTzNote') || 'Giờ Việt Nam (UTC+7). Được phép qua nửa đêm, ví dụ 18:00 – 05:00.'}
            </p>
          </div>

          {/* Hành vi khi ngoài giờ */}
          <div className="pt-2 border-t border-slate-200/60">
            <label className="block text-slate-700 font-medium mb-1.5">
              {t('chatbot.studio.activeHoursOutsideAction') || 'Khi có tin nhắn ngoài khung giờ:'}
            </label>
            <div className="flex items-center gap-4 mb-2">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="outsideAction"
                  checked={state.outsideAction === 'silent'}
                  onChange={() => updateState({ outsideAction: 'silent' })}
                  className="text-primary-600 focus:ring-primary-500"
                />
                <span className="text-slate-700">{t('chatbot.studio.activeHoursSilent') || 'Im lặng'}</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="outsideAction"
                  checked={state.outsideAction === 'message'}
                  onChange={() => updateState({ outsideAction: 'message' })}
                  className="text-primary-600 focus:ring-primary-500"
                />
                <span className="text-slate-700">{t('chatbot.studio.activeHoursSendMessage') || 'Gửi một câu'}</span>
              </label>
            </div>

            {state.outsideAction === 'message' && (
              <div className="space-y-1">
                <textarea
                  rows={2}
                  maxLength={500}
                  value={state.outsideMessage}
                  onChange={(e) => updateState({ outsideMessage: e.target.value })}
                  placeholder={DEFAULT_OUTSIDE_MESSAGE}
                  className="w-full rounded border border-slate-300 bg-white p-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none"
                />
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>{t('chatbot.studio.activeHoursOnceNotice') || 'Chỉ gửi tối đa 1 lần cho mỗi khách trong đợt ngoài giờ.'}</span>
                  <span>{state.outsideMessage.length}/500</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-rose-600 font-medium">
          {error}
        </p>
      )}
    </section>
  );
}
