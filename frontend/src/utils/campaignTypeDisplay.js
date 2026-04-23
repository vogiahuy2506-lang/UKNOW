const CAMPAIGN_TYPE_MAP = {
  email: {
    label: 'Email',
    className: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  zalo: {
    label: 'Zalo cá nhân',
    className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
  zalo_group: {
    label: 'Zalo nhóm',
    className: 'bg-violet-100 text-violet-700 border-violet-200',
  },
};

export const getCampaignTypeMeta = (campaignType) => {
  const key = String(campaignType || '').trim().toLowerCase();
  if (CAMPAIGN_TYPE_MAP[key]) return CAMPAIGN_TYPE_MAP[key];
  return {
    label: campaignType || '--',
    className: 'bg-gray-100 text-gray-700 border-gray-200',
  };
};
