import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMarketplaceModal } from '../../contexts/useMarketplaceModal';

/**
 * Redirects /app/marketplace/create to open the modal with create form
 */
const MarketplaceCreateRedirect = () => {
  const navigate = useNavigate();
  const { showCreateListingForm, hideMarketplace } = useMarketplaceModal();
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    showCreateListingForm();

    // Navigate back to marketplace after opening modal
    navigate('/app/marketplace', { replace: true });

    return () => {
      hideMarketplace();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};

export default MarketplaceCreateRedirect;
