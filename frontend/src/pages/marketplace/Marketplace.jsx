import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMarketplaceModal } from '../../contexts/useMarketplaceModal';

const MarketplacePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showMarketplace, hideMarketplace } = useMarketplaceModal();
  const openedRef = useRef(false);

  const initialTab = location.state?.tab || 'browse';

  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    showMarketplace(null, initialTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      hideMarketplace();
    };
  }, [hideMarketplace]);

  return (
    <div className="flex-1 min-h-[60vh] flex items-center justify-center">
      <div className="text-center text-gray-500">
        <div className="spinner w-8 h-8 mx-auto mb-3"></div>
        <p className="text-sm">Đang mở Marketplace...</p>
        <button
          onClick={() => navigate('/app')}
          className="mt-4 text-xs text-gray-400 hover:text-gray-600 underline"
        >
          Hoặc quay lại dashboard
        </button>
      </div>
    </div>
  );
};

export default MarketplacePage;