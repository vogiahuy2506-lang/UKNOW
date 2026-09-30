import { useEffect, useState } from 'react';
import EmailSettings from './EmailSettings';
import ZaloSettings from './ZaloSettings';
import WhatsAppSettings from './WhatsAppSettings';
import TelegramSettings from './TelegramSettings';
import FacebookSettings from './FacebookSettings';
import ChannelNotInPlanNotice from '../../features/settings/components/ChannelNotInPlanNotice';
import { useChannelEntitlements } from '../../hooks/queries/useChannelEntitlements';

const TABS = [
  { key: 'email', label: 'Email' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'zalo', label: 'Zalo' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'telegram', label: 'Telegram' },
];

const ChannelSettings = () => {
  // P9 — gói không có Telegram/WhatsApp/Zalo (trần 0): tab vẫn hiện nhưng nội dung là thông báo + nút mua, không có nút kết nối/quét QR.
  const entitlements = useChannelEntitlements();
  // Allow opening directly on a tab via /app/settings/channels#tab (used by the
  // OAuth callback redirect after Embedded Signup).
  const [active, setActive] = useState(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const tab = window.location.hash.replace(/^#/, '');
      if (TABS.some((t) => t.key === tab)) return tab;
    }
    return 'email';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onHashChange = () => {
      const tab = window.location.hash.replace(/^#/, '');
      if (TABS.some((t) => t.key === tab)) {
        setActive(tab);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setActive(key);
              if (typeof window !== 'undefined') {
                window.location.hash = `#${key}`;
              }
            }}
            className={`px-5 py-1.5 rounded-md text-sm font-medium transition-colors ${
              active === key
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {active === 'email' && <EmailSettings />}
      {active === 'facebook' && <FacebookSettings />}
      {active === 'zalo' && (entitlements.isLoading ? null : (
        <>
          {!entitlements.zalo && <ChannelNotInPlanNotice channel="zalo" />}
          <ZaloSettings readOnly={!entitlements.zalo} />
        </>
      ))}
      {active === 'whatsapp' && (entitlements.isLoading ? null : (
        <>
          {!entitlements.whatsapp && <ChannelNotInPlanNotice channel="whatsapp" />}
          <WhatsAppSettings readOnly={!entitlements.whatsapp} />
        </>
      ))}
      {active === 'telegram' && (entitlements.isLoading ? null : (
        <>
          {!entitlements.telegram && <ChannelNotInPlanNotice channel="telegram" />}
          <TelegramSettings readOnly={!entitlements.telegram} />
        </>
      ))}
    </div>
  );
};

export default ChannelSettings;
