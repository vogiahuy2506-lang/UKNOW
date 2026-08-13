/* eslint-disable react-refresh/only-export-components */
import { HiOutlineStar, HiOutlineEye, HiOutlineShoppingCart, HiOutlineHeart, HiOutlineClock, HiOutlineMail, HiOutlineChat, HiOutlineTemplate } from 'react-icons/hi';

export const CATEGORY_STYLES = {
  email: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Email' },
  zalo_personal: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Zalo cá nhân' },
  zalo_group: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Zalo nhóm' },
  facebook: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Facebook' },
  telegram: { bg: 'bg-sky-100', text: 'text-sky-700', label: 'Telegram' },
  sms: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'SMS' },
  automation: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Automation' },
  default: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Khác' },
};

export const TYPE_STYLES = {
  campaign: { bg: 'bg-orange-50', text: 'text-orange-600', label: 'Chiến dịch', Icon: HiOutlineMail },
  chatbot: { bg: 'bg-purple-50', text: 'text-purple-600', label: 'Chatbot', Icon: HiOutlineChat },
};

const formatNumber = (n) => {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n ?? 0);
};

const renderStars = (rating) => {
  const fullStars = Math.floor(rating || 0);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <HiOutlineStar
          key={star}
          className={`w-3.5 h-3.5 ${star <= fullStars ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`}
        />
      ))}
    </div>
  );
};

const defaultLabels = {
  free: 'Miễn phí',
  creditsShort: 'credits',
  favoriteAria: 'Yêu thích',
  noDescription: 'Không có mô tả',
  viewLabel: 'Xem chi tiết',
};

