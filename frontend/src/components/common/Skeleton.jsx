const Skeleton = ({ className = '', variant = 'text' }) => {
  const baseClasses = 'animate-pulse bg-gray-200';

  const variants = {
    text: 'h-4 rounded',
    title: 'h-6 rounded',
    avatar: 'w-12 h-12 rounded-full',
    thumbnail: 'w-full h-48 rounded-xl',
    card: 'w-full h-64 rounded-xl',
    button: 'h-10 w-24 rounded-lg',
  };

  return (
    <div className={`${baseClasses} ${variants[variant] || variants.text} ${className}`} />
  );
};

export const ListingCardSkeleton = () => (
  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
    <div className="p-4">
      <div className="flex items-start justify-between mb-3">
        <Skeleton className="w-20 h-6" variant="text" />
        <Skeleton className="w-16 h-4" variant="text" />
      </div>
      <Skeleton className="h-5 w-3/4 mb-2" variant="text" />
      <Skeleton className="h-4 w-full mb-1" variant="text" />
      <Skeleton className="h-4 w-2/3 mb-3" variant="text" />
      <Skeleton className="w-24 h-5" variant="text" />
      <div className="flex items-center justify-between mt-4">
        <Skeleton className="w-24 h-4" variant="text" />
        <Skeleton className="w-24 h-8 rounded-lg" variant="button" />
      </div>
    </div>
  </div>
);

export const ListingDetailSkeleton = () => (
  <div className="max-w-4xl mx-auto">
    <Skeleton className="h-8 w-64 mb-4" variant="title" />
    <div className="bg-white rounded-xl p-6">
      <div className="flex items-center gap-4 mb-6">
        <Skeleton className="w-12 h-12 rounded-full" variant="avatar" />
        <div>
          <Skeleton className="h-5 w-32 mb-2" variant="text" />
          <Skeleton className="h-4 w-24" variant="text" />
        </div>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" variant="text" />
        <Skeleton className="h-4 w-full" variant="text" />
        <Skeleton className="h-4 w-3/4" variant="text" />
      </div>
    </div>
  </div>
);

export const TableSkeleton = ({ rows = 5, columns = 4 }) => (
  <div className="bg-white rounded-xl overflow-hidden">
    <div className="border-b border-gray-200 px-4 py-3">
      <div className="flex gap-4">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" variant="text" />
        ))}
      </div>
    </div>
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <div key={rowIndex} className="border-b border-gray-100 px-4 py-4">
        <div className="flex gap-4">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-4 flex-1" variant="text" />
          ))}
        </div>
      </div>
    ))}
  </div>
);

export const AccountListSkeleton = ({ count = 2 }) => (
  <div className="space-y-4" data-testid="account-list-skeleton">
    {Array.from({ length: count }).map((_, idx) => (
      <div key={idx} className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <Skeleton className="w-11 h-11 rounded-2xl" variant="avatar" />
            <div className="space-y-1.5">
              <Skeleton className="w-36 h-4" variant="text" />
              <div className="flex gap-2">
                <Skeleton className="w-16 h-4 rounded-full" variant="text" />
                <Skeleton className="w-20 h-4 rounded-full" variant="text" />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="w-24 h-8 rounded-xl" variant="button" />
            <Skeleton className="w-8 h-8 rounded-xl" variant="button" />
          </div>
        </div>
        <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <Skeleton className="w-48 h-3.5" variant="text" />
          <Skeleton className="w-40 h-3.5" variant="text" />
          <Skeleton className="w-56 h-3.5" variant="text" />
          <Skeleton className="w-32 h-3.5" variant="text" />
        </div>
      </div>
    ))}
  </div>
);

export default Skeleton;
