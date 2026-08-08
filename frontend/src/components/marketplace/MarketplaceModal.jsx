import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import MarketplaceContent from '../../pages/marketplace/MarketplaceContent';
import ListingDetailModal from './ListingDetailModal';

const MarketplaceModal = ({ open, onClose, selectedListingId, onSelectListing, activeTab, onTabChange }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-6xl h-full max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {selectedListingId ? (
          <ListingDetailModal
            listingId={selectedListingId}
            onClose={onClose}
            onBack={() => onSelectListing(null)}
          />
        ) : (
          <MarketplaceContent
            onClose={onClose}
            activeTab={activeTab}
            onTabChange={onTabChange}
            onSelectListing={onSelectListing}
          />
        )}
      </div>
    </div>,
    document.body
  );
};

export default MarketplaceModal;