const ListingCard = ({
  listing,
  view = 'grid',
  isFavorited = false,
  onFavorite,
  onClick,
  labels = {},
}) => {
  const categoryStyle = CATEGORY_STYLES[listing.category] || CATEGORY_STYLES.default;
  const typeStyle = TYPE_STYLES[listing.resource_type] || TYPE_STYLES.campaign;
  const TypeIcon = typeStyle.Icon || HiOutlineTemplate;
  const l = { ...defaultLabels, ...labels };

  const handleCardClick = (e) => {
    if (!onClick) return;
    e?.preventDefault();
    e?.stopPropagation();
    onClick(listing.id, e);
  };

  const handleFavoriteClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onFavorite?.(listing.id, e);
  };

  // Grid view
  if (view === 'grid') {
    return (
      <div
        className="group bg-white rounded-xl overflow-hidden border border-gray-200 hover:border-orange-200 hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col"
        onClick={onClick ? handleCardClick : undefined}
      >
        {/* Header */}
        <div className="p-5 bg-gradient-to-br from-gray-50 to-white flex flex-col flex-1">
          {/* Type & Category badges */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg ${typeStyle.bg} ${typeStyle.text}`}>
                <TypeIcon className="w-3.5 h-3.5" />
                {typeStyle.label}
              </span>
              {listing.category && listing.category !== listing.resource_type && (
                <span className={`px-2 py-0.5 text-xs font-medium rounded-md ${categoryStyle.bg} ${categoryStyle.text}`}>
                  {categoryStyle.label}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleFavoriteClick}
              className={`p-2 rounded-lg transition-colors ${
                isFavorited
                  ? 'text-red-500 bg-red-50 hover:bg-red-100'
                  : 'text-gray-400 bg-white/80 hover:text-red-500 hover:bg-red-50'
              }`}
              aria-label={l.favoriteAria}
            >
              <HiOutlineHeart className={`w-4 h-4 ${isFavorited ? 'fill-red-500' : ''}`} />
            </button>
          </div>

          {/* Title */}
          <h3 className="font-semibold text-gray-900 line-clamp-2 mb-2 group-hover:text-orange-600 transition-colors">
            {listing.title}
          </h3>

          {/* Description */}
          <p className="text-sm text-gray-500 line-clamp-2 flex-1">
            {listing.description || l.noDescription}
          </p>

          {/* Rating - pushed to bottom */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
            {renderStars(listing.rating_avg)}
            <span className="text-xs text-gray-500">
              {typeof listing.rating_avg === 'number' ? listing.rating_avg.toFixed(1) : '0.0'}
              <span className="ml-1">({listing.rating_count || 0})</span>
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-gray-50 border-t border-gray-100">
          <div className="flex items-center justify-between">
            {/* Stats */}
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <HiOutlineEye className="w-3.5 h-3.5" />
                {formatNumber(listing.view_count || 0)}
              </span>
              <span className="flex items-center gap-1">
                <HiOutlineShoppingCart className="w-3.5 h-3.5" />
                {formatNumber(listing.purchase_count || 0)}
              </span>
            </div>

            {/* Price */}
            <div className="text-sm font-semibold">
              {listing.price_credits > 0 ? (
                <span className="text-orange-600">{listing.price_credits} {l.creditsShort}</span>
              ) : (
                <span className="text-emerald-600">{l.free}</span>
              )}
            </div>
          </div>

          {/* Seller & Date */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
            <span className="text-xs text-gray-400">
              {listing.seller_name || 'Người dùng ẩn danh'}
            </span>
            {listing.created_at && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <HiOutlineClock className="w-3 h-3" />
                {new Date(listing.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: 'short' })}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div
      className="p-4 bg-white hover:bg-gray-50 transition-colors cursor-pointer border-b border-gray-100 last:border-b-0"
      onClick={onClick ? handleCardClick : undefined}
    >
      <div className="flex items-center gap-4">
        {/* Icon */}
        <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${typeStyle.bg} ${typeStyle.text}`}>
          <TypeIcon className="w-6 h-6" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 text-xs font-medium rounded ${typeStyle.bg} ${typeStyle.text}`}>
              {typeStyle.label}
            </span>
            {listing.category && listing.category !== listing.resource_type && (
              <span className={`px-2 py-0.5 text-xs font-medium rounded ${categoryStyle.bg} ${categoryStyle.text}`}>
                {categoryStyle.label}
              </span>
            )}
          </div>
          <h3 className="font-semibold text-gray-900 line-clamp-1 group-hover:text-orange-600 transition-colors">
            {listing.title}
          </h3>
          <p className="text-sm text-gray-500 line-clamp-1 mt-0.5">
            {listing.description || l.noDescription}
          </p>
        </div>

        {/* Rating */}
        <div className="hidden md:flex flex-col items-center gap-1 flex-shrink-0 w-24">
          <div className="flex items-center">{renderStars(listing.rating_avg)}</div>
          <span className="text-xs text-gray-500">
            {typeof listing.rating_avg === 'number' ? listing.rating_avg.toFixed(1) : '0.0'} ({listing.rating_count || 0})
          </span>
        </div>

        {/* Stats */}
        <div className="hidden lg:flex items-center gap-4 text-sm text-gray-500 flex-shrink-0">
          <span className="flex items-center gap-1">
            <HiOutlineEye className="w-4 h-4" />
            {formatNumber(listing.view_count || 0)}
          </span>
          <span className="flex items-center gap-1">
            <HiOutlineShoppingCart className="w-4 h-4" />
            {formatNumber(listing.purchase_count || 0)}
          </span>
        </div>

        {/* Price */}
        <div className="w-28 text-right flex-shrink-0">
          {listing.price_credits > 0 ? (
            <span className="text-orange-600 font-semibold text-sm">
              {listing.price_credits} {l.creditsShort}
            </span>
          ) : (
            <span className="text-emerald-600 font-semibold text-sm">{l.free}</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleFavoriteClick}
            className={`p-2 rounded-lg transition-colors ${
              isFavorited
                ? 'text-red-500 bg-red-50'
                : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
            }`}
            aria-label={l.favoriteAria}
          >
            <HiOutlineHeart className={`w-5 h-5 ${isFavorited ? 'fill-red-500' : ''}`} />
          </button>
          <button
            onClick={handleCardClick}
            className="btn btn-sm btn-outline"
          >
            {l.viewLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ListingCard;
