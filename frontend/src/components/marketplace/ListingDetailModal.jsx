import { useNavigate } from 'react-router-dom';
import { HiOutlineArrowLeft, HiOutlineX } from 'react-icons/hi';
import ListingDetail from '../../pages/marketplace/ListingDetail';

const ListingDetailModal = ({ listingId, onClose, onBack }) => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full bg-white">
      <header className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-gray-100 bg-white">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <HiOutlineArrowLeft className="w-4 h-4" />
          Quay lại Marketplace
        </button>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
          aria-label="Đóng"
        >
          <HiOutlineX className="w-5 h-5" />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <ListingDetail
            id={listingId}
            onClose={onClose}
            onAfterPurchase={() => navigate(0)}
          />
        </div>
      </div>
    </div>
  );
};

export default ListingDetailModal;