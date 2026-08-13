import ListingSettings from '../../pages/marketplace/ListingSettings';

const ListingSettingsModal = ({ listingId, onClose, onBack }) => {
  return <ListingSettings id={listingId} onClose={onClose} onBack={onBack} />;
};

export default ListingSettingsModal;