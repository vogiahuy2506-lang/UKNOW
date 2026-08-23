import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { HiOutlineCurrencyDollar, HiOutlineTag } from 'react-icons/hi';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';
import { getMyProfile } from '../../features/auth/services/authApi.service';
import PlanSection from '../../features/billing/PlanSection';
import SavedInvoiceProfileSection from '../../features/billing/SavedInvoiceProfileSection';
import OrderHistoryTab from '../../features/billing/OrderHistoryTab';
import ResourceLocksTab from '../../features/billing/ResourceLocksTab';

const BillingHubPage = () => {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const syncBillingFromProfile = useAuthStore((s) => s.syncBillingFromProfile);
  const user = useAuthStore((s) => s.user);
  const isUserAdmin = user?.role === 'user';
  const [profileData, setProfileData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const initialTab = searchParams.get('tab') === 'locks' ? 'locks' : 'overview';
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    let cancelled = false;

    // MainLayout gọi GET /users/profile (fetchAiCredits) đúng lúc trang này cũng
    // gọi. Interceptor gộp request trong services/api.js huỷ request trùng URL
    // đang bay, nên khi mở thẳng /app/billing thì lần tải đầu bị huỷ oan và
    // trang báo "Không tải được thông tin gói" dù API vẫn trả 200. Thử lại một
    // nhịp là qua; sửa gốc nằm ở interceptor — nên dùng chung promise đang bay
    // thay vì huỷ cái cũ.
    const loadProfile = async () => {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await getMyProfile();
        } catch (err) {
          if (cancelled || err?.code !== 'ERR_CANCELED' || attempt >= 2) throw err;
          await new Promise((resolve) => { setTimeout(resolve, 300); });
        }
      }
    };

    (async () => {
      setIsLoading(true);
      setError('');
      try {
        const response = await loadProfile();
        const nextProfile = response?.data || null;
        if (cancelled || !nextProfile) return;
        setProfileData(nextProfile);
        syncBillingFromProfile(nextProfile);
      } catch (err) {
        if (!cancelled) {
          setError(err?.response?.data?.message || t('billingHub.loadFailed'));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [syncBillingFromProfile, t]);

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="w-full space-y-8 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('billingHub.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('billingHub.subtitle')}</p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      <div className="flex gap-1 border-b border-gray-100">
        {[
          { key: 'overview', label: t('billingHub.tabOverview') },
          { key: 'locks', label: t('billingHub.tabLocks') },
          { key: 'orders', label: t('billingHub.tabOrders') },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'orders' ? (
        <OrderHistoryTab isUserAdmin={isUserAdmin} t={t} />
      ) : activeTab === 'locks' ? (
        <ResourceLocksTab t={t} />
      ) : (
        <div className="space-y-6">
          <PlanSection data={profileData} t={t} />
          <SavedInvoiceProfileSection />

          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
            <Link
              to="/app/topup"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3.5 text-sm font-semibold text-white hover:bg-primary-700"
            >
              <HiOutlineCurrencyDollar className="h-5 w-5" />
              {t('billingHub.ctaTopup')}
            </Link>
            <Link
              to="/pricing"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              <HiOutlineTag className="h-5 w-5" />
              {t('billingHub.ctaUpgrade')}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingHubPage;
