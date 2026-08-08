import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineStar,
  HiOutlineEye,
  HiOutlineShoppingCart,
  HiOutlineHeart,
  HiOutlineArrowLeft,
  HiOutlineClock,
  HiOutlineUser,
  HiOutlineCheckCircle,
  HiOutlineSparkles,
  HiOutlineDownload,
  HiOutlineShare,
  HiOutlineFlag,
  HiOutlineChatAlt2,
  HiOutlineLightBulb,
  HiOutlineDocumentText,
  HiOutlineTag,
} from 'react-icons/hi';
import marketplaceService from '../../services/marketplace.service';

const RESOURCE_VISUAL = {
  campaign: {
    icon: '📧',
    gradient: 'from-orange-500 via-orange-400 to-amber-400',
    blob: 'bg-orange-200/40',
    label: 'Chiến dịch',
  },
  chatbot: {
    icon: '🤖',
    gradient: 'from-violet-500 via-fuchsia-400 to-pink-400',
    blob: 'bg-violet-200/40',
    label: 'Chatbot',
  },
};

const CATEGORY_LABELS = {
  marketing: 'Marketing',
  automation: 'Automation',
  support: 'Hỗ trợ khách hàng',
  sales: 'Bán hàng',
  onboarding: 'Onboarding',
};

const formatNumber = (n) => {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n ?? 0);
};

const formatDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '';
  }
};

