/**
 * Skeleton loader components for various UI patterns
 */

export const Skeleton = ({ className = '', variant = 'text' }) => {
  const baseClasses = 'animate-pulse bg-gray-200 rounded';
  
  const variantClasses = {
    text: 'h-4 w-full',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
    avatar: 'w-10 h-10 rounded-full',
    card: 'h-24 w-full rounded-xl',
    button: 'h-10 w-24 rounded-lg',
  };

  return (
    <div className={`${baseClasses} ${variantClasses[variant] || variantClasses.text} ${className}`} />
  );
};

export const SkeletonText = ({ lines = 3, className = '' }) => {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={i === lines - 1 ? 'w-3/4' : 'w-full'}
        />
      ))}
    </div>
  );
};

export const SkeletonCard = ({ className = '' }) => {
  return (
    <div className={`bg-white rounded-xl p-4 border border-gray-100 ${className}`}>
      <div className="flex items-center gap-3 mb-3">
        <Skeleton variant="avatar" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <SkeletonText lines={2} />
    </div>
  );
};

export const SkeletonList = ({ count = 5, className = '' }) => {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
};

export const SkeletonTable = ({ columns = 4, rows = 5, className = '' }) => {
  return (
    <div className={`bg-white rounded-xl border border-gray-100 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex gap-4 px-4 py-3 border-b border-gray-100 bg-gray-50">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 px-4 py-3 border-b border-gray-50 last:border-0">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
};

export const SkeletonChatBubble = ({ isOwn = false, className: _className = '' }) => {
  return (
    <div className={`flex mb-3 ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] ${isOwn ? 'order-2' : 'order-1'}`}>
        <div className={`px-4 py-2.5 rounded-2xl ${isOwn ? 'bg-gray-100' : 'bg-primary-100'}`}>
          <Skeleton className="h-4 w-32 mb-1" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
    </div>
  );
};

export const SkeletonChatThread = ({ count = 5, className = '' }) => {
  return (
    <div className={`p-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonChatBubble key={i} isOwn={i % 2 === 0} />
      ))}
    </div>
  );
};

export const LoadingSpinner = ({ size = 'md', className = '' }) => {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };

  return (
    <div
      className={`${sizes[size]} border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin ${className}`}
    />
  );
};

export const LoadingOverlay = ({ message = 'Đang tải...', className = '' }) => {
  return (
    <div className={`absolute inset-0 flex flex-col items-center justify-center bg-white/80 z-10 ${className}`}>
      <LoadingSpinner size="lg" className="mb-3" />
      <p className="text-gray-500 text-sm">{message}</p>
    </div>
  );
};

export default Skeleton;
