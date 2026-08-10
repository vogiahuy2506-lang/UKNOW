import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { HiOutlineQuestionMarkCircle } from 'react-icons/hi';
import { resolveHelpFeature } from '../../services/help.service';
import { useI18n } from '../../i18n';

/** Map pathname → feature_key (Nhóm 1 + một số màn đã có bài). */
const ROUTE_FEATURE_MAP = [
  { test: (p) => p.includes('/settings/ai-profile'), key: 'ai-profile' },
  { test: (p) => p.includes('/settings/channels'), key: 'channels' },
  { test: (p) => p.includes('/quick-send'), key: 'quick-send' },
  { test: (p) => p.includes('/campaigns/new') || /\/campaigns\/[^/]+\/builder/.test(p), key: 'campaign-create' },
  { test: (p) => p.includes('/billing'), key: 'plan-and-billing' },
  { test: (p) => p.includes('/topup'), key: 'plan-and-billing' },
];

/**
 * Icon ? trên header — trỏ tới bài hướng dẫn theo màn hình hiện tại.
 */
const HelpHintLink = () => {
  const { t, locale } = useI18n();
  const location = useLocation();
  const [href, setHref] = useState(null);

  const featureKey = useMemo(() => {
    const path = location.pathname || '';
    const hit = ROUTE_FEATURE_MAP.find((r) => r.test(path));
    return hit?.key || null;
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;
    if (!featureKey) {
      setHref(null);
      return undefined;
    }
    (async () => {
      try {
        const { data } = await resolveHelpFeature(featureKey, locale);
        const url = data?.result?.url;
        if (!cancelled) setHref(url || null);
      } catch {
        if (!cancelled) setHref(null);
      }
    })();
    return () => { cancelled = true; };
  }, [featureKey, locale]);

  if (!href) return null;

  return (
    <Link
      to={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      title={t('helpDocs.openGuide')}
    >
      <HiOutlineQuestionMarkCircle className="h-5 w-5" />
      <span className="hidden sm:inline">{t('helpDocs.help')}</span>
    </Link>
  );
};

export default HelpHintLink;