const ListingDetail = ({ id: idProp, onClose, onAfterPurchase }) => {
  const params = useParams();
  const id = idProp ?? params.id;
  const navigate = useNavigate();

  const [listing, setListing] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [newReview, setNewReview] = useState({ rating: 5, reviewText: '' });

  useEffect(() => {
    fetchListing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchListing = async () => {
    setIsLoading(true);
    try {
      const response = await marketplaceService.getListing(id);
      setListing(response.data.data);
      setIsFavorited(false);
    } catch (error) {
      toast.error('Không thể tải thông tin template');
      if (!idProp) navigate('/app/marketplace');
      else if (onClose) onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const handlePurchase = async () => {
    setIsPurchasing(true);
    try {
      await marketplaceService.purchase(id);
      toast.success('Mua thành công! Template đã được thêm vào thư viện của bạn.');
      fetchListing();
      onAfterPurchase?.();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể mua template');
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleToggleFavorite = async () => {
    try {
      if (isFavorited) {
        await marketplaceService.removeFavorite(id);
        toast.success('Đã xóa khỏi yêu thích');
      } else {
        await marketplaceService.addFavorite(id);
        toast.success('Đã thêm vào yêu thích');
      }
      setIsFavorited(!isFavorited);
    } catch (error) {
      toast.error('Không thể cập nhật yêu thích');
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Đã sao chép liên kết');
    } catch {
      toast.error('Không thể sao chép liên kết');
    }
  };

  const renderStars = (rating, interactive = false, size = 'md') => {
    const sizeClass = size === 'lg' ? 'w-7 h-7' : 'w-5 h-5';
    return (
      <div className="inline-flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={!interactive}
            onClick={() => interactive && setNewReview((p) => ({ ...p, rating: star }))}
            className={`${interactive ? 'cursor-pointer hover:scale-110' : 'cursor-default'} transition-transform`}
            aria-label={`${star} sao`}
          >
            <HiOutlineStar
              className={`${sizeClass} ${
                star <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-300'
              }`}
            />
          </button>
        ))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-64 rounded-2xl bg-gradient-to-br from-orange-100 to-amber-50" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="h-40 bg-gray-100 rounded-2xl" />
            <div className="h-64 bg-gray-100 rounded-2xl" />
          </div>
          <div className="h-72 bg-gray-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!listing) return null;

  const visual = RESOURCE_VISUAL[listing.resource_type] || RESOURCE_VISUAL.chatbot;
  const rating = Math.round(listing.rating_avg || 0);
  const ratingText = typeof listing.rating_avg === 'number' ? listing.rating_avg.toFixed(1) : '0.0';
  const isFree = !(listing.price_credits > 0);

  return (
    <div className="space-y-6">
      {/* Back link (only when not in modal) */}
      {!idProp && (
        <Link
          to="/app/marketplace"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <HiOutlineArrowLeft className="w-4 h-4" />
          Quay lại Marketplace
        </Link>
      )}

      {/* Hero */}
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${visual.gradient} text-white`}>
        <div className={`absolute -top-20 -right-20 w-72 h-72 rounded-full ${visual.blob} blur-3xl`} />
        <div className={`absolute -bottom-16 -left-16 w-64 h-64 rounded-full ${visual.blob} blur-3xl`} />

        <div className="relative p-6 md:p-8">
          <div className="flex items-start gap-5">
            <div className="flex-shrink-0 w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-4xl md:text-5xl shadow-lg ring-1 ring-white/30">
              {visual.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/25 backdrop-blur-sm text-xs font-medium">
                  <HiOutlineSparkles className="w-3.5 h-3.5" />
                  {visual.label}
                </span>
                {listing.category && (
                  <span className="px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm text-xs font-medium">
                    {CATEGORY_LABELS[listing.category] || listing.category}
                  </span>
                )}
                {listing.hasPurchased && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/90 text-xs font-medium">
                    <HiOutlineCheckCircle className="w-3.5 h-3.5" />
                    Đã mua
                  </span>
                )}
              </div>
              <h1 className="text-2xl md:text-3xl font-bold leading-tight tracking-tight">
                {listing.title}
              </h1>
            </div>
          </div>

          {/* Quick stats */}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl bg-white/15 backdrop-blur-sm px-4 py-3 ring-1 ring-white/20">
              <div className="flex items-center gap-1.5 text-xs text-white/80">
                <HiOutlineEye className="w-3.5 h-3.5" />
                Lượt xem
              </div>
              <div className="mt-0.5 text-xl font-semibold">{formatNumber(listing.view_count || 0)}</div>
            </div>
            <div className="rounded-xl bg-white/15 backdrop-blur-sm px-4 py-3 ring-1 ring-white/20">
              <div className="flex items-center gap-1.5 text-xs text-white/80">
                <HiOutlineShoppingCart className="w-3.5 h-3.5" />
                Đã mua
              </div>
              <div className="mt-0.5 text-xl font-semibold">{formatNumber(listing.purchase_count || 0)}</div>
            </div>
            <div className="rounded-xl bg-white/15 backdrop-blur-sm px-4 py-3 ring-1 ring-white/20">
              <div className="flex items-center gap-1.5 text-xs text-white/80">
                <HiOutlineStar className="w-3.5 h-3.5" />
                Đánh giá
              </div>
              <div className="mt-0.5 text-xl font-semibold flex items-center gap-1.5">
                {ratingText}
                <span className="text-xs text-white/70 font-normal">({listing.rating_count || 0})</span>
              </div>
            </div>
            <div className="rounded-xl bg-white/15 backdrop-blur-sm px-4 py-3 ring-1 ring-white/20">
              <div className="flex items-center gap-1.5 text-xs text-white/80">
                <HiOutlineClock className="w-3.5 h-3.5" />
                Đăng ngày
              </div>
              <div className="mt-0.5 text-sm font-medium">{formatDate(listing.created_at)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Seller bar */}
          <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-white flex items-center justify-center font-semibold text-sm shadow-sm">
                {(listing.seller_name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500">Được tạo bởi</p>
                <p className="text-sm font-semibold text-gray-900 truncate">{listing.seller_name}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleToggleFavorite}
                className={`p-2.5 rounded-xl transition-all ${
                  isFavorited
                    ? 'bg-red-50 text-red-500 ring-1 ring-red-100'
                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100 ring-1 ring-gray-100'
                }`}
                aria-label="Yêu thích"
                title={isFavorited ? 'Bỏ yêu thích' : 'Thêm yêu thích'}
              >
                <HiOutlineHeart className={`w-5 h-5 ${isFavorited ? 'fill-red-500' : ''}`} />
              </button>
              <button
                onClick={handleShare}
                className="p-2.5 rounded-xl bg-gray-50 text-gray-500 hover:bg-gray-100 ring-1 ring-gray-100 transition-all"
                aria-label="Chia sẻ"
                title="Sao chép liên kết"
              >
                <HiOutlineShare className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Description */}
          <section className="rounded-2xl border border-gray-100 bg-white p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
                <HiOutlineDocumentText className="w-4 h-4" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Mô tả template</h2>
            </div>
            <p className="text-[15px] leading-relaxed text-gray-700 whitespace-pre-wrap">
              {listing.description || (
                <span className="text-gray-400 italic">Người bán chưa cung cấp mô tả cho template này.</span>
              )}
            </p>

            {listing.tags && listing.tags.length > 0 && (
              <div className="mt-5 pt-5 border-t border-gray-100">
                <div className="flex items-center gap-2 mb-3">
                  <HiOutlineTag className="w-4 h-4 text-gray-400" />
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Tags</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {listing.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 transition-colors"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Tips */}
          <section className="rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 p-5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-white text-blue-600 flex items-center justify-center shadow-sm flex-shrink-0">
                <HiOutlineLightBulb className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Mẹo sử dụng</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Sau khi mua, bạn có thể tùy chỉnh toàn bộ nội dung, hình ảnh và thông số của template trong workspace.
                  Hãy đảm bảo kiểm tra trước khi gửi tới khách hàng.
                </p>
              </div>
            </div>
          </section>

          {/* Reviews */}
          <section className="rounded-2xl border border-gray-100 bg-white p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <HiOutlineChatAlt2 className="w-4 h-4" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900">Đánh giá từ cộng đồng</h2>
              </div>
              <span className="text-xs text-gray-500">{listing.rating_count || 0} đánh giá</span>
            </div>

            {/* Rating summary */}
            <div className="flex flex-col sm:flex-row items-stretch gap-5 mb-6 p-5 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50">
              <div className="flex flex-col items-center justify-center sm:border-r sm:border-amber-200 sm:pr-5">
                <div className="text-4xl font-bold text-gray-900">{ratingText}</div>
                <div className="mt-1">{renderStars(rating, false, 'sm')}</div>
                <div className="mt-1 text-xs text-gray-500">{listing.rating_count || 0} lượt đánh giá</div>
              </div>
              <div className="flex-1 flex items-center text-sm text-gray-600">
                <HiOutlineSparkles className="w-4 h-4 mr-2 text-amber-500" />
                {listing.rating_count > 0
                  ? 'Đánh giá trung bình từ những người đã mua và sử dụng template.'
                  : 'Chưa có đánh giá nào. Hãy là người đầu tiên chia sẻ trải nghiệm!'}
              </div>
            </div>

            {/* Review form */}
            <div className="rounded-xl bg-gray-50 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Viết đánh giá của bạn</h3>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm text-gray-600">Chất lượng:</span>
                {renderStars(newReview.rating, true)}
              </div>
              <textarea
                value={newReview.reviewText}
                onChange={(e) => setNewReview((p) => ({ ...p, reviewText: e.target.value }))}
                placeholder="Chia sẻ trải nghiệm của bạn về template này..."
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all resize-none"
                rows={3}
              />
              <div className="mt-3 flex items-center justify-between">
                {listing.hasPurchased ? (
                  <p className="text-xs text-emerald-600 inline-flex items-center gap-1">
                    <HiOutlineCheckCircle className="w-3.5 h-3.5" />
                    Bạn đã mua template này
                  </p>
                ) : (
                  <p className="text-xs text-gray-500">
                    Bạn cần mua template trước để có thể gửi đánh giá
                  </p>
                )}
                <button
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  disabled={!listing.hasPurchased}
                >
                  Gửi đánh giá
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Sidebar — purchase card */}
        <aside className="lg:col-span-1">
          <div className="lg:sticky lg:top-6 space-y-4">
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              {/* Price */}
              <div className="text-center pb-5 border-b border-gray-100">
                {isFree ? (
                  <>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium mb-2">
                      <HiOutlineDownload className="w-3.5 h-3.5" />
                      Miễn phí
                    </div>
                    <div className="text-3xl font-bold text-emerald-600">Tải về ngay</div>
                    <p className="text-xs text-gray-500 mt-1">Không tốn credits</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-gray-500 mb-1">Giá</p>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-4xl font-bold text-gray-900">{listing.price_credits}</span>
                      <span className="text-base text-gray-500 font-medium">credits</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Một lần, dùng vĩnh viễn</p>
                  </>
                )}
              </div>

              {/* CTA */}
              <div className="pt-5">
                {listing.hasPurchased ? (
                  <div className="rounded-xl bg-emerald-50 text-emerald-700 p-4 text-center">
                    <HiOutlineCheckCircle className="w-7 h-7 mx-auto mb-2" />
                    <p className="text-sm font-semibold">Bạn đã sở hữu template này</p>
                    <p className="text-xs mt-1 text-emerald-600/80">Mở trong thư viện để sử dụng</p>
                  </div>
                ) : (
                  <button
                    onClick={handlePurchase}
                    disabled={isPurchasing}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 hover:bg-primary-600 text-white py-3 px-4 text-sm font-semibold disabled:bg-gray-300 transition-colors shadow-sm"
                  >
                    {isPurchasing ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Đang xử lý...
                      </>
                    ) : (
                      <>
                        {isFree ? (
                          <>
                            <HiOutlineDownload className="w-5 h-5" />
                            Tải miễn phí
                          </>
                        ) : (
                          <>
                            <HiOutlineShoppingCart className="w-5 h-5" />
                            Mua ngay
                          </>
                        )}
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Quick info list */}
              <ul className="mt-5 pt-5 border-t border-gray-100 space-y-2.5 text-sm text-gray-600">
                <li className="flex items-center gap-2.5">
                  <HiOutlineClock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-xs">
                    Đăng ngày <span className="font-medium text-gray-900">{formatDate(listing.created_at)}</span>
                  </span>
                </li>
                <li className="flex items-center gap-2.5">
                  <HiOutlineUser className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-xs truncate">
                    Tác giả <span className="font-medium text-gray-900">{listing.seller_name}</span>
                  </span>
                </li>
                <li className="flex items-center gap-2.5">
                  <HiOutlineEye className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-xs">
                    <span className="font-medium text-gray-900">{formatNumber(listing.view_count || 0)}</span> lượt xem
                  </span>
                </li>
                <li className="flex items-center gap-2.5">
                  <HiOutlineShoppingCart className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-xs">
                    <span className="font-medium text-gray-900">{formatNumber(listing.purchase_count || 0)}</span> lượt mua
                  </span>
                </li>
              </ul>
            </div>

            {/* Trust badge */}
            <div className="rounded-2xl border border-gray-100 bg-white p-4 text-center">
              <div className="w-9 h-9 mx-auto rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2">
                <HiOutlineCheckCircle className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-gray-900">Đã được kiểm duyệt</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Template đạt tiêu chuẩn cộng đồng UKNOW
              </p>
            </div>

            <button className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors py-2">
              <HiOutlineFlag className="w-3.5 h-3.5" />
              Báo cáo template này
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default ListingDetail;
