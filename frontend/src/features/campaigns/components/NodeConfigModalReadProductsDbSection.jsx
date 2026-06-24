import { useEffect, useMemo, useState } from 'react';
import {
  HiOutlineDocument,
  HiOutlineSearch,
  HiOutlineCube,
} from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import { NodeConfigDataColumnPicker } from './NodeConfigDataColumnPicker';

const PRODUCT_STATUS_OPTIONS = ['active', 'inactive'];

const buildProductColumnOptions = (t) => [
  { key: 'productCode', label: t('readProductsDb.colProductCode') },
  { key: 'productName', label: t('readProductsDb.colProductName') },
  { key: 'price', label: t('readProductsDb.colPrice') },
  { key: 'originalPrice', label: t('readProductsDb.colOriginalPrice') },
  { key: 'description', label: t('readProductsDb.colDescription') },
  { key: 'usp', label: t('readProductsDb.colUsp') },
  { key: 'category', label: t('readProductsDb.colCategory') },
  { key: 'thumbnailUrl', label: t('readProductsDb.colThumbnailUrl') },
  { key: 'productUrl', label: t('readProductsDb.colProductUrl') },
  { key: 'targetAudience', label: t('readProductsDb.colTargetAudience') },
  { key: 'status', label: t('readProductsDb.colStatus') },
];

const normalizeProductStatus = (status) => String(status || '').trim().toLowerCase() || 'active';

const getProductStatusLabel = (status, t) => {
  const normalized = normalizeProductStatus(status);
  if (normalized === 'active') return t('readProductsDb.statusActive');
  if (normalized === 'inactive') return t('readProductsDb.statusInactive');
  return normalized;
};

const getProductStatusClassName = (status) => {
  const normalized = normalizeProductStatus(status);
  if (normalized === 'active') return 'text-green-600';
  return 'text-gray-500';
};

