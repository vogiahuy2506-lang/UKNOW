import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import channelSendSettingsApiService from '../services/channelSendSettingsApi.service';
import { useI18n } from '../../../i18n';
import NumberInput from '../../../components/common/NumberInput';

/**
 * PLAN_TG_WA_DAY_DU_2026-09-29 P4 — khối "Giới hạn gửi/ngày + Tốc độ gửi" cho MỘT tài khoản Telegram/WhatsApp
 * (khuôn khối tương ứng của ZaloSettings). Tự đọc/ghi qua `/campaigns/channels/:channel/accounts/:ref/send-settings`.
 *
 * - Ô số: để trống = không giới hạn (gửi `null` tường minh); vượt `warnThreshold` (BE trả: Telegram 150, WhatsApp
 *   100) thì hiện chữ vàng — chỉ CẢNH BÁO, không chặn.
 * - Đã gửi hôm nay = tin CHIẾN DỊCH (cùng bộ đếm mà bộ chạy dùng để chặn), không tính gửi nhanh.
 * - Tốc độ 3 mức; mức "custom" (do quản trị đặt tay) chỉ đọc, vẫn chọn lại được 1 trong 3.
 * - Lỗi tải (vd 403 thiếu quyền, 404) -> không hiện gì: khối này là phần phụ của thẻ tài khoản.
 *
 * @param {{channel: 'telegram'|'whatsapp', accountRef: string|number}} props
 */
