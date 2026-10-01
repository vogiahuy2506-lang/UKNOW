import { useEffect, useState } from 'react';
import { HiOutlineMail, HiOutlineChat } from 'react-icons/hi';
import { FaFacebookF, FaTelegramPlane, FaWhatsapp } from 'react-icons/fa';
import EmailSettings from './EmailSettings';
import ZaloSettings from './ZaloSettings';
import WhatsAppSettings from './WhatsAppSettings';
import TelegramSettings from './TelegramSettings';
import FacebookSettings from './FacebookSettings';
import ChannelNotInPlanNotice from '../../features/settings/components/ChannelNotInPlanNotice';
import { useChannelEntitlements } from '../../hooks/queries/useChannelEntitlements';

const TABS = [
  { key: 'email', label: 'Email', icon: HiOutlineMail, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
  { key: 'facebook', label: 'Facebook', icon: FaFacebookF, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
  { key: 'zalo', label: 'Zalo', icon: HiOutlineChat, color: 'text-sky-600', bg: 'bg-sky-50 border-sky-100' },
  { key: 'whatsapp', label: 'WhatsApp', icon: FaWhatsapp, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
  { key: 'telegram', label: 'Telegram', icon: FaTelegramPlane, color: 'text-sky-500', bg: 'bg-sky-50 border-sky-100' },
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
      <div className="flex flex-wrap gap-1.5 p-1.5 bg-gray-100/90 rounded-xl w-fit border border-gray-200/60">
        {TABS.map(({ key, label, icon: Icon, color, bg }) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setActive(key);
                if (typeof window !== 'undefined') {
                  window.location.hash = `#${key}`;
                }
              }}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                isActive
                  ? 'bg-orange-500 text-white shadow-sm ring-1 ring-orange-500/20'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/80'
              }`}
            >
              <span
                className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 border transition-colors ${
                  isActive ? 'bg-white/20 text-white border-white/20' : `${bg} ${color}`
                }`}
                aria-hidden="true"
              >
                <Icon className="w-3.5 h-3.5" />
              </span>
              <span>{label}</span>
            </button>
          );
        })}
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