export const NodeConfigReadProductsDbSection = ({
  formData,
  setFormData,
  selectedReadProductsDbSection,
  setSelectedReadProductsDbSection,
  handleLoadProductsPreview,
  isLoadingProductsPreview,
  productsPreviewItems,
}) => {
  const { t } = useI18n();
  const productColumnOptions = useMemo(() => buildProductColumnOptions(t), [t]);
  const [lastAutoLoadProductsKey, setLastAutoLoadProductsKey] = useState('');
  const selectedProductsDbIds = (Array.isArray(formData.productsDbSelectedIds) ? formData.productsDbSelectedIds : [])
    .map((v) => parseInt(v, 10))
    .filter((v, idx, arr) => Number.isFinite(v) && arr.indexOf(v) === idx);
  const autoLoadProductsSignature = useMemo(
    () => [
      formData.productsDbLimit || 1000,
      formData.productsDbSearchTerm || '',
      (Array.isArray(formData.productsDbStatuses) ? formData.productsDbStatuses : [])
        .map((item) => String(item || '').trim().toLowerCase())
        .filter(Boolean)
        .sort()
        .join(','),
    ].join('|'),
    [formData.productsDbLimit, formData.productsDbSearchTerm, formData.productsDbStatuses]
  );

  useEffect(() => {
    if (selectedReadProductsDbSection !== 'select') return;
    if (isLoadingProductsPreview) return;
    if (lastAutoLoadProductsKey === autoLoadProductsSignature) return;

    setLastAutoLoadProductsKey(autoLoadProductsSignature);
    handleLoadProductsPreview();
  }, [
    autoLoadProductsSignature,
    handleLoadProductsPreview,
    isLoadingProductsPreview,
    lastAutoLoadProductsKey,
    selectedReadProductsDbSection,
  ]);

  const toggleProductDb = (productId) => {
    const id = parseInt(productId, 10);
    if (!Number.isFinite(id)) return;
    setFormData((prev) => ({ ...prev, productsDbSelectedIds: [id] }));
  };

  const toggleProductStatusFilter = (status) => {
    const normalized = normalizeProductStatus(status);
    setFormData((prev) => {
      const current = (Array.isArray(prev.productsDbStatuses) ? prev.productsDbStatuses : [])
        .map((item) => normalizeProductStatus(item))
        .filter((item, idx, arr) => item && arr.indexOf(item) === idx);
      const next = current.includes(normalized)
        ? current.filter((item) => item !== normalized)
        : [...current, normalized];
      return { ...prev, productsDbStatuses: next };
    });
  };

  const readProductsDbSections = [
    { id: 'basic', name: t('readProductsDb.basicInfo'), icon: HiOutlineDocument },
    {
      id: 'select',
      name: t('readProductsDb.filterByProduct'),
      icon: HiOutlineSearch,
      badge: selectedProductsDbIds.length > 0,
      badgeLabel: selectedProductsDbIds.length,
    },
  ];

  const renderReadProductsDbSection = () => {
    switch (selectedReadProductsDbSection) {
      case 'basic':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('readProductsDb.nodeName')}</label>
              <input
                type="text"
                value={formData.label}
                onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder={t('readProductsDb.readProductsPlaceholder')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('readProductsDb.maxRecords')}</label>
              <input
                type="number"
                min={1}
                max={5000}
                value={formData.productsDbLimit || 1000}
                onChange={(e) => setFormData((prev) => ({ ...prev, productsDbLimit: parseInt(e.target.value, 10) || 1000 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
              <p className="text-xs text-gray-500 mt-1">{t('readProductsDb.maxRecordsHint')}</p>
            </div>
            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-sm text-blue-700">
                <strong>{t('readProductsDb.note')}:</strong> {t('readProductsDb.readProductsNote')}
              </p>
            </div>
            <NodeConfigDataColumnPicker
              title={t('readProductsDb.dataColumnsTitle')}
              options={productColumnOptions}
              selectedKeys={Array.isArray(formData.dataSelectedColumns) ? formData.dataSelectedColumns : []}
              setFormData={setFormData}
              formField="dataSelectedColumns"
              hint={t('readProductsDb.dataColumnsHint')}
            />
          </div>
        );

      case 'select':
        return (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">{t('readProductsDb.filterByProduct')}</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleLoadProductsPreview}
                    disabled={isLoadingProductsPreview}
                    className="px-3 py-1.5 text-xs rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium transition-colors"
                  >
                    {isLoadingProductsPreview ? t('readProductsDb.loading') : t('readProductsDb.loadList')}
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors"
                    onClick={() => setFormData((prev) => ({ ...prev, productsDbSelectedIds: [] }))}
                    disabled={!selectedProductsDbIds.length}
                  >
                    {t('readProductsDb.deselect')}
                  </button>
                </div>
              </div>

              {selectedProductsDbIds.length > 0 && (
                <div className="mb-3 p-2 bg-primary-50 rounded-lg">
                  <p className="text-xs text-primary-700">
                    <strong>1</strong> {t('readProductsDb.productSelected')}
                  </p>
                </div>
              )}

              <div className="mb-3">
                <input
                  type="text"
                  placeholder={t('readProductsDb.searchProduct')}
                  value={formData.productsDbSearchTerm || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, productsDbSearchTerm: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div className="mb-3">
                <p className="text-xs font-medium text-gray-600 mb-2">{t('readProductsDb.filterByStatus')}</p>
                <div className="flex flex-wrap gap-2">
                  {PRODUCT_STATUS_OPTIONS.map((status) => {
                    const activeStatuses = (Array.isArray(formData.productsDbStatuses) ? formData.productsDbStatuses : [])
                      .map((item) => normalizeProductStatus(item));
                    const checked = activeStatuses.includes(status);
                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() => toggleProductStatusFilter(status)}
                        className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                          checked
                            ? 'bg-primary-50 border-primary-300 text-primary-700'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {getProductStatusLabel(status, t)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-4 max-h-96 overflow-auto bg-gray-50">
                {isLoadingProductsPreview ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">{t('readProductsDb.loadingProductsList')}</p>
                  </div>
                ) : productsPreviewItems.length === 0 ? (
                  <div className="text-center py-8">
                    <HiOutlineCube className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">{t('readProductsDb.noProducts')}</p>
                    <p className="text-xs text-gray-400 mt-1">{t('readProductsDb.pressLoadList')}</p>
                  </div>
                ) : (
                  (() => {
                    const searchTerm = String(formData.productsDbSearchTerm || '').toLowerCase().trim();
                    const filteredProducts = productsPreviewItems.filter((item) => {
                      if (!searchTerm) return true;
                      const productName = String(item.productName || '').toLowerCase();
                      const productCode = String(item.productCode || '').toLowerCase();
                      return productName.includes(searchTerm) || productCode.includes(searchTerm);
                    });

                    if (filteredProducts.length === 0) {
                      return (
                        <div className="text-center py-8">
                          <HiOutlineCube className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                          <p className="text-sm text-gray-500">{t('readProductsDb.noProductsFound', { searchTerm: formData.productsDbSearchTerm })}</p>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-2">
                        {filteredProducts.map((product, idx) => {
                          const productId = parseInt(product.id, 10);
                          const checked = Number.isFinite(productId) && selectedProductsDbIds.includes(productId);
                          const productName = String(product.productName || `${t('readProductsDb.product')} #${idx + 1}`);
                          const productCode = String(product.productCode || '').trim();
                          const price = product.price || t('readProductsDb.noPrice');
                          return (
                            <label
                              key={`${product.id || 'none'}-${idx}`}
                              className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                                checked ? 'bg-primary-50 border border-primary-200' : 'bg-white border border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              <input
                                type="radio"
                                name="selected-product"
                                className="mt-1 border-gray-300 text-primary-600 focus:ring-primary-500"
                                checked={checked}
                                onChange={() => toggleProductDb(productId)}
                                disabled={!Number.isFinite(productId)}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900">
                                  {productName}
                                  {productCode && <span className="text-gray-500 ml-1 font-mono">({productCode})</span>}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                                  <span>{price}</span>
                                  {product.status !== undefined && product.status !== null && (
                                    <>
                                      <span>•</span>
                                      <span className={getProductStatusClassName(product.status)}>
                                        {getProductStatusLabel(product.status, t)}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    );
                  })()
                )}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                <strong>{t('readProductsDb.note')}:</strong> {t('readProductsDb.noSelectionNote')}
              </p>
            </div>

            <div className="bg-amber-50 p-3 rounded-lg">
              <p className="text-sm text-amber-700">
                <strong>{t('readProductsDb.tip')}:</strong> {t('readProductsDb.tipContent')}
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex" style={{ minHeight: '500px' }}>
      <div className="w-64 border-r border-gray-200 flex flex-col">
        <div className="p-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700">{t('readProductsDb.settings')}</h3>
        </div>
        <div className="flex-1 overflow-y-auto">
          {readProductsDbSections.map((section) => {
            const Icon = section.icon;
            return (
              <div
                key={section.id}
                onClick={() => setSelectedReadProductsDbSection(section.id)}
                className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedReadProductsDbSection === section.id
                    ? 'bg-primary-50 border-l-4 border-primary-600'
                    : 'border-l-4 border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${selectedReadProductsDbSection === section.id ? 'text-primary-600' : 'text-gray-500'}`} />
                    <span className={`text-sm ${selectedReadProductsDbSection === section.id ? 'font-medium text-primary-900' : 'text-gray-700'}`}>
                      {section.name}
                    </span>
                  </div>
                  {section.badge && (
                    section.badgeLabel ? (
                      <span className="px-2 py-0.5 rounded-full bg-primary-600 text-white text-xs font-medium">
                        {section.badgeLabel}
                      </span>
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-primary-600" />
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {renderReadProductsDbSection()}
      </div>
    </div>
  );
};
