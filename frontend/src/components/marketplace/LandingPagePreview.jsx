import {
  HiOutlineGlobe,
  HiOutlineDocumentText,
} from 'react-icons/hi';

const LandingPagePreview = ({ snapshot }) => {
  if (!snapshot) {
    return (
      <div className="text-center py-8 text-gray-500">
        Không có dữ liệu preview
      </div>
    );
  }

  const { title, slug, htmlContent, customConfig } = snapshot;

  return (
    <section className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
          <HiOutlineGlobe className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-base font-bold text-gray-900">Preview Landing Page</h2>
          <p className="text-xs text-gray-500">Template landing page</p>
        </div>
      </div>

      {/* Landing Page Info */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500">Tiêu đề</p>
          <p className="text-sm font-medium text-gray-900 truncate">
            {title || 'Untitled Landing Page'}
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500">Slug</p>
          <p className="text-sm font-medium text-gray-900 truncate">
            {slug || '-'}
          </p>
        </div>
      </div>

      {/* HTML Content Preview */}
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Nội dung HTML</h3>
        {htmlContent ? (
          <div className="border border-gray-200 rounded-lg p-2 bg-gray-50">
            <iframe
              title="Preview Landing Page"
              className="w-full h-80 border-0 rounded bg-white block"
              sandbox=""
              srcDoc={htmlContent}
            />
            {htmlContent.length > 500 && (
              <p className="text-xs text-gray-500 mt-2 text-center">
                Nội dung đã bị cắt ngắn ({htmlContent.length} ký tự)
              </p>
            )}
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg p-4 text-center text-gray-500">
            <HiOutlineDocumentText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">Không có nội dung HTML</p>
          </div>
        )}
      </div>

      {/* Custom Config */}
      {customConfig && Object.keys(customConfig).length > 0 && (
        <div className="pt-4 border-t border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Cấu hình</h3>
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            {Object.entries(customConfig).slice(0, 5).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="text-gray-500">{key}:</span>
                <span className="font-medium text-gray-900 truncate max-w-[60%]">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </span>
              </div>
            ))}
            {Object.keys(customConfig).length > 5 && (
              <p className="text-xs text-gray-500 text-center">
                +{Object.keys(customConfig).length - 5} cấu hình khác
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default LandingPagePreview;
