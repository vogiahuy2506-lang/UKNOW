import { HiOutlineStar, HiOutlineEye, HiOutlineShoppingCart, HiOutlineHeart } from 'react-icons/hi';
import { Link } from 'react-router-dom';

const CATEGORY_STYLES = {
  marketing: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Marketing' },
  automation: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Automation' },
  support: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Hỗ trợ' },
  default: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Khác' },
};

const TYPE_STYLES = {
  campaign: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Chiến dịch' },
  chatbot: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Chatbot' },
};

/**
 * ListingCard - Notion-style card for marketplace listings
 * Displays listing preview in grid or compact view
 */
const ListingCard = ({
  listing,
  view = 'grid',
  showActions = true,
  onFavorite,
  isFavorited = false,
}) => {
  const categoryStyle = CATEGORY_STYLES[listing.category] || CATEGORY_STYLES.default;
  const typeStyle = TYPE_STYLES[listing.resource_type] || TYPE_STYLES.campaign;

  const renderStars = (rating) => {
    const stars = [];
    const fullStars = Math.floor(rating || 0);
    for (let i = 0; i < 5; i++) {
      stars.push(
        <HiOutlineStar
          key={i}
          className={`w-3.5 h-3.5 ${i < fullStars ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`}
        />
      );
    }
    return stars;
  };

  if (view === 'list') {
    return (
      <div className="group flex items-center gap-4 p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all">
        {/* Icon */}
        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <span className="text-lg">📄</span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <Link
            to={`/app/marketplace/${listing.id}`}
            className="font-medium text-gray-900 hover:text-primary-600 line-clamp-1"
          >
            {listing.title}
          </Link>
          <p className="text-sm text-gray-500 line-clamp-1 mt-0.5">
            {listing.description || 'Không có mô tả'}
          </p>
        </div>

        {/* Badges */}
        <div className="hidden md:flex items-center gap-2 flex-shrink-0">
          <span className={`px-2 py-0.5 text-xs font-medium rounded ${categoryStyle.bg} ${categoryStyle.text}`}>
            {categoryStyle.label}
          </span>
          <span className={`px-2 py-0.5 text-xs font-medium rounded ${typeStyle.bg} ${typeStyle.text}`}>
            {typeStyle.label}
          </span>
        </div>

        {/* Rating */}
        <div className="hidden lg:flex items-center gap-1 flex-shrink-0 w-24">
          <div className="flex items-center">
            {renderStars(listing.rating_avg)}
          </div>
          <span className="text-xs text-gray-500 ml-1">({listing.rating_count || 0})</span>
        </div>

        {/* Stats */}
        <div className="hidden xl:flex items-center gap-4 text-sm text-gray-500 flex-shrink-0 w-32">
          <span className="flex items-center gap-1">
            <HiOutlineEye className="w-4 h-4" />
            {listing.view_count || 0}
          </span>
          <span className="flex items-center gap-1">
            <HiOutlineShoppingCart className="w-4 h-4" />
            {listing.purchase_count || 0}
          </span>
        </div>

        {/* Price */}
        <div className="flex-shrink-0 w-20 text-right">
          {listing.price_credits > 0 ? (
            <span className="text-amber-600 font-medium text-sm">{listing.price_credits} crd</span>
          ) : (
            <span className="text-green-600 font-medium text-sm">Miễn phí</span>
          )}
        </div>

        {/* Actions */}
        {showActions && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={(e) => {
                e.preventDefault();
                onFavorite?.(listing.id);
              }}
              className={`p-2 rounded-lg transition-colors ${
                isFavorited
                  ? 'text-red-500 bg-red-50'
                  : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
              }`}
            >
              <HiOutlineHeart className={`w-4 h-4 ${isFavorited ? 'fill-red-500' : ''}`} />
            </button>
            <Link
              to={`/app/marketplace/${listing.id}`}
              className="btn btn-sm btn-outline"
            >
              Xem
            </Link>
          </div>
        )}
      </div>
    );
  }

  // Grid view (default)
  return (
    <div className="group bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all overflow-hidden">
      {/* Card Header */}
      <div className="p-4">
        {/* Top row: badges */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <span className={`px-2 py-0.5 text-xs font-medium rounded ${categoryStyle.bg} ${categoryStyle.text}`}>
              {categoryStyle.label}
            </span>
            <span className={`px-2 py-0.5 text-xs font-medium rounded ${typeStyle.bg} ${typeStyle.text}`}>
              {typeStyle.label}
            </span>
          </div>
          {showActions && (
            <button
              onClick={(e) => {
                e.preventDefault();
                onFavorite?.(listing.id);
              }}
              className={`p-1.5 rounded-lg transition-colors ${
                isFavorited
                  ? 'text-red-500 bg-red-50'
                  : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
              }`}
            >
              <HiOutlineHeart className={`w-4 h-4 ${isFavorited ? 'fill-red-500' : ''}`} />
            </button>
          )}
        </div>

        {/* Title */}
        <Link
          to={`/app/marketplace/${listing.id}`}
          className="block font-semibold text-gray-900 hover:text-primary-600 line-clamp-2 mb-2"
        >
          {listing.title}
        </Link>

        {/* Description */}
        <p className="text-sm text-gray-500 line-clamp-2 mb-3">
          {listing.description || 'Không có mô tả'}
        </p>

        {/* Rating */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center">
            {renderStars(listing.rating_avg)}
          </div>
          <span className="text-xs text-gray-500">
            ({listing.rating_count || 0})
          </span>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <div className="text-sm">
            {listing.price_credits > 0 ? (
              <span className="text-amber-600 font-semibold">{listing.price_credits} credits</span>
            ) : (
              <span className="text-green-600 font-semibold">Miễn phí</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <HiOutlineEye className="w-3.5 h-3.5" />
              {listing.view_count || 0}
            </span>
            <span className="flex items-center gap-1">
              <HiOutlineShoppingCart className="w-3.5 h-3.5" />
              {listing.purchase_count || 0}
            </span>
          </div>
        </div>
      </div>

      {/* Seller footer */}
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
        <span className="text-xs text-gray-500">by {listing.seller_name}</span>
      </div>
    </div>
  );
};

export { CATEGORY_STYLES, TYPE_STYLES };
export default ListingCard;
