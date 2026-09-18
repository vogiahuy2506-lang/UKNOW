import { useState, useMemo } from 'react';
import { HiOutlineClock, HiOutlinePlus, HiOutlineTrash, HiOutlineMoon } from 'react-icons/hi';
import { useI18n } from '../../../i18n';

const DEFAULT_OUTSIDE_MESSAGE = 'Hiện ngoài giờ hỗ trợ, chúng tôi sẽ phản hồi bạn sớm nhất.';
const DEFAULT_DAYS = [1, 2, 3, 4, 5, 6, 0];
const WORKDAYS = [1, 2, 3, 4, 5];
const MON_TO_SAT = [1, 2, 3, 4, 5, 6];

function parseMinutes(str) {
  const [h, m] = String(str || '').split(':').map((v) => parseInt(v, 10));
  return (h || 0) * 60 + (m || 0);
}

function doSlotsOverlap(slotA, slotB) {
  const aStart = parseMinutes(slotA.start);
  const aEnd = parseMinutes(slotA.end);
  const bStart = parseMinutes(slotB.start);
  const bEnd = parseMinutes(slotB.end);

  const aIntervals = aStart < aEnd
    ? [[aStart, aEnd]]
    : [[aStart, 1440], [0, aEnd]];

  const bIntervals = bStart < bEnd
    ? [[bStart, bEnd]]
    : [[bStart, 1440], [0, bEnd]];

  for (const [a1, a2] of aIntervals) {
    for (const [b1, b2] of bIntervals) {
      if (Math.max(a1, b1) < Math.min(a2, b2)) {
        return true;
      }
    }
  }
  return false;
}

function toFormState(value) {
  if (!value || typeof value !== 'object') {
    return {
      mode: 'always', // 'always' (24/7) hoặc 'custom'
      days: [1, 2, 3, 4, 5],
      slots: [{ start: '08:00', end: '17:30' }],
      outsideAction: 'silent', // 'silent' hoặc 'message'
      outsideMessage: DEFAULT_OUTSIDE_MESSAGE,
    };
  }

  let days = DEFAULT_DAYS;
  if (Array.isArray(value.days) && value.days.length > 0) {
    days = value.days;
  }

  let slots = [{ start: '08:00', end: '17:30' }];
  if (Array.isArray(value.slots) && value.slots.length > 0) {
    slots = value.slots.map((s) => ({
      start: s.start || '08:00',
      end: s.end || '17:30',
    }));
  } else if (value.start && value.end) {
    slots = [{ start: value.start, end: value.end }];
  }

  return {
    mode: 'custom',
    days,
    slots,
    outsideAction: value.outsideAction === 'message' ? 'message' : 'silent',
    outsideMessage: value.outsideMessage !== undefined ? value.outsideMessage : DEFAULT_OUTSIDE_MESSAGE,
  };
}

function toPayload(formState) {
  if (formState.mode === 'always') {
    return null;
  }
  return {
    days: formState.days,
    slots: formState.slots,
    start: formState.slots[0]?.start || '08:00',
    end: formState.slots[0]?.end || '17:30',
    outsideAction: formState.outsideAction,
    outsideMessage: formState.outsideAction === 'message' ? formState.outsideMessage.trim() : '',
  };
}

