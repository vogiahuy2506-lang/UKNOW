import { HiOutlineChevronLeft, HiOutlineChevronRight } from 'react-icons/hi';

const Pagination = ({
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  maxVisible = 5,
  showInfo = true,
  className = '',
}) => {
  const pages = [];
  const halfVisible = Math.floor(maxVisible / 2);
  let startPage = Math.max(1, currentPage - halfVisible);
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);

  if (endPage - startPage < maxVisible - 1) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  if (pages.length === 0 || totalPages <= 1) return null;

  return (
    <div className={`flex items-center justify-center gap-2 ${className}`}>
      {/* Previous button */}
      <button
        onClick={() => onPageChange?.(currentPage - 1)}
        disabled={currentPage === 1}
        className="p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-label="Trang trước"
      >
        <HiOutlineChevronLeft className="w-5 h-5" />
      </button>

      {/* First page + ellipsis */}
      {pages[0] > 1 && (
        <>
          <button
            onClick={() => onPageChange?.(1)}
            className={`w-10 h-10 rounded-lg border text-sm font-medium transition-colors ${
              currentPage === 1
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            1
          </button>
          {pages[0] > 2 && (
            <span className="px-2 text-gray-400">...</span>
          )}
        </>
      )}

      {/* Page numbers */}
      {pages.map((page) => (
        <button
          key={page}
          onClick={() => onPageChange?.(page)}
          className={`w-10 h-10 rounded-lg border text-sm font-medium transition-colors ${
            currentPage === page
              ? 'bg-blue-600 text-white border-blue-600'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          {page}
        </button>
      ))}

      {/* Last page + ellipsis */}
      {pages[pages.length - 1] < totalPages && (
        <>
          {pages[pages.length - 1] < totalPages - 1 && (
            <span className="px-2 text-gray-400">...</span>
          )}
          <button
            onClick={() => onPageChange?.(totalPages)}
            className={`w-10 h-10 rounded-lg border text-sm font-medium transition-colors ${
              currentPage === totalPages
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {totalPages}
          </button>
        </>
      )}

      {/* Next button */}
      <button
        onClick={() => onPageChange?.(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-label="Trang sau"
      >
        <HiOutlineChevronRight className="w-5 h-5" />
      </button>

      {/* Page info */}
      {showInfo && (
        <span className="ml-4 text-sm text-gray-500 hidden sm:inline">
          Trang {currentPage} / {totalPages}
        </span>
      )}
    </div>
  );
};

export default Pagination;
