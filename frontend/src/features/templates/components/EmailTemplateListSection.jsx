import { useI18n } from '../../../i18n';
import {
  HiOutlineDuplicate,
  HiOutlineEye,
  HiOutlinePlus,
  HiOutlineSearch,
  HiOutlineTag,
  HiOutlineTrash,
} from 'react-icons/hi';

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

  const tabs = [
    { id: '', label: t('common.all'), color: null },
    ...labels.map((lbl) => ({ id: lbl.name, label: lbl.name, color: lbl.color })),
  ];

  return (
  <>
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          {title || t('templates.libraryTitle')}
        </h1>
        <p className="text-gray-500 mt-1">
          {description || t('templates.templateDescription')}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {onManageLabels && (
          <button
            onClick={onManageLabels}
            className="border border-gray-300 text-gray-600 hover:bg-gray-50 px-3 py-2 rounded-lg transition-all duration-200 flex items-center gap-1.5 text-sm font-medium"
          >
            <HiOutlineTag className="w-4 h-4" />
            Tạo nhãn mới
          </button>
        )}
        <button
          onClick={onCreateTemplate}
          className="bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 flex items-center font-medium"
        >
          <HiOutlinePlus className="w-5 h-5 mr-2" />
          {t('templates.createTemplate')}
        </button>
      </div>
    </div>

    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center space-x-1 bg-gray-100 p-1 rounded-lg w-full md:w-auto overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilterCategory(tab.id)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap flex items-center gap-1.5 ${
              filterCategory === tab.id
                ? 'bg-white text-primary-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
            }`}
          >
            {tab.color && (
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: tab.color }}
              />
            )}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="relative w-full md:w-80 group">
        <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-primary-500 transition-colors" />
        <input
          type="text"
          placeholder={searchPlaceholder || t('templates.searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200"
        />
      </div>
    </div>

    {isLoading ? (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    ) : filteredTemplates.length === 0 ? (
      <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <HiOutlineDuplicate className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">{emptyTitle || t('templates.noTemplates')}</h3>
        <p className="text-gray-500 max-w-sm mx-auto mb-6">
          {emptyDescription || t('templates.firstTemplateTip')}
        </p>
        <button
          onClick={onCreateTemplate}
          className="bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-lg"
        >
          {t('templates.createTemplateNow')}
        </button>
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {filteredTemplates.map((template) => (
          <div
            key={template.id}
            className="group bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300 transition-all duration-200 flex flex-col overflow-hidden"
          >
            <div className="p-3 flex-1 flex flex-col relative">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {getCategoryBadge(template.category)}
                  {template?.activeUsage?.isUsedInActiveCampaign && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                      {t('templates.inUse')}
                    </span>
                  )}
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-2 right-2 flex space-x-1 bg-white shadow-md rounded-md p-1 border border-gray-100">
                  <button
                    onClick={() => handlePreview(template)}
                    className="p-1 rounded hover:bg-gray-50 text-gray-500 hover:text-primary-600"
                    title={t('templates.preview')}
                  >
                    <HiOutlineEye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDuplicate(template)}
                    className="p-1 rounded hover:bg-gray-50 text-gray-500 hover:text-primary-600"
                    title={t('templates.duplicate')}
                  >
                    <HiOutlineDuplicate className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <h3 className="font-semibold text-gray-900 text-sm mb-2 line-clamp-2" title={template.templateName}>
                {template.templateName}
              </h3>
              <p className="text-xs text-gray-500 line-clamp-2 mb-3 bg-gray-50 p-2 rounded-md border border-gray-100">
                {template.subject}
              </p>

              <p className="text-xs text-gray-500 mb-2 truncate" title={template?.createdBy?.name || template?.creatorName || ''}>
                {t('templates.createdBy')}: {template?.createdBy?.name || template?.creatorName || t('common.unknown')}
              </p>

              <div className="mt-auto flex items-center justify-between pt-3 border-t border-gray-100">
                <span className="text-xs text-gray-400">
                  {new Date(template.updatedAt).toLocaleDateString('vi-VN')}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEdit(template)}
                    className="text-xs font-medium text-gray-600 hover:text-primary-600 px-2 py-1 rounded-md hover:bg-primary-50 transition-colors"
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    onClick={() => handleDelete(template.id)}
                    className="p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
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
  </>
);
};

export default EmailTemplateListSection;
