import { createContext, useContext, useState, useCallback } from 'react';
import MarketplaceModal from '../components/marketplace/MarketplaceModal';

const MarketplaceModalContext = createContext(null);

export const MarketplaceModalProvider = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState(null);
  const [activeTab, setActiveTab] = useState('browse');

  const showMarketplace = useCallback((listingId = null, tab = 'browse') => {
    setSelectedListingId(listingId);
    setActiveTab(tab);
    setOpen(true);
  }, []);

  const showListing = useCallback((listingId, tab = 'browse') => {
    setSelectedListingId(listingId);
    setActiveTab(tab);
    setOpen(true);
  }, []);

  const hideMarketplace = useCallback(() => {
    setOpen(false);
    setSelectedListingId(null);
  }, []);

  return (
    <MarketplaceModalContext.Provider value={{ showMarketplace, showListing, hideMarketplace, selectedListingId, activeTab }}>
      {children}
      <MarketplaceModal
        open={open}
        onClose={hideMarketplace}
        selectedListingId={selectedListingId}
        onSelectListing={setSelectedListingId}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
    </MarketplaceModalContext.Provider>
  );
};

export const useMarketplaceModal = () => {
  const ctx = useContext(MarketplaceModalContext);
  if (!ctx) {
    throw new Error('useMarketplaceModal must be used inside MarketplaceModalProvider');
  }
  return ctx;
};