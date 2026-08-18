import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineStar,
  HiOutlineEye,
  HiOutlineShoppingCart,
  HiOutlineHeart,
  HiOutlineClock,
  HiOutlineUser,
  HiOutlineCheckCircle,
  HiOutlineDownload,
  HiOutlineShare,
  HiOutlineFlag,
  HiOutlineChatAlt2,
  HiOutlineLightBulb,
  HiOutlineDocumentText,
  HiOutlineTag,
  HiOutlineMail,
  HiOutlineChat,
  HiOutlineChevronLeft,
  HiThumbUp,
  HiStar,
} from 'react-icons/hi';
import marketplaceService from '../../services/marketplace.service';
import { useI18n } from '../../i18n';

const RESOURCE_VISUAL = {
  campaign: {
    Icon: HiOutlineMail,
    bg: 'bg-orange-100',
    text: 'text-orange-600',
    label: 'Chiến dịch',
  },
  chatbot: {
    Icon: HiOutlineChat,
    bg: 'bg-purple-100',
    text: 'text-purple-600',
    label: 'Chatbot',
  },
};

const CATEGORY_LABELS = {
  email: 'Email',
  zalo_personal: 'Zalo cá nhân',
  zalo_group: 'Zalo nhóm',
  facebook: 'Facebook',
  telegram: 'Telegram',
  sms: 'SMS',
  marketing: 'Marketing',
  automation: 'Automation',
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

const formatRelativeTime = (iso) => {
  if (!iso) return '';
  try {
    const now = new Date();
    const date = new Date(iso);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);

    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 7) return `${diffDays} ngày trước`;
    if (diffWeeks < 5) return `${diffWeeks} tuần trước`;
    if (diffMonths < 12) return `${diffMonths} tháng trước`;
    return formatDate(iso);
  } catch {
    return formatDate(iso);
  }
};

/**
 * Interactive 5-star rating component với hover effect
 */
const StarRating = ({ 
  rating, 
  onRate, 
  size = 'md',
  showLabel = false,
  allowHalf = false 
}) => {
  const [hoverRating, setHoverRating] = useState(0);
  const [hoverPosition, setHoverPosition] = useState('left');
  
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
    xl: 'w-8 h-8',
  };
  
  const activeSize = sizes[size] || sizes.md;
  
  const getStarFill = (starIndex) => {
    const currentRating = hoverRating || rating;
    if (currentRating >= starIndex) return 'fill-amber-400 text-amber-400';
    if (allowHalf && currentRating >= starIndex - 0.5) return 'fill-amber-400/50 text-amber-400';
    return 'text-gray-200';
  };
  
  const handleMouseMove = (e, starIndex) => {
    if (!onRate) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const halfWidth = rect.width / 2;
    setHoverPosition(x < halfWidth ? 'left' : 'right');
    setHoverRating(x < halfWidth ? starIndex - 0.5 : starIndex);
  };
  
  const handleMouseLeave = () => {
    setHoverRating(0);
  };
  
  const handleClick = (starIndex) => {
    if (!onRate) return;
    onRate(hoverPosition === 'left' ? starIndex - 0.5 : starIndex);
  };
  
  const displayRating = hoverRating || rating;
  
  return (
    <div className="inline-flex items-center gap-1">
      <div 
        className="flex items-center"
        onMouseLeave={handleMouseLeave}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={!onRate}
            onMouseMove={(e) => handleMouseMove(e, star)}
            onClick={() => handleClick(star)}
            className={`relative ${onRate ? 'cursor-pointer hover:scale-110 transition-transform' : 'cursor-default'} p-0.5 group`}
            title={!onRate ? `${star} sao` : `${star} sao - click để đánh giá`}
          >
            <HiStar className={`${activeSize} ${getStarFill(star)} transition-colors`} />
            {onRate && (
              <span className={`
                absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white
                transition-opacity
                ${hoverRating === star ? 'opacity-100' : 'opacity-0'}
              `}>
                {star}
              </span>
            )}
          </button>
        ))}
      </div>
      {showLabel && displayRating > 0 && (
        <span className="ml-2 text-sm font-semibold text-amber-600">
          {displayRating % 1 === 0.5 ? displayRating.toFixed(1) : displayRating}/5
        </span>
      )}
    </div>
  );
};

