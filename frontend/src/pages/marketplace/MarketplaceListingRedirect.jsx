import { useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useMarketplaceModal } from '../../contexts/MarketplaceModalContext';

const MarketplaceListingRedirect = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { showListing } = useMarketplaceModal();

  useEffect(() => {
    if (id) {
      showListing(id, location.state?.tab || 'browse');
      navigate('/app/marketplace', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="flex-1 min-h-[60vh] flex items-center justify-center">
      <div className="text-center text-gray-500">
        <div className="spinner w-8 h-8 mx-auto mb-3"></div>
        <p className="text-sm">Đang mở listing...</p>
      </div>
    </div>
  );
};

export default MarketplaceListingRedirect;