export default function ChatbotActiveHoursCard({ value, onChange, onValidityChange }) {
  const { t } = useI18n();
  const [state, setState] = useState(() => toFormState(value));
  const [error, setError] = useState('');

  const dayOptions = useMemo(() => [
    { value: 1, label: t('chatbot.studio.dayMon') || 'T2' },
    { value: 2, label: t('chatbot.studio.dayTue') || 'T3' },
    { value: 3, label: t('chatbot.studio.dayWed') || 'T4' },
    { value: 4, label: t('chatbot.studio.dayThu') || 'T5' },
    { value: 5, label: t('chatbot.studio.dayFri') || 'T6' },
    { value: 6, label: t('chatbot.studio.daySat') || 'T7' },
    { value: 0, label: t('chatbot.studio.daySun') || 'CN' },
  ], [t]);

  const badgeText = useMemo(() => {
    if (state.mode === 'always') return '24/7';
    if (state.slots.length === 1) {
      return `${state.slots[0].start} – ${state.slots[0].end}`;
    }
    return `${state.slots.length} ${t('chatbot.studio.activeHoursAddSlot') ? 'khung giờ' : 'slots'}`;
  }, [state.mode, state.slots, t]);

  const areDaysMatching = (targetList) => {
    if (!state.days || state.days.length !== targetList.length) return false;
    return targetList.every((d) => state.days.includes(d));
  };

  const validateState = (nextState) => {
    if (nextState.mode === 'always') return '';

    if (!nextState.days || nextState.days.length === 0) {
      return t('chatbot.studio.activeHoursNoDaysSelected') || 'Vui lòng chọn ít nhất một ngày trong tuần';
    }

    if (!nextState.slots || nextState.slots.length === 0) {
      return t('chatbot.studio.activeHoursSlotsLabel') || 'Vui lòng cấu hình ít nhất một khung giờ';
    }

    for (const slot of nextState.slots) {
      if (!slot.start || !slot.end || slot.start === slot.end) {
        return t('chatbot.studio.activeHoursSameTime') || 'Giờ bắt đầu và giờ kết thúc không được trùng nhau';
      }
    }

    for (let i = 0; i < nextState.slots.length; i++) {
      for (let j = i + 1; j < nextState.slots.length; j++) {
        if (doSlotsOverlap(nextState.slots[i], nextState.slots[j])) {
          return t('chatbot.studio.activeHoursSlotsOverlap') || 'Các khung giờ hoạt động trong ngày không được trùng lấn nhau';
        }
      }
    }

    if (nextState.outsideAction === 'message') {
      if (!nextState.outsideMessage.trim()) {
        return t('chatbot.studio.activeHoursEmptyMessage') || 'Vui lòng nhập câu trả lời ngoài khung giờ';
      }
      if (nextState.outsideMessage.trim().length > 500) {
        return t('chatbot.studio.activeHoursMessageTooLong') || 'Câu trả lời không được vượt quá 500 ký tự';
      }
    }

    return '';
  };

  const updateState = (patch) => {
    const next = { ...state, ...patch };
    setState(next);

    const msg = validateState(next);
    setError(msg);
    onValidityChange?.(msg);
    if (!msg) onChange?.(toPayload(next));
  };

  const toggleDay = (dayVal) => {
    let nextDays;
    if (state.days.includes(dayVal)) {
      nextDays = state.days.filter((d) => d !== dayVal);
    } else {
      nextDays = [...state.days, dayVal];
    }
    updateState({ days: nextDays });
  };

  const updateSlot = (index, field, val) => {
    const newSlots = state.slots.map((slot, i) => {
      if (i === index) {
        return { ...slot, [field]: val };
      }
      return slot;
    });
    updateState({ slots: newSlots });
  };

  const addSlot = () => {
    if (state.slots.length >= 5) return;
    const lastSlot = state.slots[state.slots.length - 1];
    let newStart = '18:00';
    let newEnd = '22:00';
    if (lastSlot) {
      const lastEndMin = parseMinutes(lastSlot.end);
      if (lastEndMin < 1200) {
        newStart = '18:00';
        newEnd = '22:00';
      } else {
        newStart = '12:00';
        newEnd = '13:30';
      }
    }
    updateState({ slots: [...state.slots, { start: newStart, end: newEnd }] });
  };

  const removeSlot = (index) => {
    if (state.slots.length <= 1) return;
    const newSlots = state.slots.filter((_, i) => i !== index);
    updateState({ slots: newSlots });
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
        <div className="rounded-md border border-slate-100 bg-slate-50/50 p-3 space-y-3.5 text-xs">
          {/* Chọn ngày trong tuần */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-slate-700 font-medium">
                {t('chatbot.studio.activeHoursDaysLabel') || 'Ngày áp dụng trong tuần:'}
              </label>
              <div className="flex items-center gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => updateState({ days: WORKDAYS })}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    areDaysMatching(WORKDAYS)
                      ? 'bg-primary-100 text-primary-800 font-semibold'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/60'
                  }`}
                >
                  {t('chatbot.studio.activeHoursPresetWorkdays') || 'Thứ 2 – Thứ 6'}
                </button>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={() => updateState({ days: MON_TO_SAT })}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    areDaysMatching(MON_TO_SAT)
                      ? 'bg-primary-100 text-primary-800 font-semibold'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/60'
                  }`}
                >
                  {t('chatbot.studio.activeHoursPresetMonSat') || 'Thứ 2 – Thứ 7'}
                </button>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={() => updateState({ days: DEFAULT_DAYS })}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    areDaysMatching(DEFAULT_DAYS)
                      ? 'bg-primary-100 text-primary-800 font-semibold'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/60'
                  }`}
                >
                  {t('chatbot.studio.activeHoursPresetAllWeek') || 'Cả tuần'}
                </button>
              </div>
            </div>

            {/* Day selector pills */}
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              {dayOptions.map((day) => {
                const isSelected = state.days.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDay(day.value)}
                    className={`min-w-[36px] h-8 px-2 rounded-lg text-xs font-semibold transition-all border ${
                      isSelected
                        ? 'bg-primary-600 border-primary-600 text-white shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Danh sách các khung giờ (ca) trong ngày */}
          <div className="pt-2 border-t border-slate-200/60 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-slate-700 font-medium">
                {t('chatbot.studio.activeHoursSlotsLabel') || 'Các khung giờ hoạt động trong ngày:'}
              </label>
              {state.slots.length < 5 && (
                <button
                  type="button"
                  onClick={addSlot}
                  className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium text-xs hover:underline cursor-pointer"
                >
                  <HiOutlinePlus className="w-3.5 h-3.5" />
                  <span>{t('chatbot.studio.activeHoursAddSlot') || 'Thêm khung giờ'}</span>
                </button>
              )}
            </div>

            <div className="space-y-2">
              {state.slots.map((slot, index) => {
                const isOvernight = parseMinutes(slot.start) > parseMinutes(slot.end);
                return (
                  <div key={index} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200 shadow-xs">
                    <span className="text-[11px] font-medium text-slate-400 w-4 text-center">
                      {index + 1}.
                    </span>
                    <input
                      type="time"
                      aria-label={index === 0 ? 'start-time' : `start-time-${index}`}
                      value={slot.start}
                      onChange={(e) => updateSlot(index, 'start', e.target.value)}
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 focus:border-primary-500 focus:outline-none text-xs font-mono"
                    />
                    <span className="text-slate-400 text-xs">đến</span>
                    <input
                      type="time"
                      aria-label={index === 0 ? 'end-time' : `end-time-${index}`}
                      value={slot.end}
                      onChange={(e) => updateSlot(index, 'end', e.target.value)}
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 focus:border-primary-500 focus:outline-none text-xs font-mono"
                    />

                    {isOvernight && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                        <HiOutlineMoon className="w-3 h-3 text-amber-600" />
                        <span>{t('chatbot.studio.activeHoursOvernightBadge') || 'Qua đêm (+1)'}</span>
                      </span>
                    )}

                    <div className="flex-1" />

                    {state.slots.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSlot(index)}
                        title={t('chatbot.studio.activeHoursRemoveSlot') || 'Xoá khung giờ này'}
                        className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <HiOutlineTrash className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-[11px] text-slate-400 leading-normal">
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