/**
 * Rating distribution bars (thanh phân bố đánh giá)
 */
const RatingDistribution = ({ reviews }) => {
  const distribution = [5, 4, 3, 2, 1].map(rating => {
    const count = reviews.filter(r => Math.round(r.rating) === rating).length;
    return { rating, count };
  });
  const total = reviews.length || 1;
  
  return (
    <div className="space-y-2">
      {distribution.map(({ rating, count }) => {
        const percentage = Math.round((count / total) * 100);
        return (
          <div key={rating} className="flex items-center gap-2 text-sm">
            <span className="w-3 text-gray-500 font-medium">{rating}</span>
            <HiStar className="w-3 h-3 text-amber-400 fill-amber-400" />
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-amber-400 rounded-full transition-all duration-500"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="w-10 text-right text-xs text-gray-500">{count}</span>
          </div>
        );
      })}
    </div>
  );
};

/**
 * Single review card
 */
const ReviewCard = ({ review, isOwnReview }) => {
  const [helpfulCount, setHelpfulCount] = useState(review.helpful_count || 0);
  const [hasVoted, setHasVoted] = useState(false);
  const [showFull, setShowFull] = useState(false);
  
  const handleVoteHelpful = async () => {
    if (hasVoted) return;
    setHelpfulCount(c => c + 1);
    setHasVoted(true);
    try {
      await marketplaceService.voteReviewHelpful(review.id);
    } catch {
      setHelpfulCount(c => c - 1);
      setHasVoted(false);
    }
  };
  
  const isLongReview = review.review_text?.length > 200;
  const displayText = isLongReview && !showFull 
    ? review.review_text?.slice(0, 200) + '...' 
    : review.review_text;
  
  return (
    <article className={`
      rounded-xl border p-4 transition-all
      ${isOwnReview 
        ? 'border-amber-200 bg-amber-50/50' 
        : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
      }
    `}>
      {isOwnReview && (
        <div className="flex items-center gap-1.5 mb-3 text-xs text-amber-600 font-medium">
          <HiOutlineCheckCircle className="w-3.5 h-3.5" />
          Đánh giá của bạn
        </div>
      )}
      
      <header className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 text-white flex items-center justify-center text-sm font-bold shadow-sm">
              {(review.reviewer_name || '?').charAt(0).toUpperCase()}
            </div>
            {review.is_verified_purchase && (
              <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center shadow-sm">
                <HiOutlineCheckCircle className="w-3 h-3 text-white" />
              </div>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {review.reviewer_name || 'Người dùng ẩn danh'}
            </p>
            <p className="text-xs text-gray-400">
              {formatRelativeTime(review.created_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <StarRating rating={review.rating} size="sm" />
        </div>
      </header>
      
      {review.review_text && (
        <div className="mb-3">
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {displayText}
          </p>
          {isLongReview && (
            <button
              onClick={() => setShowFull(!showFull)}
              className="mt-1 text-xs text-orange-500 hover:text-orange-600 font-medium"
            >
              {showFull ? 'Thu gọn' : 'Xem thêm'}
            </button>
          )}
        </div>
      )}
      
      {review.images && review.images.length > 0 && (
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
          {review.images.map((img, idx) => (
            <img
              key={idx}
              src={img}
              alt={`Review image ${idx + 1}`}
              className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
            />
          ))}
        </div>
      )}
      
      <footer className="flex items-center gap-4 pt-3 border-t border-gray-100">
        <button
          onClick={handleVoteHelpful}
          disabled={hasVoted || isOwnReview}
          className={`
            inline-flex items-center gap-1.5 text-xs transition-colors
            ${hasVoted 
              ? 'text-emerald-600' 
              : isOwnReview 
                ? 'text-gray-300 cursor-not-allowed' 
                : 'text-gray-400 hover:text-emerald-600'
            }
          `}
        >
          <HiThumbUp className={`w-3.5 h-3.5 ${hasVoted ? 'fill-emerald-600' : ''}`} />
          <span>Hữu ích ({helpfulCount})</span>
        </button>
      </footer>
    </article>
  );
};

/**
 * Review form với validation và animation
 */
const ReviewForm = ({ listingId, hasPurchased, onReviewSubmitted }) => {
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [charCount] = useState(500);
  const textareaRef = useRef(null);
  
  const handleSubmit = async () => {
    if (!hasPurchased) {
      toast.error('Bạn cần mua sản phẩm trước khi đánh giá');
      return;
    }
    if (rating < 1) {
      toast.error('Vui lòng chọn số sao đánh giá');
      return;
    }
    if (reviewText.length > 500) {
      toast.error('Đánh giá không được quá 500 ký tự');
      return;
    }
    
    setIsSubmitting(true);
    try {
      await marketplaceService.createReview(listingId, {
        rating,
        review_text: reviewText.trim(),
      });
      toast.success('Cảm ơn bạn! Đánh giá của bạn đã được gửi.');
      setRating(5);
      setReviewText('');
      setIsFocused(false);
      onReviewSubmitted?.();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể gửi đánh giá. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const ratingLabels = {
    1: 'Rất không hài lòng',
    2: 'Không hài lòng',
    3: 'Bình thường',
    4: 'Hài lòng',
    5: 'Rất hài lòng',
  };
  
  const displayRating = hoverRating || rating;
  
  return (
    <div className={`
      rounded-xl border-2 transition-all duration-300 overflow-hidden
      ${isFocused 
        ? 'border-orange-300 bg-orange-50/30 shadow-md' 
        : 'border-gray-200 bg-gray-50'
      }
    `}>
      <div className="p-4">
        <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <HiOutlineChatAlt2 className="w-4 h-4 text-orange-500" />
          Viết đánh giá của bạn
        </h3>
        
        {/* Rating selector */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-2">
            Đánh giá của bạn
          </label>
          <div className="flex items-center gap-3">
            <div 
              className="flex items-center gap-0.5"
              onMouseLeave={() => setHoverRating(0)}
            >
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onMouseEnter={() => setHoverRating(star)}
                  onClick={() => setRating(star)}
                  className="p-0.5 cursor-pointer hover:scale-110 transition-transform"
                >
                  <HiStar
                    className={`w-8 h-8 transition-colors ${
                      star <= displayRating
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-gray-200'
                    }`}
                  />
                </button>
              ))}
            </div>
            <span className="text-sm font-semibold text-amber-600 min-w-[120px]">
              {ratingLabels[Math.round(rating)] || 'Chọn số sao'}
            </span>
          </div>
        </div>
        
        {/* Review textarea */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-2">
            Chia sẻ trải nghiệm của bạn {reviewText.length > 0 && `(${reviewText.length}/${charCount})`}
          </label>
          <textarea
            ref={textareaRef}
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value.slice(0, charCount))}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Template này có chất lượng như thế nào? Bạn đã sử dụng nó ra sao? Điều gì bạn thích và không thích?"
            className="input resize-none transition-all focus:ring-2 focus:ring-orange-200"
            rows={4}
          />
          <div className="flex justify-between items-center mt-1.5">
            <p className={`text-xs ${reviewText.length > charCount * 0.9 ? 'text-orange-500' : 'text-gray-400'}`}>
              {charCount - reviewText.length} ký tự còn lại
            </p>
          </div>
        </div>
        
        {/* Quick rating tips */}
        <div className={`
          grid grid-cols-2 gap-2 mb-4 transition-all duration-300
          ${isFocused ? 'opacity-100 max-h-20' : 'opacity-0 max-h-0 overflow-hidden'}
        `}>
          {['Dễ sử dụng', 'Đầy đủ tính năng', 'Hỗ trợ tốt', 'Giá cả hợp lý'].map((tip) => (
            <button
              key={tip}
              type="button"
              onClick={() => setReviewText(prev => prev ? `${prev} ${tip}.` : `${tip}.`)}
              className="px-2 py-1 text-xs bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-600 transition-colors"
            >
              + {tip}
            </button>
          ))}
        </div>
        
        {/* Submit button */}
        <div className="flex items-center justify-between">
          <div className={`flex items-center gap-1.5 text-sm ${
            hasPurchased ? 'text-emerald-600' : 'text-gray-400'
          }`}>
            <HiOutlineCheckCircle className="w-4 h-4" />
            {hasPurchased ? 'Đã xác nhận mua hàng' : 'Cần mua để đánh giá'}
          </div>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !hasPurchased || rating < 1}
            className={`
              px-5 py-2 rounded-lg text-sm font-semibold transition-all
              ${isSubmitting || !hasPurchased || rating < 1
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:shadow-lg hover:scale-105'
              }
            `}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Đang gửi...
              </span>
            ) : (
              'Gửi đánh giá'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Reviews section với đầy đủ UI
 */
const ReviewsSection = ({ listingId, listing, reviews, onReviewSubmitted }) => {
  const [sortBy, setSortBy] = useState('newest');
  const [filterRating, setFilterRating] = useState(0);
  const [visibleCount, setVisibleCount] = useState(5);
  
  // Sort reviews
  const sortedReviews = [...reviews].sort((a, b) => {
    switch (sortBy) {
      case 'newest':
        return new Date(b.created_at) - new Date(a.created_at);
      case 'oldest':
        return new Date(a.created_at) - new Date(b.created_at);
      case 'highest':
        return b.rating - a.rating;
      case 'lowest':
        return a.rating - b.rating;
      case 'helpful':
        return (b.helpful_count || 0) - (a.helpful_count || 0);
      default:
        return 0;
    }
  });
  
  // Filter reviews
  const filteredReviews = filterRating > 0
    ? sortedReviews.filter(r => Math.round(r.rating) === filterRating)
    : sortedReviews;
  
  const displayedReviews = filteredReviews.slice(0, visibleCount);
  
  const ratingStats = {
    average: listing?.rating_avg || 0,
    count: listing?.rating_count || 0,
    distribution: [5, 4, 3, 2, 1].map(rating => ({
      rating,
      count: reviews.filter(r => Math.round(r.rating) === rating).length,
      percentage: reviews.length > 0 
        ? Math.round((reviews.filter(r => Math.round(r.rating) === rating).length / reviews.length) * 100)
        : 0,
    })),
  };
  
  return (
    <section className="card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-100 to-orange-100 text-orange-600 flex items-center justify-center">
            <HiOutlineChatAlt2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Đánh giá từ cộng đồng</h2>
            <p className="text-xs text-gray-500">{ratingStats.count || 0} đánh giá</p>
          </div>
        </div>
      </div>
      
      {/* Rating summary card */}
      <div className="mb-6 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 p-5 border border-amber-100">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Average rating */}
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-5xl font-bold text-gray-900">{Number(ratingStats.average || 0).toFixed(1)}</div>
              <div className="mt-1">
                <StarRating rating={Number(ratingStats.average || 0)} size="lg" />
              </div>
              <p className="mt-1 text-sm text-gray-500">{(ratingStats.count || 0)} đánh giá</p>
            </div>
          </div>
          
          {/* Distribution bars */}
          <div>
            <RatingDistribution reviews={reviews} />
          </div>
        </div>
        
        {/* Filter & sort */}
        <div className="mt-5 pt-4 border-t border-amber-200/50 flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-gray-600">Lọc theo:</span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterRating(0)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filterRating === 0
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              Tất cả
            </button>
            {[5, 4, 3, 2, 1].map((rating) => (
              <button
                key={rating}
                onClick={() => setFilterRating(filterRating === rating ? 0 : rating)}
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filterRating === rating
                    ? 'bg-amber-500 text-white'
                    : 'bg-white text-gray-600 hover:bg-amber-50'
                }`}
              >
                <span>{rating}</span>
                <HiStar className="w-3 h-3 text-amber-400 fill-amber-400" />
              </button>
            ))}
          </div>
          
          <span className="ml-auto text-xs font-medium text-gray-600">Sắp xếp:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-1 rounded-full text-xs font-medium bg-white border border-gray-200 text-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-200"
          >
            <option value="newest">Mới nhất</option>
            <option value="oldest">Cũ nhất</option>
            <option value="highest">Cao nhất</option>
            <option value="lowest">Thấp nhất</option>
            <option value="helpful">Hữu ích nhất</option>
          </select>
        </div>
      </div>
      
      {/* Reviews list */}
      {displayedReviews.length > 0 ? (
        <div className="space-y-4 mb-6">
          {displayedReviews.map((review) => (
            <ReviewCard 
              key={review.id} 
              review={review}
              isOwnReview={review.is_own}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-10 mb-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
            <HiOutlineChatAlt2 className="w-8 h-8 text-gray-300" />
          </div>
          <p className="text-gray-500">
            {filterRating > 0 
              ? `Không có đánh giá ${filterRating} sao nào.` 
              : 'Chưa có đánh giá nào. Hãy là người đầu tiên!'
            }
          </p>
        </div>
      )}
      
      {/* Load more */}
      {visibleCount < filteredReviews.length && (
        <div className="text-center mb-6">
          <button
            onClick={() => setVisibleCount(c => c + 5)}
            className="px-6 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Xem thêm {filteredReviews.length - visibleCount} đánh giá
          </button>
        </div>
      )}
      
      {/* Review form */}
      <ReviewForm 
        listingId={listingId}
        hasPurchased={listing?.hasPurchased}
        onReviewSubmitted={onReviewSubmitted}
      />
    </section>
  );
};

const ListingDetail = ({ id: idProp, onClose, onAfterPurchase }) => {
  const params = useParams();
  const id = idProp ?? params.id;
  const navigate = useNavigate();
  const t = useI18n('marketplace');

  const [listing, setListing] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [reviews, setReviews] = useState([]);
  const authedFavorites = typeof window !== 'undefined' && !!localStorage.getItem('accessToken');

  const abortControllerRef = useRef(null);

  useEffect(() => {
    setIsFavorited(false);
    setReviews([]);
    if (id) {
      fetchListing();
      fetchReviews();
    }
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchReviews = async () => {
    if (!id) return;
    try {
      const res = await marketplaceService.getReviews(id, { limit: 50 });
      setReviews(Array.isArray(res.data.data) ? res.data.data : []);
    } catch {
      setReviews([]);
    }
  };

  const fetchListing = async () => {
    if (!id) {
      setIsLoading(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    try {
      const response = await marketplaceService.getListing(id, {
        signal: abortControllerRef.current.signal
      });
      setListing(response.data.data);

      if (authedFavorites) {
        marketplaceService.checkFavorite(id)
          .then((res) => {
            if (res?.data?.data) {
              setIsFavorited(!!res.data.data.isFavorited);
            }
          })
          .catch(() => {});
      }
    } catch (error) {
      if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
        setIsLoading(false);
        return;
      }
      toast.error(t('detail.loadError'));
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
      toast.success(t('detail.purchaseSuccess'));
      fetchListing();
      onAfterPurchase?.();
    } catch (error) {
      const errorCode = error.code || error.response?.data?.code;
      const errorMessage = error.response?.data?.message || error.message || t('detail.purchaseError');
      if (errorCode === 'CAMPAIGN_LIMIT_EXCEEDED') {
        toast.error(t('detail.campaignLimitExceeded'));
      } else if (errorCode === 'INSUFFICIENT_CREDITS') {
        toast.error(errorMessage);
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleToggleFavorite = async () => {
    try {
      if (isFavorited) {
        await marketplaceService.removeFavorite(id);
        toast.success(t('detail.favoriteRemoveSuccess'));
      } else {
        await marketplaceService.addFavorite(id);
        toast.success(t('detail.favoriteAddSuccess'));
      }
      setIsFavorited(!isFavorited);
    } catch (error) {
      toast.error(t('detail.favoriteError'));
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(t('detail.copyLinkSuccess'));
    } catch {
      toast.error(t('detail.copyLinkError'));
    }
  };

  const handleReviewSubmitted = () => {
    fetchListing();
    fetchReviews();
  };

  if (isLoading) {
    return (
      <div className="space-y-5 p-6 animate-pulse">
        <div className="h-32 bg-gray-100 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            <div className="h-32 bg-gray-100 rounded-xl" />
            <div className="h-48 bg-gray-100 rounded-xl" />
          </div>
          <div className="h-56 bg-gray-100 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!listing) return null;

  const visual = RESOURCE_VISUAL[listing.resource_type] || RESOURCE_VISUAL.campaign;
  const TypeIcon = visual.Icon;
  const ratingText = typeof listing.rating_avg === 'number' && listing.rating_avg > 0 
    ? listing.rating_avg.toFixed(1) 
    : null;
  const isFree = !(listing.price_credits > 0);

  return (
    <div className="min-h-full bg-gray-50">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <HiOutlineChevronLeft className="w-4 h-4" />
              Quay lại
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleFavorite}
                className={`p-2 rounded-lg transition-colors ${
                  isFavorited ? 'text-red-500 bg-red-50' : 'text-gray-500 hover:bg-gray-100'
                }`}
                title={isFavorited ? 'Bỏ yêu thích' : 'Yêu thích'}
              >
                <HiOutlineHeart className={`w-5 h-5 ${isFavorited ? 'fill-red-500' : ''}`} />
              </button>
              <button
                onClick={handleShare}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                title="Chia sẻ"
              >
                <HiOutlineShare className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className={`w-14 h-14 rounded-xl ${visual.bg} ${visual.text} flex items-center justify-center`}>
              <TypeIcon className="w-7 h-7" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium ${visual.bg} ${visual.text}`}>
                  {visual.label}
                </span>
                {listing.category && (
                  <span className="px-2.5 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700">
                    {CATEGORY_LABELS[listing.category] || listing.category}
                  </span>
                )}
                {listing.hasPurchased && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-emerald-100 text-emerald-700">
                    <HiOutlineCheckCircle className="w-3.5 h-3.5" />
                    Đã mua
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold text-gray-900 leading-tight">{listing.title}</h1>
            </div>
          </div>

          {/* Quick stats */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border border-gray-100 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <HiOutlineEye className="w-3.5 h-3.5" />
                Lượt xem
              </div>
              <div className="mt-1 text-base font-bold text-gray-900">{formatNumber(listing.view_count || 0)}</div>
            </div>
            <div className="rounded-lg border border-gray-100 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <HiOutlineShoppingCart className="w-3.5 h-3.5" />
                Lượt mua
              </div>
              <div className="mt-1 text-base font-bold text-gray-900">{formatNumber(listing.purchase_count || 0)}</div>
            </div>
            <div className="rounded-lg border border-gray-100 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <HiOutlineStar className="w-3.5 h-3.5" />
                Đánh giá
              </div>
              <div className="mt-1 text-base font-bold text-gray-900 flex items-center gap-1.5">
                {ratingText ? (
                  <>
                    {ratingText}
                    <span className="text-xs text-gray-400 font-normal">({listing.rating_count || 0})</span>
                  </>
                ) : (
                  <span className="text-xs text-gray-400">Chưa có đánh giá</span>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-gray-100 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <HiOutlineClock className="w-3.5 h-3.5" />
                Đăng ngày
              </div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{formatDate(listing.created_at)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-5">
            {/* Seller */}
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-orange-500 text-white flex items-center justify-center font-bold">
                    {(listing.seller_name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Được tạo bởi</p>
                    <p className="text-sm font-bold text-gray-900">{listing.seller_name}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Description */}
            <section className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
                  <HiOutlineDocumentText className="w-4 h-4" />
                </div>
                <h2 className="text-base font-bold text-gray-900">Mô tả template</h2>
              </div>
              <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
                {listing.description || (
                  <span className="text-gray-400 italic">Người bán chưa cung cấp mô tả.</span>
                )}
              </p>

              {listing.tags && listing.tags.length > 0 && (
                <div className="mt-5 pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-2 mb-3">
                    <HiOutlineTag className="w-4 h-4 text-gray-400" />
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tags</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {listing.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Tips */}
            <section className="rounded-xl p-4 border border-blue-100 bg-blue-50">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-white text-blue-600 flex items-center justify-center flex-shrink-0">
                  <HiOutlineLightBulb className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 mb-1">Mẹo sử dụng</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Sau khi mua, bạn có thể tùy chỉnh nội dung, hình ảnh và thông số của template trong workspace của mình.
                  </p>
                </div>
              </div>
            </section>

            {/* Reviews - sử dụng component mới */}
            <ReviewsSection 
              listingId={id}
              listing={listing}
              reviews={reviews}
              onReviewSubmitted={handleReviewSubmitted}
            />
          </div>

          {/* Right sidebar */}
          <aside className="lg:col-span-1">
            <div className="space-y-4">
              {/* Purchase card */}
              <div className="card overflow-hidden">
                <div className="p-5 text-center border-b border-gray-100">
                  {isFree ? (
                    <>
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold mb-3">
                        <HiOutlineDownload className="w-4 h-4" />
                        Miễn phí
                      </div>
                      <div className="text-3xl font-bold text-emerald-600">Tải về ngay</div>
                      <p className="text-xs text-gray-500 mt-1">Không tốn credits</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-gray-500 mb-2">Giá</p>
                      <div className="flex items-baseline justify-center gap-1.5">
                        <span className="text-4xl font-bold text-gray-900">{listing.price_credits}</span>
                        <span className="text-base text-gray-500 font-medium">credits</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">Dùng vĩnh viễn</p>
                    </>
                  )}
                </div>

                <div className="p-5">
                  {listing.hasPurchased ? (
                    <div className="rounded-lg bg-emerald-50 text-emerald-700 p-4 text-center">
                      <HiOutlineCheckCircle className="w-8 h-8 mx-auto mb-2" />
                      <p className="text-sm font-bold">Bạn đã sở hữu template này</p>
                    </div>
                  ) : (
                    <button
                      onClick={handlePurchase}
                      disabled={isPurchasing}
                      className="btn btn-primary w-full py-2.5"
                    >
                      {isPurchasing ? (
                        <>
                          <span className="spinner w-4 h-4 mr-2" />
                          Đang xử lý...
                        </>
                      ) : isFree ? (
                        <>
                          <HiOutlineDownload className="w-4 h-4 mr-2" />
                          Tải miễn phí
                        </>
                      ) : (
                        <>
                          <HiOutlineShoppingCart className="w-4 h-4 mr-2" />
                          Mua ngay
                        </>
                      )}
                    </button>
                  )}
                </div>

                <ul className="px-5 pb-5 space-y-2.5 text-sm">
                  <li className="flex items-center gap-2.5 text-gray-600">
                    <HiOutlineClock className="w-4 h-4 text-gray-400" />
                    <span>Đăng <span className="font-semibold text-gray-900">{formatDate(listing.created_at)}</span></span>
                  </li>
                  <li className="flex items-center gap-2.5 text-gray-600">
                    <HiOutlineUser className="w-4 h-4 text-gray-400" />
                    <span className="truncate">Tác giả <span className="font-semibold text-gray-900">{listing.seller_name}</span></span>
                  </li>
                  <li className="flex items-center gap-2.5 text-gray-600">
                    <HiOutlineEye className="w-4 h-4 text-gray-400" />
                    <span><span className="font-semibold text-gray-900">{formatNumber(listing.view_count || 0)}</span> lượt xem</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-gray-600">
                    <HiOutlineShoppingCart className="w-4 h-4 text-gray-400" />
                    <span><span className="font-semibold text-gray-900">{formatNumber(listing.purchase_count || 0)}</span> lượt mua</span>
                  </li>
                </ul>
              </div>

              {/* Trust badge */}
              <div className="card p-4 text-center">
                <div className="w-10 h-10 mx-auto rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2">
                  <HiOutlineCheckCircle className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-gray-900">Đã kiểm duyệt</p>
                <p className="text-xs text-gray-500 mt-1">Template đạt chuẩn UKNOW</p>
              </div>

              <button className="w-full text-gray-400 hover:text-gray-600 py-2 text-sm inline-flex items-center justify-center gap-1.5">
                <HiOutlineFlag className="w-4 h-4" />
                Báo cáo template
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default ListingDetail;
