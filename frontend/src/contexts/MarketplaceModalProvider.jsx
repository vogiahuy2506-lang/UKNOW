import { useState, useCallback } from 'react';
import MarketplaceModal from '../components/marketplace/MarketplaceModal';
import { MarketplaceModalContext } from './MarketplaceModalContext.js';

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
