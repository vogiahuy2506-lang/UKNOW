import { HiOutlineLightningBolt } from 'react-icons/hi';
import SimpleChoiceCard from './SimpleChoiceCard';
import { WHEN_OPTION_IDS } from './simpleCampaign.helpers';

/**
 * Cách vẽ từng lựa chọn của bước "Khi nào gửi?". Lựa chọn nào hiện ra do `WHEN_OPTION_IDS` (helpers) quyết định:
 * PR-3 thêm `scheduled` / `continuous` / `recurring` vào CẢ HAI chỗ (id + thẻ ở đây) mà không phải sửa bước khác;
 * thẻ chưa làm thì KHÔNG có mặt (không hiện "Sắp có").
 */
const WHEN_CARDS = Object.freeze({
  now: { icon: HiOutlineLightningBolt, tone: 'orange' },
});

/**
 * Bước 4 — "Khi nào gửi?". PR-2 chỉ có "Gửi ngay" (chọn sẵn để khỏi tốn một cú bấm; bước Xem lại vẫn cần bấm "Bắt đầu gửi").
 *
 * @param {object} props
 * @param {object} props.wizard kết quả `useSimpleCampaignWizard`
 * @param {(key: string, params?: object) => string} props.t
 */
export default function WhenStep({ wizard, t }) {
  const { state, selectSchedule } = wizard;
  return (
    <div>
      <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-dk-text sm:text-2xl">{t('simpleCampaign.when.title')}</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-dk-text2">{t('simpleCampaign.when.hint')}</p>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {WHEN_OPTION_IDS.map((id) => (
          <SimpleChoiceCard
            key={id}
            testId={`simple-when-${id}`}
            icon={WHEN_CARDS[id].icon}
            tone={WHEN_CARDS[id].tone}
            title={t(`simpleCampaign.when.${id}.title`)}
            description={t(`simpleCampaign.when.${id}.desc`)}
            selected={state.schedule?.type === id}
            onClick={() => selectSchedule({ type: id })}
          />
        ))}
      </div>
    </div>
  );
}
