import { useNavigate } from 'react-router-dom';
import { HiOutlineLockClosed, HiOutlineLogout, HiOutlineArrowRight, HiOutlineOfficeBuilding } from 'react-icons/hi';
import { useAuthStore } from '../../stores/authStore';
import Navbar from '../../components/layout/client/Navbar';
import Footer from '../../components/layout/client/Footer';
import { useI18n } from '../../i18n';

const NoPlanScreen = () => {
  const { t } = useI18n();
  const { logout, user, switchContext } = useAuthStore();
  const navigate   = useNavigate();
  const memberships = user?.memberships || [];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleEnterWorkspace = (ownerId) => {
    switchContext(ownerId);
    navigate('/app');
  };

  return (
    <div className="min-h-screen bg-white flex flex-col overflow-x-hidden">
      <Navbar />

      {/* pt-20 để tránh bị Navbar fixed che */}
      <div className="flex-1 flex items-center justify-center px-4 pt-20">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <HiOutlineLockClosed className="w-8 h-8 text-primary-600" />
          </div>

          <h2 className="text-2xl font-bold text-gray-900">{t('noPlan.title')}</h2>
          <p className="text-gray-500 mt-3 text-sm leading-relaxed">
            {t('noPlan.description')}
            {memberships.length > 0
              ? t('noPlan.descriptionWithMembership')
              : t('noPlan.descriptionWithoutMembership')}
          </p>

          {/* Danh sách workspace user đang là employee */}
          {memberships.length > 0 && (
            <div className="mt-6 space-y-2 text-left">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">
                {t('noPlan.enterWorkspace')}
              </p>
              {memberships.map((m) => (
                <button
                  key={m.ownerId}
                  onClick={() => handleEnterWorkspace(m.ownerId)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 transition group"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {(m.ownerName || m.ownerUsername || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{m.ownerName || m.ownerUsername}</p>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <HiOutlineOfficeBuilding className="w-3 h-3" /> {t('noPlan.employee')}
                    </p>
                  </div>
                  <HiOutlineArrowRight className="w-4 h-4 text-amber-600 group-hover:translate-x-0.5 transition" />
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-3 mt-8">
            <button onClick={() => navigate('/pricing')} className="btn btn-primary w-full">
              {t('noPlan.viewPlans')}
              <HiOutlineArrowRight className="w-4 h-4 ml-2" />
            </button>
            <button onClick={handleLogout} className="btn btn-secondary w-full">
              <HiOutlineLogout className="w-4 h-4 mr-2" />
              {t('noPlan.logout')}
            </button>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default NoPlanScreen;
