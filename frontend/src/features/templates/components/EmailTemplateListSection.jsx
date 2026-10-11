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
        <div className="inline-flex items-center gap-1.5 p-1 bg-gray-100/90 dark:bg-dk-raised rounded-xl border border-gray-200/70 dark:border-dk-border shadow-xs">
          {channelTabs.map(({ key, label }) => {
            const isActive = activeChannel === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onChannelChange(key)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-white dark:bg-dk-inset text-gray-900 dark:text-dk-text shadow-xs ring-1 ring-gray-200/80 dark:ring-dk-border'
                    : 'text-gray-600 dark:text-dk-text2 hover:text-gray-900 dark:hover:text-dk-text hover:bg-white/50 dark:hover:bg-dk-raised/50'
                }`}
              >
                {key === 'email' ? (
                  <span
                    className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
                      isActive ? 'bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400' : 'bg-gray-200/80 dark:bg-dk-raised text-gray-500 dark:text-dk-text2'
                    }`}
                  >
                    <HiOutlineMail className="w-3.5 h-3.5" />
                  </span>
                ) : (
                  <span
                    className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
                      isActive ? 'bg-sky-100 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400' : 'bg-gray-200/80 dark:bg-dk-raised text-gray-500 dark:text-dk-text2'
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
          <div className="flex items-center gap-2 flex-wrap text-sm text-gray-600 dark:text-dk-text2">
            <span>{description || t('templates.templateDescription')}</span>
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium hover:underline text-xs"
            >
              <HiOutlineQuestionMarkCircle className="w-4 h-4" />
              <span>{t('templates.userGuide', 'Hướng dẫn sử dụng')}</span>
            </button>
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
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

    <div className="bg-white dark:bg-dk-surface p-3 sm:p-4 rounded-xl shadow-xs border border-gray-200/80 dark:border-dk-border flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 mb-6">
      <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none flex-1">
        {tabs.map((tab) => {
          const isSelected = filterCategory === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterCategory(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all duration-150 whitespace-nowrap flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 font-semibold ring-1 ring-orange-200 dark:ring-orange-800/50 shadow-2xs'
                  : 'bg-gray-50 dark:bg-dk-raised hover:bg-gray-100 dark:hover:bg-dk-strong text-gray-600 dark:text-dk-text hover:text-gray-900 dark:hover:text-dk-text'
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

        {/* Nút Tạo / Quản lý nhãn đặt cạnh trực tiếp các nhãn */}
        {onManageLabels && (
          <button
            type="button"
            onClick={onManageLabels}
            className="px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium border border-dashed border-gray-300 dark:border-dk-border hover:border-orange-400 dark:hover:border-orange-500 text-gray-500 dark:text-dk-text2 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50/50 dark:hover:bg-orange-950/30 transition-all duration-150 whitespace-nowrap flex items-center gap-1.5 shrink-0"
            title={t('templates.manageLabelsTooltip', 'Tạo nhãn mới hoặc quản lý danh sách nhãn')}
          >
            <HiOutlineTag className="w-3.5 h-3.5 text-gray-400 dark:text-dk-muted group-hover:text-orange-500" />
            <span>{t('templates.createLabel', 'Tạo nhãn mới')}</span>
          </button>
        )}
      </div>

      <div className="relative w-full md:w-80 group shrink-0">
        <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-dk-muted group-focus-within:text-orange-500 transition-colors pointer-events-none" />
        <input
          type="text"
          placeholder={searchPlaceholder || t('templates.searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-8 py-2 bg-gray-50/60 dark:bg-dk-inset hover:bg-white dark:hover:bg-dk-surface focus:bg-white dark:focus:bg-dk-inset border border-gray-200 dark:border-dk-border rounded-lg text-sm text-gray-900 dark:text-dk-text placeholder:text-gray-400 dark:placeholder:text-dk-muted focus:outline-none focus:ring-2 focus:ring-orange-500/15 focus:border-orange-500 transition-all duration-200"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-dk-muted hover:text-gray-600 dark:hover:text-dk-text p-0.5 rounded-full hover:bg-gray-200/60 dark:hover:bg-dk-raised transition-colors"
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
      <div className="text-center py-16 bg-white dark:bg-dk-surface rounded-xl border border-gray-200/80 dark:border-dk-border shadow-xs">
        <div className="w-16 h-16 bg-orange-50 dark:bg-orange-950/40 text-orange-500 dark:text-orange-400 rounded-full flex items-center justify-center mx-auto mb-4">
          <HiOutlineTemplate className="w-8 h-8" />
        </div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-dk-text mb-1">{emptyTitle || t('templates.noTemplates')}</h3>
        <p className="text-sm text-gray-500 dark:text-dk-text2 max-w-sm mx-auto mb-5">
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
            className="group relative bg-white dark:bg-dk-surface rounded-xl border border-gray-200/80 dark:border-dk-border shadow-xs hover:shadow-lg hover:border-orange-300 dark:hover:border-orange-500/50 transition-all duration-200 flex flex-col overflow-hidden"
          >
            {/* Mockup Preview Area */}
            <div className="bg-gradient-to-b from-slate-50 via-slate-50/80 to-white dark:from-dk-raised/60 dark:via-dk-raised/40 dark:to-dk-surface p-3.5 border-b border-gray-100 dark:border-dk-border relative">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {getCategoryBadge(template.category)}
                  {template?.activeUsage?.isUsedInActiveCampaign && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/50">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {t('templates.inUse')}
                    </span>
                  )}
                </div>

                {/* Quick Action Overlay on Hover */}
                <div className="opacity-0 group-hover:opacity-100 transition-all duration-150 flex items-center gap-1 bg-white/95 dark:bg-dk-raised/95 backdrop-blur-xs shadow-xs rounded-lg p-1 border border-gray-200 dark:border-dk-border">
                  <button
                    type="button"
                    onClick={() => handlePreview(template)}
                    className="p-1.5 rounded-md hover:bg-orange-50 dark:hover:bg-orange-950/40 text-gray-500 dark:text-dk-text2 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                    title={t('templates.preview')}
                  >
                    <HiOutlineEye className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDuplicate(template)}
                    className="p-1.5 rounded-md hover:bg-orange-50 dark:hover:bg-orange-950/40 text-gray-500 dark:text-dk-text2 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                    title={t('templates.duplicate')}
                  >
                    <HiOutlineDuplicate className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Mini Envelope / Chat Preview Frame */}
              <div className="bg-white dark:bg-dk-inset rounded-lg p-2.5 border border-gray-200/80 dark:border-dk-border shadow-2xs space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-dk-muted">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-gray-100 dark:bg-dk-raised text-gray-500 dark:text-dk-text2">
                    {activeChannel === 'zalo' ? (
                      <HiOutlineChatAlt2 className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                    ) : (
                      <HiOutlineMail className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                    )}
                  </span>
                  <span className="text-[11px] font-medium text-gray-500 dark:text-dk-text2 uppercase tracking-wider">
                    {activeChannel === 'zalo' ? t('templates.messageKindLabel') : 'Email Subject'}
                  </span>
                </div>
                <p className="text-xs text-gray-700 dark:text-dk-text font-medium line-clamp-2 leading-relaxed min-h-[2.5rem]">
                  {template.subject || (activeChannel === 'zalo' ? t('templates.zaloSubject') : t('templates.emailSubject')) || '—'}
                </p>
              </div>
            </div>

            {/* Content Body */}
            <div className="p-3.5 flex-1 flex flex-col justify-between">
              <div>
                <h3
                  onClick={() => handleEdit(template)}
                  className="font-semibold text-gray-900 dark:text-dk-text text-sm mb-1.5 line-clamp-1 cursor-pointer hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                  title={template.templateName}
                >
                  {template.templateName}
                </h3>

                <p
                  className="text-xs text-gray-500 dark:text-dk-text2 mb-3 truncate flex items-center gap-1.5"
                  title={template?.createdBy?.name || template?.creatorName || ''}
                >
                  <span className="w-4 h-4 rounded-full bg-orange-100 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 flex items-center justify-center text-[10px] font-bold">
                    {(template?.createdBy?.name || template?.creatorName || 'A')[0]?.toUpperCase()}
                  </span>
                  <span>{template?.createdBy?.name || template?.creatorName || t('common.unknown')}</span>
                </p>
              </div>

              {/* Footer Metadata & Actions */}
              <div className="flex items-center justify-between pt-2.5 border-t border-gray-100 dark:border-dk-border">
                <span className="text-xs text-gray-400 dark:text-dk-muted flex items-center gap-1">
                  <HiOutlineClock className="w-3.5 h-3.5 text-gray-400 dark:text-dk-muted" />
                  {new Date(template.updatedAt).toLocaleDateString('vi-VN')}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleEdit(template)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 hover:bg-orange-100 dark:hover:bg-orange-900/50 px-2.5 py-1 rounded-md transition-colors"
                  >
                    <HiOutlinePencil className="w-3 h-3" />
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(template.id)}
                    className="p-1 rounded-md text-gray-400 dark:text-dk-muted hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
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
        <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-2xl border border-gray-200 dark:border-dk-border max-w-lg w-full max-h-[80vh] overflow-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-dk-text">
                {t('templates.helpModal.title', 'Hướng dẫn sử dụng Template')}
              </h3>
              <button
                onClick={() => setShowHelp(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-dk-text text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="space-y-4 text-sm text-gray-600 dark:text-dk-text">
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-lg p-3">
                <p className="font-medium text-blue-800 dark:text-blue-300 mb-1">
                  {t('templates.helpModal.whatIsTemplateTitle', 'Template là gì?')}
                </p>
                <p>
                  {t('templates.helpModal.whatIsTemplateDesc', 'Template giúp bạn lưu sẵn nội dung tin nhắn để gửi cho khách hàng qua Email, Zalo, Telegram hoặc WhatsApp một cách nhanh chóng và nhất quán.')}
                </p>
              </div>
              <div>
                <p className="font-medium text-gray-800 dark:text-dk-text mb-2">
                  {t('templates.helpModal.howToCreateTitle', 'Cách tạo Template mới:')}
                </p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>{t('templates.helpModal.howToCreateStep1', 'Nhấn nút "Tạo template mới"')}</li>
                  <li>{t('templates.helpModal.howToCreateStep2', 'Điền tên template và nội dung tin nhắn')}</li>
                  <li>{t('templates.helpModal.howToCreateStep3', 'Sử dụng biến (variables) để cá nhân hóa tin nhắn như: {{ten_khach}}, {{email_khach}}')}</li>
                  <li>{t('templates.helpModal.howToCreateStep4', 'Nhấn "Lưu" để hoàn tất')}</li>
                </ol>
              </div>
              <div>
                <p className="font-medium text-gray-800 dark:text-dk-text mb-2">
                  {t('templates.helpModal.howToUseTitle', 'Cách sử dụng trong Campaign:')}
                </p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>{t('templates.helpModal.howToUseStep1', 'Tạo Campaign mới')}</li>
                  <li>{t('templates.helpModal.howToUseStep2', 'Chọn bước gửi Email/Zalo/Telegram/WhatsApp')}</li>
                  <li>{t('templates.helpModal.howToUseStep3', 'Chọn Template đã tạo từ danh sách')}</li>
                  <li>{t('templates.helpModal.howToUseStep4', 'Hệ thống sẽ tự động thay thế biến bằng thông tin khách hàng')}</li>
                </ol>
              </div>
              <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 rounded-lg p-3">
                <p className="font-medium text-green-800 dark:text-green-300 mb-1">
                  {t('templates.helpModal.tipsTitle', 'Mẹo:')}
                </p>
                <ul className="list-disc list-inside space-y-1">
                  <li>{t('templates.helpModal.tip1', 'Dùng nhãn (labels) để phân loại template theo mục đích')}</li>
                  <li>{t('templates.helpModal.tip2', 'Tạo nhiều biến để tăng tính cá nhân hóa')}</li>
                  <li>{t('templates.helpModal.tip3', 'Preview trước khi lưu để kiểm tra nội dung')}</li>
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
