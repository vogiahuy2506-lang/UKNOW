import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useMarketplaceModal } from '../../contexts/useMarketplaceModal';

const MarketplacePage = () => {
  const location = useLocation();
  const { showMarketplace, hideMarketplace } = useMarketplaceModal();
  const openedRef = useRef(false);

  const initialTab = location.state?.tab || 'browse';

  // Mở modal ngay khi page mount (deep link /app/marketplace)
  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    showMarketplace(null, initialTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup: đóng modal khi rời page. Trong StrictMode dev, effect chạy mount→cleanup→mount
  // nên cuối cùng modal vẫn open; cleanup thật sự chỉ chạy khi navigate đi nơi khác.
  useEffect(() => {
    const opened = openedRef.current;
    return () => {
      if (opened) hideMarketplace();
    };
  }, [hideMarketplace]);

  return (
    <div className="flex-1 min-h-[60vh] flex items-center justify-center">
      <div className="text-center text-gray-500">
        <div className="spinner w-8 h-8 mx-auto mb-3"></div>
        <p className="text-sm">Đang mở Marketplace...</p>
      </div>
    </div>
  );
};

export default MarketplacePage;
