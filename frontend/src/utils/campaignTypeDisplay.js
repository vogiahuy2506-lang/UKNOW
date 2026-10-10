const CAMPAIGN_TYPE_MAP = {
  email: {
    label: 'Email',
    className: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60',
  },
  zalo: {
    label: 'Zalo cá nhân',
    className: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
  },
  zalo_group: {
    label: 'Zalo nhóm',
    className: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800/60',
  },
  // PR-E1: 'telegram' là loại riêng (migration 260); 'telegram_group' dành cho PR-E2.
  telegram: {
    label: 'Telegram',
    className: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60',
  },
  telegram_group: {
    label: 'Telegram nhóm',
    className: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60',
  },
  // PLAN_WHATSAPP_DAY_DU_2026-09-29 PR-W4b: 'whatsapp' là loại riêng (migration 261, BE PR-W4a).
  whatsapp: {
    label: 'WhatsApp',
    className: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800/60',
  },
  // 'mixed': chiến dịch Telegram cũ tạo 28–29/09 (PR-7a khi ENUM chưa có 'telegram') + chiến dịch đa kênh
  // từ AI. Không có nhãn thì hiện chữ "mixed" thô trong danh sách.
  mixed: {
    label: 'Đa kênh',
    className: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60',
  },
};

export const getCampaignTypeMeta = (campaignType) => {
  const key = String(campaignType || '').trim().toLowerCase();
  if (CAMPAIGN_TYPE_MAP[key]) return CAMPAIGN_TYPE_MAP[key];
  return {
    label: campaignType || '--',
    className: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-dk-raised dark:text-dk-text dark:border-dk-border',
  };
};
