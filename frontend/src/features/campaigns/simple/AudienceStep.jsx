import AudienceChooser from './AudienceChooser';
import { AUDIENCE_TYPES_BY_CHANNEL, isGroupAudienceType } from './simpleCampaign.helpers';

/**
 * Bước 2 — "Bạn muốn gửi cho ai?". Thẻ nguồn lọc theo kênh; chọn thẻ thì phần chọn chi tiết mở ngay bên dưới
 * (lưới thẻ + panel nằm ở `AudienceChooser`, dùng chung với mục "Gửi cho ai" của tab Thiết lập).
 * "Nhóm" là một thẻ nguồn như các thẻ khác (Nhóm Zalo / Nhóm Telegram / Nhóm WhatsApp) và BẮT BUỘC ≥ 1 nhóm.
 *
 * @param {object} props
 * @param {object} props.wizard kết quả `useSimpleCampaignWizard`
 * @param {(key: string, params?: object) => string} props.t
 * @param {string} props.locale
 */
export default function AudienceStep({ wizard, t, locale }) {
  const { state, selectAudienceType, patchAudience } = wizard;
  const { channel, audience, sender } = state;
  const types = AUDIENCE_TYPES_BY_CHANNEL[channel] || [];
  const isGroupSource = isGroupAudienceType(audience.type);

  return (
    <div>
      <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-dk-text sm:text-2xl">{t('simpleCampaign.audience.title')}</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-dk-text2">{t('simpleCampaign.audience.hint')}</p>

      <div className="mt-5">
        <AudienceChooser
          channel={channel}
          types={types}
          audience={audience}
          sender={sender}
          onSelectType={selectAudienceType}
          patchAudience={patchAudience}
          t={t}
          locale={locale}
        />
      </div>

      {/* Telegram không có bước kiểm "đã từ chối nhận tin" (khoá theo SĐT) và nhóm không có chuyện từ chối riêng từng người nên không nói câu này. */}
      {!isGroupSource && channel !== 'telegram' && (
        <p className="mt-4 text-xs text-slate-500 dark:text-dk-text2" data-testid="simple-consent-note">
          {t('simpleCampaign.audience.consentNote')}
        </p>
      )}
    </div>
  );
}
