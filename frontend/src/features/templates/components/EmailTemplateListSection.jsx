import { useI18n } from '../../../i18n';
import {
  HiOutlineDuplicate,
  HiOutlineEye,
  HiOutlinePlus,
  HiOutlineSearch,
  HiOutlineTag,
  HiOutlineTrash,
  HiOutlineQuestionMarkCircle,
  HiOutlineTemplate,
  HiOutlineMail,
  HiOutlineChatAlt2,
  HiOutlinePencil,
  HiOutlineClock,
  HiOutlineX,
} from 'react-icons/hi';
import PageHeader from '../../../components/common/PageHeader';
import { useState } from 'react';

const EmailTemplateListSection = ({
  isLoading,
  filteredTemplates,
  labels = [],
  filterCategory,
  setFilterCategory,
  searchTerm,
  setSearchTerm,
  onCreateTemplate,
  onManageLabels,
  channelTabs = null,
  activeChannel = null,
  onChannelChange = null,
  getCategoryBadge,
  handlePreview,
  handleDuplicate,
  handleEdit,
  handleDelete,
  title,
  description,
  emptyTitle,
  emptyDescription,
  searchPlaceholder,
}) => {
  const { t } = useI18n();
  const [showHelp, setShowHelp] = useState(false);

  const tabs = [
    { id: '', label: t('common.all'), color: null },
    ...labels.map((lbl) => ({ id: lbl.name, label: lbl.name, color: lbl.color })),
  ];

  return (
  <>
    <div className="space-y-4 mb-6">
      {channelTabs && onChannelChange && (
        <div className="inline-flex items-center gap-1.5 p-1 bg-gray-100/90 rounded-xl border border-gray-200/70 shadow-xs">
          {channelTabs.map(({ key, label }) => {
            const isActive = activeChannel === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onChannelChange(key)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-white text-gray-900 shadow-xs ring-1 ring-gray-200/80'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                }`}
              >
                {key === 'email' ? (
                  <span
                    className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
                      isActive ? 'bg-blue-100 text-blue-600' : 'bg-gray-200/80 text-gray-500'
                    }`}
                  >
                    <HiOutlineMail className="w-3.5 h-3.5" />
                  </span>
                ) : (
                  <span
                    className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
                      isActive ? 'bg-sky-100 text-sky-600' : 'bg-gray-200/80 text-gray-500'
                    }`}
                  >
                    <HiOutlineChatAlt2 className="w-3.5 h-3.5" />
                  </span>
                )}
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      )}
      <PageHeader
        icon={HiOutlineTemplate}
        title={title || t('templates.libraryTitle')}
        subtitle={
          <div className="flex items-center gap-2 flex-wrap text-sm text-gray-600">
            <span>{description || t('templates.templateDescription')}</span>
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium hover:underline text-xs"
            >
              <HiOutlineQuestionMarkCircle className="w-4 h-4" />
              <span>Hướng dẫn sử dụng</span>
            </button>
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            {onManageLabels && (
              <button
                type="button"
                onClick={onManageLabels}
                className="border border-gray-300 hover:border-gray-400 bg-white hover:bg-gray-50 text-gray-700 px-3.5 py-2 rounded-lg transition-all duration-200 flex items-center gap-1.5 text-sm font-medium shadow-xs"
              >
                <HiOutlineTag className="w-4 h-4 text-gray-500" />
                <span>Tạo nhãn mới</span>
              </button>
            )}
            <button
              type="button"
              onClick={onCreateTemplate}
              className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white px-4 py-2 rounded-lg shadow-xs hover:shadow-md transition-all duration-200 flex items-center font-semibold text-sm"
            >
              <HiOutlinePlus className="w-5 h-5 mr-1.5" />
              <span>{t('templates.createTemplate')}</span>
            </button>
          </div>
        }
      />
    </div>

    <div className="bg-white p-3 sm:p-4 rounded-xl shadow-xs border border-gray-200/80 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 mb-6">
      <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
        {tabs.map((tab) => {
          const isSelected = filterCategory === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterCategory(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all duration-150 whitespace-nowrap flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-orange-50 text-orange-700 font-semibold ring-1 ring-orange-200 shadow-2xs'
                  : 'bg-gray-50 hover:bg-gray-100 text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.color && (
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: tab.color }}
                />
              )}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="relative w-full md:w-80 group">
        <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-orange-500 transition-colors pointer-events-none" />
        <input
          type="text"
          placeholder={searchPlaceholder || t('templates.searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-8 py-2 bg-gray-50/60 hover:bg-white focus:bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/15 focus:border-orange-500 transition-all duration-200"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-full hover:bg-gray-200/60 transition-colors"
          >
            <HiOutlineX className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>

    {isLoading ? (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-orange-500 border-t-transparent"></div>
      </div>
    ) : filteredTemplates.length === 0 ? (
      <div className="text-center py-16 bg-white rounded-xl border border-gray-200/80 shadow-xs">
        <div className="w-16 h-16 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <HiOutlineTemplate className="w-8 h-8" />
        </div>
        <h3 className="text-base font-semibold text-gray-900 mb-1">{emptyTitle || t('templates.noTemplates')}</h3>
        <p className="text-sm text-gray-500 max-w-sm mx-auto mb-5">
          {emptyDescription || t('templates.firstTemplateTip')}
        </p>
        <button
          type="button"
          onClick={onCreateTemplate}
          className="bg-primary-500 hover:bg-primary-600 text-white font-medium px-4 py-2 rounded-lg text-sm shadow-xs transition-colors"
        >
          {t('templates.createTemplateNow')}
        </button>
      </div>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
        {filteredTemplates.map((template) => (
          <div
            key={template.id}
            className="group relative bg-white rounded-xl border border-gray-200/80 shadow-xs hover:shadow-lg hover:border-orange-300 transition-all duration-200 flex flex-col overflow-hidden"
          >
            {/* Mockup Preview Area */}
            <div className="bg-gradient-to-b from-slate-50 via-slate-50/80 to-white p-3.5 border-b border-gray-100 relative">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {getCategoryBadge(template.category)}
                  {template?.activeUsage?.isUsedInActiveCampaign && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {t('templates.inUse')}
                    </span>
                  )}
                </div>

                {/* Quick Action Overlay on Hover */}
                <div className="opacity-0 group-hover:opacity-100 transition-all duration-150 flex items-center gap-1 bg-white/95 backdrop-blur-xs shadow-xs rounded-lg p-1 border border-gray-200">
                  <button
                    type="button"
                    onClick={() => handlePreview(template)}
                    className="p-1.5 rounded-md hover:bg-orange-50 text-gray-500 hover:text-orange-600 transition-colors"
                    title={t('templates.preview')}
                  >
                    <HiOutlineEye className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDuplicate(template)}
                    className="p-1.5 rounded-md hover:bg-orange-50 text-gray-500 hover:text-orange-600 transition-colors"
                    title={t('templates.duplicate')}
                  >
                    <HiOutlineDuplicate className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Mini Envelope / Chat Preview Frame */}
              <div className="bg-white rounded-lg p-2.5 border border-gray-200/80 shadow-2xs space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-gray-100 text-gray-500">
                    {activeChannel === 'zalo' ? (
                      <HiOutlineChatAlt2 className="w-3 h-3 text-sky-600" />
                    ) : (
                      <HiOutlineMail className="w-3 h-3 text-blue-600" />
                    )}
                  </span>
                  <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                    {activeChannel === 'zalo' ? 'Zalo Message' : 'Email Subject'}
                  </span>
                </div>
                <p className="text-xs text-gray-700 font-medium line-clamp-2 leading-relaxed min-h-[2.5rem]">
                  {template.subject || (activeChannel === 'zalo' ? t('templates.zaloSubject') : t('templates.emailSubject')) || '—'}
                </p>
              </div>
            </div>

            {/* Content Body */}
            <div className="p-3.5 flex-1 flex flex-col justify-between">
              <div>
                <h3
                  onClick={() => handleEdit(template)}
                  className="font-semibold text-gray-900 text-sm mb-1.5 line-clamp-1 cursor-pointer hover:text-orange-600 transition-colors"
                  title={template.templateName}
                >
                  {template.templateName}
                </h3>

                <p
                  className="text-xs text-gray-500 mb-3 truncate flex items-center gap-1.5"
                  title={template?.createdBy?.name || template?.creatorName || ''}
                >
                  <span className="w-4 h-4 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-[10px] font-bold">
                    {(template?.createdBy?.name || template?.creatorName || 'A')[0]?.toUpperCase()}
                  </span>
                  <span>{template?.createdBy?.name || template?.creatorName || t('common.unknown')}</span>
                </p>
              </div>

              {/* Footer Metadata & Actions */}
              <div className="flex items-center justify-between pt-2.5 border-t border-gray-100">
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <HiOutlineClock className="w-3.5 h-3.5 text-gray-400" />
                  {new Date(template.updatedAt).toLocaleDateString('vi-VN')}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleEdit(template)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100 px-2.5 py-1 rounded-md transition-colors"
                  >
                    <HiOutlinePencil className="w-3 h-3" />
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(template.id)}
                    className="p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title={t('common.delete')}
                  >
                    <HiOutlineTrash className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
    {showHelp && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Hướng dẫn sử dụng Template</h3>
              <button
                onClick={() => setShowHelp(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="space-y-4 text-sm text-gray-600">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="font-medium text-blue-800 mb-1">Template là gì?</p>
                <p>Template giúp bạn lưu sẵn nội dung tin nhắn để gửi cho khách hàng qua Email hoặc Zalo một cách nhanh chóng và nhất quán.</p>
              </div>
              <div>
                <p className="font-medium text-gray-800 mb-2">Cách tạo Template mới:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Nhấn nút "Tạo template mới"</li>
                  <li>Điền tên template và nội dung tin nhắn</li>
                  <li>Sử dụng biến (variables) để cá nhân hóa tin nhắn như: {"{{"}ten_khach{"}}"}, {"{{"}email_khach{"}}"}</li>
                  <li>Nhấn "Lưu" để hoàn tất</li>
                </ol>
              </div>
              <div>
                <p className="font-medium text-gray-800 mb-2">Cách sử dụng trong Campaign:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Tạo Campaign mới</li>
                  <li>Chọn bước gửi Email/Zalo</li>
                  <li>Chọn Template đã tạo từ danh sách</li>
                  <li>Hệ thống sẽ tự động thay thế biến bằng thông tin khách hàng</li>
                </ol>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="font-medium text-green-800 mb-1">Mẹo:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Dùng nhãn (labels) để phân loại template theo mục đích</li>
                  <li>Tạo nhiều biến để tăng tính cá nhân hóa</li>
                  <li>Preview trước khi lưu để kiểm tra nội dung</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}
  </>
);
};

export default EmailTemplateListSection;