export default function ChannelAccountSendSettings({ channel, accountRef }) {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [limitDraft, setLimitDraft] = useState(null);
  const [speedDraft, setSpeedDraft] = useState(null);
  const [savingLimit, setSavingLimit] = useState(false);
  const [savingSpeed, setSavingSpeed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await channelSendSettingsApiService.get(channel, accountRef);
      setData(res?.data?.data || null);
    } catch {
      setData(null);
    }
  }, [channel, accountRef]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await channelSendSettingsApiService.get(channel, accountRef);
        if (alive) setData(res?.data?.data || null);
      } catch {
        if (alive) setData(null);
      }
    })();
    return () => { alive = false; };
  }, [channel, accountRef]);

  if (!data) return null;

  const idPrefix = `channel-send-${channel}-${String(accountRef).replace(/[^A-Za-z0-9_-]/g, '_')}`;
  const savedLimit = data.userDailySendLimit == null ? '' : String(data.userDailySendLimit);
  const limitValue = limitDraft ?? savedLimit;
  const speedValue = speedDraft ?? (data.sendSpeed === 'custom' ? 'custom' : data.sendSpeed);
  const channelKey = channel === 'whatsapp' ? 'Whatsapp' : 'Telegram';
  const warnThreshold = Number(data.warnThreshold) || 0;
  const overWarn = limitValue !== '' && warnThreshold > 0 && Number(limitValue) > warnThreshold;
  const reachedLimit = data.userDailySendLimit != null && data.sentToday >= data.userDailySendLimit;

  const handleSaveLimit = async () => {
    const raw = String(limitValue).trim();
    let value = null;
    if (raw !== '') {
      value = Number(raw);
      if (!Number.isInteger(value) || value < 1 || value > data.dailyLimitMax) {
        toast.error(t('channelSendSettings.dailyLimitInvalid', { max: String(data.dailyLimitMax) }));
        return;
      }
    }
    setSavingLimit(true);
    try {
      await channelSendSettingsApiService.update(channel, accountRef, { userDailySendLimit: value });
      await load();
      setLimitDraft(null);
      toast.success(t('channelSendSettings.saveLimitSuccess'));
    } catch (error) {
      toast.error(error.response?.data?.message || t('channelSendSettings.saveLimitFailed'));
    } finally {
      setSavingLimit(false);
    }
  };

  const handleSaveSpeed = async () => {
    if (!['safe', 'fast', 'very_fast'].includes(speedValue)) return;
    setSavingSpeed(true);
    try {
      await channelSendSettingsApiService.update(channel, accountRef, { sendSpeed: speedValue });
      await load();
      setSpeedDraft(null);
      toast.success(t('channelSendSettings.saveSpeedSuccess'));
    } catch (error) {
      toast.error(error.response?.data?.message || t('channelSendSettings.saveSpeedFailed'));
    } finally {
      setSavingSpeed(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3" data-testid={`${idPrefix}-block`}>
      <p className="text-xs font-semibold text-slate-700">{t('channelSendSettings.title')}</p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label htmlFor={`${idPrefix}-limit`} className="text-xs text-slate-600">
          {t('channelSendSettings.dailyLimit')}:
        </label>
        {/* Bề rộng đặt ở div bọc: lớp `.input` dùng `@apply w-full` nên thắng mọi utility w-* đặt trên chính ô. */}
        <div className="w-44">
          <NumberInput
            id={`${idPrefix}-limit`}
            min={1}
            max={data.dailyLimitMax}
            value={limitValue}
            onChange={(v) => setLimitDraft(String(v))}
            className="input py-1 text-sm"
            placeholder={t('channelSendSettings.dailyLimitPlaceholder')}
          />
        </div>
        <button
          type="button"
          className="btn btn-secondary text-xs"
          onClick={handleSaveLimit}
          disabled={savingLimit}
        >
          {savingLimit ? t('common.saving') : t('common.save')}
        </button>
        {overWarn && (
          <span className="text-xs text-amber-600" data-testid={`${idPrefix}-limit-warn`}>
            {t(`channelSendSettings.dailyLimitWarn${channelKey}`, { threshold: String(warnThreshold) })}
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-slate-500" data-testid={`${idPrefix}-sent-today`}>
        {data.userDailySendLimit != null
          ? t('channelSendSettings.sentTodayWithLimit', { sent: String(data.sentToday), limit: String(data.userDailySendLimit) })
          : t('channelSendSettings.sentTodayNoLimit', { sent: String(data.sentToday) })}
        {' '}
        <span className="text-slate-400">{t('channelSendSettings.sentTodayNote')}</span>
      </p>
      {reachedLimit && (
        <p className="mt-0.5 text-xs font-medium text-amber-700">{t('channelSendSettings.limitReached')}</p>
      )}

      {data.userDailySendLimit != null && (
        <div className="mt-2 pt-1.5 border-t border-slate-200/50" data-testid={`${idPrefix}-quota-progress`}>
          {(() => {
            const sentNum = Number(data.sentToday || 0);
            const limitNum = Number(data.userDailySendLimit);
            const percent = limitNum > 0 ? Math.min(100, Math.round((sentNum / limitNum) * 100)) : 0;
            const progressColor = percent >= 90 ? 'bg-rose-500' : percent >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
            return (
              <>
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                  <span>Tiến độ hạn mức hôm nay</span>
                  <span className={`font-semibold ${percent >= 90 ? 'text-rose-600' : percent >= 70 ? 'text-amber-600' : 'text-slate-700'}`}>
                    {percent}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-200/80 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${progressColor}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </>
            );
          })()}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label htmlFor={`${idPrefix}-speed`} className="text-xs text-slate-600">
          {t('channelSendSettings.speed')}:
        </label>
        <div className="w-64">
          <select
            id={`${idPrefix}-speed`}
            value={speedValue}
            onChange={(e) => setSpeedDraft(e.target.value)}
            className="input py-1 text-sm"
          >
            {data.sendSpeed === 'custom' && speedDraft == null && (
              <option value="custom" disabled>{t('channelSendSettings.speedCustom')}</option>
            )}
            <option value="safe">{t(`channelSendSettings.speedSafe${channelKey}`)}</option>
            <option value="fast">{t(`channelSendSettings.speedFast${channelKey}`)}</option>
            <option value="very_fast">{t(`channelSendSettings.speedVeryFast${channelKey}`)}</option>
          </select>
        </div>
        <button
          type="button"
          className="btn btn-secondary text-xs"
          onClick={handleSaveSpeed}
          disabled={savingSpeed || speedValue === 'custom'}
        >
          {savingSpeed ? t('common.saving') : t('common.save')}
        </button>
        {speedValue === 'fast' && (
          <span className="text-xs text-amber-600">{t('channelSendSettings.speedFastWarning')}</span>
        )}
        {speedValue === 'very_fast' && (
          <span className="text-xs font-medium text-red-600">
            {t(`channelSendSettings.speedVeryFastWarning${channelKey}`)}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-slate-400">{t('channelSendSettings.speedAppliedNextRunHint')}</p>
    </div>
  );
}
