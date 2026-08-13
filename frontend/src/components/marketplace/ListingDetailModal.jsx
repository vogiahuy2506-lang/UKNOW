import ListingDetail from '../../pages/marketplace/ListingDetail';

const ListingDetailModal = ({ listingId, onClose, onBack }) => {
  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <ListingDetail id={listingId} onClose={onClose} onAfterPurchase={onBack} />
    </div>
  );
};

export default ListingDetailModal;