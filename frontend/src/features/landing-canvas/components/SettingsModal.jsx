import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  HiOutlineX,
  HiOutlineGlobeAlt,
  HiOutlineDocumentText,
  HiOutlinePhotograph,
  HiOutlineCheckCircle,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineExternalLink,
  HiOutlineClock,
  HiOutlineInformationCircle,
  HiOutlineRefresh,
  HiOutlineClipboardList,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useI18n } from '../../../i18n';
import api from '../../../services/api.js';
import useStorageQuota from '../../storage/useStorageQuota.js';
import { validateFilesBeforeUpload, getUploadValidationErrorMessage } from '../../storage/validateUpload.js';
import { notifyStorageQuotaRefresh } from '../../storage/storageEvents.js';
import { uploadLandingAsset } from '../../landing-pages/services/landingPagesAdminApi.service.js';
import LeadFormConfigPanel from './LeadFormConfigPanel.jsx';

const BASE_DOMAIN = 'founderai.biz';

/**
 * Settings Modal - Modal nhỏ gọn để chỉnh sửa landing page.
 * Dễ dùng cho người non-tech với các section có thể mở rộng.
 */
export default function SettingsModal({ open, onClose, form, setForm, editingId, tab }) {
  const modalRef = useRef(null);
  const tc = useI18n('landingCanvas.settingsModal');
  const tcDomain = useI18n('landingCanvas');
  // LeadFormConfigPanel (khôi phục nguyên vẹn từ 3c514bc8^) gọi t('leadFormConfig.xxx') với
  // khoá ĐẦY ĐỦ — leadFormConfig là namespace GỐC (vi.js:962/en.js:961), không nằm dưới
  // landingCanvas.settingsModal, nên phải dùng t KHÔNG scope (khác tc/tcDomain ở trên).
  const { t, locale } = useI18n();

  // Section expand state. Khoá 'lead-form' (không phải leadForm) khớp ĐÚNG chuỗi tab-id dùng
  // xuyên suốt hệ thống: openTab('lead-form') ở useCanvasConversation.js, và LandingCanvasLayout.jsx
  // extract() cũng trả về đúng chuỗi này — lệch tên khoá thì useEffect bên dưới ghi nhầm khoá
  // mới thay vì cập nhật đúng section.
  const [expandedSections, setExpandedSections] = useState({
    page: true,
    images: true,
    domain: true,
    'lead-form': true,
  });

  const [uploadedAssets, setUploadedAssets] = useState([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(null);
  const imageInputRef = useRef(null);
  const { usage: storageQuota } = useStorageQuota();

  // Danh sách ảnh đang có trong HTML của trang
  const inPageImages = useMemo(() => {
    const html = form?.htmlContent || '';
    const regex = /(?:https?:\/\/[^"'()\s<>]*)?\/lp-assets\/uploads\/\d+\/landing\/[A-Za-z0-9._-]+/g;
    const matches = html.match(regex) || [];
    const unique = Array.from(new Set(matches));
    return unique.map((url) => {
      const lastUnderscore = url.lastIndexOf('_');
      const lastSlash = url.lastIndexOf('/');
      const fileName = lastUnderscore > lastSlash
        ? url.slice(lastUnderscore + 1)
        : url.slice(lastSlash + 1);
      return { url, name: decodeURIComponent(fileName) };
    });
  }, [form?.htmlContent]);

  // Danh sách ảnh vừa tải lên nhưng chưa được chèn vào trang
  const pendingUploadedAssets = useMemo(() => {
    return uploadedAssets.filter((a) => !inPageImages.some((ip) => ip.url === a.url));
  }, [uploadedAssets, inPageImages]);

  const handleImageUpload = async (e) => {
    const rawFiles = Array.from(e.target.files || []);
    e.target.value = '';
    if (!rawFiles.length) return;

    const allowedExts = ['.png', '.jpg', '.jpeg', '.webp'];
    const invalidFiles = rawFiles.filter((file) => {
      const name = (file.name || '').toLowerCase();
      return !allowedExts.some((ext) => name.endsWith(ext));
    });
    if (invalidFiles.length > 0) {
      toast.error(tc('sections.images.onlyImages') || 'Chỉ nhận file ảnh PNG, JPG, JPEG, WebP');
      return;
    }

    const validation = validateFilesBeforeUpload(rawFiles, storageQuota);
    if (!validation.ok) {
      toast.error(getUploadValidationErrorMessage(validation, t, locale));
      return;
    }

    setIsUploadingImage(true);
    try {
      const results = await Promise.all(
        rawFiles.map(async (file) => {
          const fd = new FormData();
          fd.append('file', file);
          const tempRes = await api.post('/uploads/temp', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          const { tempId, originalName, contentType, size } = tempRes.data.data;
          const asset = await uploadLandingAsset({
            tempId,
            originalName,
            contentType,
            size,
            landingPageId: editingId,
          });
          return asset;
        })
      );
      setUploadedAssets((prev) => [...prev, ...results]);
      notifyStorageQuotaRefresh();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Lỗi khi tải ảnh lên');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleCopyUrl = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      toast.success(tc('sections.images.copied') || 'Đã sao chép');
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch {
      toast.error('Không thể sao chép URL');
    }
  };

  const handleInsertImage = (asset) => {
    const currentHtml = form?.htmlContent || '';
    const imgTag = `<img src="${asset.url}" alt="${asset.originalName || 'image'}" class="mx-auto max-w-full h-auto" />`;
    let newHtml = '';
    const bodyCloseIndex = currentHtml.toLowerCase().lastIndexOf('</body>');
    if (bodyCloseIndex !== -1) {
      newHtml = currentHtml.slice(0, bodyCloseIndex) + '\n' + imgTag + '\n' + currentHtml.slice(bodyCloseIndex);
    } else {
      newHtml = currentHtml + '\n' + imgTag;
    }
    setForm((prev) => ({ ...prev, htmlContent: newHtml }));
    toast.success(tc('sections.images.inserted') || 'Đã chèn vào trang');
  };

  // PLAN_LEAD_FORM_TRUONG_THEM_2026-09-08.md PR-2d-2 việc 2: prop `tab` được LandingCanvasEditor.jsx
  // truyền xuống (openTab('lead-form') từ ý định chat) nhưng trước đây không được component này
  // đọc — modal mở đúng (open=Boolean(activeModalTab)) nhưng không đảm bảo section đích đang mở.
  // Đảm bảo section đó luôn expanded mỗi khi tab đích thay đổi lúc modal mở.
  useEffect(() => {
    if (!open || !tab) return;
    setExpandedSections((prev) => (prev[tab] ? prev : { ...prev, [tab]: true }));
  }, [open, tab]);

  // Domain state
  const [domainMode, setDomainMode] = useState(
    form?.customDomainHostname ? 'custom' : 'system'
  );
  const [hostname, setHostname] = useState(form?.customDomainHostname || '');
  const [isApex, setIsApex] = useState(form?.customDomainIsApex || false);
  const [_savingDomain, _setSavingDomain] = useState(false);
  const [domainStatus, _setDomainStatus] = useState('NONE');

  // Domain info from server
  const [_cdInfo, _setCdInfo] = useState(null);

  // Domain verification
  const [checkingDomain, setCheckingDomain] = useState(false);
  const [domainCheckResult, setDomainCheckResult] = useState(null); // 'ok' | 'error' | 'pending'

  useEffect(() => {
    if (form?.customDomainHostname) {
      setDomainMode('custom');
      setHostname(form.customDomainHostname);
    } else {
      setDomainMode('system');
      setHostname('');
    }
  }, [form?.customDomainHostname, form?.customDomainIsApex]);

  const handleCheckDomainConnection = async () => {
    if (!hostname) {
      toast.error('Vui lòng nhập tên miền trước');
      return;
    }
    setCheckingDomain(true);
    setDomainCheckResult('pending');
    try {
      // Gọi API verify DNS
      const res = await fetch(`/api/admin/landing-pages/${editingId}/custom-domain/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        const isOk = data.data?.status === 'active';
        setDomainCheckResult(isOk ? 'ok' : 'error');
        if (isOk) {
          toast.success('Kết nối domain thành công!');
        } else {
          toast.error('DNS chưa đúng. Vui lòng kiểm tra lại DNS records.');
        }
      } else {
        setDomainCheckResult('error');
        toast.error(data.message || 'Không thể kiểm tra domain');
      }
    } catch (e) {
      setDomainCheckResult('error');
      toast.error('Lỗi kết nối');
    } finally {
      setCheckingDomain(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // Click outside to close
  useEffect(() => {
    const handleClick = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose?.();
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onClose]);

  const toggleSection = (key) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSaveSlug = () => {
    const cleaned = String(form?.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    setForm((prev) => ({
      ...prev,
      slug: cleaned,
      domainType: 'system',
      customDomainHostname: null,
      customDomainIsApex: false,
    }));
    setDomainMode('system');
    toast.success(tcDomain('topbar.freeSlugSuccess'));
  };

  const handleSaveTitle = () => {
    toast.success('Đã lưu tiêu đề');
  };

  const _handleSavePublish = () => {
    toast.success(form?.isPublished ? 'Đã xuất bản!' : 'Đã lưu nháp');
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-modal-pop"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-orange-50 to-white">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{tc('title')}</h2>
            <p className="text-sm text-gray-500">{form?.title || tc('untitled')}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
          >
            <HiOutlineX className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* ═══ SECTION: Thông tin trang ═══ */}
          <SectionCard
            expanded={expandedSections.page}
            onToggle={() => toggleSection('page')}
            icon={<HiOutlineDocumentText className="w-5 h-5" />}
            title={tc('sections.page.title')}
            badge={form?.isPublished ? tc('published') : tc('draft')}
            badgeClass={form?.isPublished ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}
          >
            <div className="space-y-4">
              {/* Tiêu đề */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {tc('sections.page.titleLabel')}
                </label>
                <input
                  type="text"
                  value={form?.title || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  onBlur={handleSaveTitle}
                  placeholder={tc('sections.page.titlePlaceholder')}
                  className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                />
              </div>

              {/* Publish toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{tc('sections.page.publishLabel')}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {form?.isPublished ? tc('sections.page.publishOnDesc') : tc('sections.page.publishOffDesc')}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(form?.isPublished)}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, isPublished: e.target.checked }));
                      toast.success(e.target.checked ? 'Đã xuất bản!' : 'Đã lưu nháp');
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-orange-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                </label>
              </div>
            </div>
          </SectionCard>

          {/* ═══ SECTION: Ảnh của trang ═══ */}
          <SectionCard
            expanded={expandedSections.images}
            onToggle={() => toggleSection('images')}
            icon={<HiOutlinePhotograph className="w-5 h-5" />}
            title={tc('sections.images.title')}
          >
            <div className="space-y-4">
              {/* Dòng gợi ý */}
              <p className="text-xs text-gray-500 italic bg-amber-50/60 border border-amber-200/60 rounded-lg p-2.5">
                {tc('sections.images.hint')}
              </p>

              {/* Nút Tải ảnh lên */}
              <div>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp"
                  multiple
                  className="hidden"
                  onChange={handleImageUpload}
                />
                <button
                  type="button"
                  disabled={isUploadingImage}
                  onClick={() => imageInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 transition"
                >
                  <HiOutlinePhotograph className="w-4 h-4" />
                  {isUploadingImage ? tc('sections.images.uploading') : tc('sections.images.upload')}
                </button>
              </div>

              {/* Danh sách ảnh vừa tải lên */}
              {pendingUploadedAssets.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {tc('sections.images.justUploaded')}
                  </h4>
                  <div className="space-y-1.5 divide-y divide-gray-100">
                    {pendingUploadedAssets.map((asset, idx) => (
                      <div key={asset.storageKey || asset.url || idx} className="pt-1.5 flex items-center justify-between gap-3 text-sm">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <img
                            src={asset.url}
                            alt={asset.originalName}
                            className="w-10 h-10 object-cover rounded border border-gray-200 flex-shrink-0"
                          />
                          <span className="truncate font-medium text-gray-700" title={asset.originalName}>
                            {asset.originalName}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => handleCopyUrl(asset.url)}
                            className="px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded hover:bg-gray-50 transition"
                          >
                            {copiedUrl === asset.url ? tc('sections.images.copied') : tc('sections.images.copyUrl')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleInsertImage(asset)}
                            className="px-2 py-1 text-xs font-medium text-orange-600 hover:text-orange-700 border border-orange-200 rounded hover:bg-orange-50 transition"
                          >
                            {tc('sections.images.insert')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Danh sách ảnh đang có trong trang */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {tc('sections.images.inPage')}
                </h4>
                {inPageImages.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">
                    {tc('sections.images.empty')}
                  </p>
                ) : (
                  <div className="space-y-1.5 divide-y divide-gray-100">
                    {inPageImages.map((img, idx) => (
                      <div key={img.url || idx} className="pt-1.5 flex items-center justify-between gap-3 text-sm">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <img
                            src={img.url}
                            alt={img.name}
                            className="w-10 h-10 object-cover rounded border border-gray-200 flex-shrink-0"
                          />
                          <span className="truncate font-medium text-gray-700" title={img.name}>
                            {img.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => handleCopyUrl(img.url)}
                            className="px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded hover:bg-gray-50 transition"
                          >
                            {copiedUrl === img.url ? tc('sections.images.copied') : tc('sections.images.copyUrl')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          {/* ═══ SECTION: Tên miền ═══ */}
          <SectionCard
            expanded={expandedSections.domain}
            onToggle={() => toggleSection('domain')}
            icon={<HiOutlineGlobeAlt className="w-5 h-5" />}
            title={tc('sections.domain.title')}
            badge={domainMode === 'custom' ? hostname : `${form?.slug || '...'}.${BASE_DOMAIN}`}
            badgeClass="bg-purple-100 text-purple-700"
          >
            <div className="space-y-4">
              {/* Mode toggle */}
              <div className="flex rounded-lg border border-gray-200 p-1 bg-gray-50">
                <button
                  onClick={() => setDomainMode('system')}
                  className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${
                    domainMode === 'system'
                      ? 'bg-white text-orange-600 shadow-sm border border-orange-200'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Miễn phí
                </button>
                <button
                  onClick={() => setDomainMode('custom')}
                  className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${
                    domainMode === 'custom'
                      ? 'bg-white text-purple-600 shadow-sm border border-purple-200'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Tên miền riêng
                </button>
              </div>

              {/* Free subdomain */}
              {domainMode === 'system' && (
                <div className="space-y-3">
                  <div className="p-4 bg-orange-50 rounded-lg border border-orange-100">
                    <p className="text-sm text-orange-800">
                      <strong>Miễn phí:</strong> Landing page của bạn sẽ có địa chỉ:
                    </p>
                    <p className="text-lg font-mono font-semibold text-orange-900 mt-1">
                      {form?.slug || 'ten-page'}.{BASE_DOMAIN}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {tc('sections.domain.slugLabel')}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={form?.slug || ''}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            slug: e.target.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, ''),
                          }))
                        }
                        placeholder="ten-page"
                        className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 font-mono text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                      />
                      <button
                        onClick={handleSaveSlug}
                        className="px-5 py-2.5 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition"
                      >
                        Lưu
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Custom domain */}
              {domainMode === 'custom' && (
                <div className="space-y-4">
                  {/* Domain input */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {tc('sections.domain.hostnameLabel')}
                    </label>
                    <input
                      type="text"
                      value={hostname}
                      onChange={(e) => setHostname(e.target.value.toLowerCase())}
                      placeholder="lp.example.com"
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 font-mono text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                    />
                  </div>

                  {/* Domain type */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {tc('sections.domain.typeLabel')}
                    </label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="domain-type"
                          checked={!isApex}
                          onChange={() => setIsApex(false)}
                          className="text-purple-600 focus:ring-purple-500"
                        />
                        <span className="text-sm text-gray-700">
                          <strong>Subdomain</strong> (lp.example.com)
                        </span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="domain-type"
                          checked={isApex}
                          onChange={() => setIsApex(true)}
                          className="text-purple-600 focus:ring-purple-500"
                        />
                        <span className="text-sm text-gray-700">
                          <strong>Apex</strong> (example.com)
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Guide */}
                  <div className="rounded-lg bg-purple-50 border border-purple-100 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-purple-800">
                      <HiOutlineInformationCircle className="w-5 h-5" />
                      <span className="font-semibold text-sm">{tc('sections.domain.guideTitle')}</span>
                    </div>
                    
                    <ol className="text-sm text-gray-700 space-y-2 ml-2">
                      <li className="flex gap-2">
                        <span className="font-semibold text-purple-600">1.</span>
                        <span>Đăng nhập vào <strong>nhà cung cấp domain</strong> của bạn (GoDaddy, Namecheap, Cloudflare...)</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="font-semibold text-purple-600">2.</span>
                        <span>Tìm phần <strong>DNS Records</strong> hoặc <strong>Zone Records</strong></span>
                      </li>
                      <li className="flex gap-2">
                        <span className="font-semibold text-purple-600">3.</span>
                        <span>Thêm record sau:</span>
                      </li>
                    </ol>

                    {/* DNS Record display */}
                    <div className="bg-white rounded-lg border border-purple-200 p-3 font-mono text-sm">
                      {isApex ? (
                        <div className="space-y-1">
                          <div className="flex gap-2 text-gray-600">
                            <span className="text-purple-600 font-bold">Type:</span>
                            <span>A</span>
                          </div>
                          <div className="flex gap-2 text-gray-600">
                            <span className="text-purple-600 font-bold">Host:</span>
                            <span>@</span>
                          </div>
                          <div className="flex gap-2 text-gray-600">
                            <span className="text-purple-600 font-bold">Value:</span>
                            <span className="text-amber-600">[Cần IP từ FounderAI]</span>
                          </div>
                          <div className="flex gap-2 text-gray-600">
                            <span className="text-purple-600 font-bold">TTL:</span>
                            <span>3600</span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex gap-2 text-gray-600">
                            <span className="text-purple-600 font-bold">Type:</span>
                            <span>CNAME</span>
                          </div>
                          <div className="flex gap-2 text-gray-600">
                            <span className="text-purple-600 font-bold">Host:</span>
                            <span>{hostname.split('.')[0] || 'lp'}</span>
                          </div>
                          <div className="flex gap-2 text-gray-600">
                            <span className="text-purple-600 font-bold">Value:</span>
                            <span>{BASE_DOMAIN}.</span>
                          </div>
                          <div className="flex gap-2 text-gray-600">
                            <span className="text-purple-600 font-bold">TTL:</span>
                            <span>3600</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-gray-500">
                      <HiOutlineClock className="w-3.5 h-3.5 inline mr-1" />
                      DNS có thể mất <strong>5-30 phút</strong> để propagate. Đôi khi đến 48 giờ.
                    </p>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (!hostname) {
                          toast.error('Vui lòng nhập tên miền');
                          return;
                        }
                        setForm((prev) => ({
                          ...prev,
                          domainType: 'custom',
                          customDomainHostname: hostname,
                          customDomainIsApex: isApex,
                        }));
                        toast.success('Đã lưu tên miền! Vui lòng đợi DNS propagate.');
                      }}
                      className="flex-1 py-2.5 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition"
                    >
                      Lưu tên miền
                    </button>
                    {domainStatus === 'ACTIVE' && (
                      <a
                        href={`https://${hostname}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition inline-flex items-center gap-1"
                      >
                        <HiOutlineExternalLink className="w-4 h-4" />
                        Mở
                      </a>
                    )}
                  </div>

                  {/* Kiểm tra kết nối */}
                  {hostname && (
                    <div className="mt-3">
                      <button
                        onClick={handleCheckDomainConnection}
                        disabled={checkingDomain}
                        className={`w-full py-2.5 rounded-lg font-medium transition flex items-center justify-center gap-2 ${
                          domainCheckResult === 'ok'
                            ? 'bg-green-100 text-green-700 border border-green-200'
                            : domainCheckResult === 'error'
                            ? 'bg-red-100 text-red-700 border border-red-200'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                        }`}
                      >
                        {checkingDomain ? (
                          <>
                            <div className="w-4 h-4 border-2 border-gray-400 border-t-green-600 rounded-full animate-spin" />
                            Đang kiểm tra...
                          </>
                        ) : domainCheckResult === 'ok' ? (
                          <>
                            <HiOutlineCheckCircle className="w-5 h-5" />
                            Kết nối thành công
                          </>
                        ) : domainCheckResult === 'error' ? (
                          <>
                            <HiOutlineX className="w-5 h-5" />
                            Kết nối thất bại
                          </>
                        ) : (
                          <>
                            <HiOutlineRefresh className="w-5 h-5" />
                            Kiểm tra kết nối
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </SectionCard>

          {/* ═══ SECTION: Form đăng ký ═══ */}
          <SectionCard
            expanded={expandedSections['lead-form']}
            onToggle={() => toggleSection('lead-form')}
            icon={<HiOutlineClipboardList className="w-5 h-5" />}
            title={tc('sections.leadForm.title')}
            badge={`${(form?.leadFormConfig?.customFields || []).length}/20`}
            badgeClass="bg-blue-100 text-blue-700"
          >
            <LeadFormConfigPanel form={form} setForm={setForm} t={t} />
          </SectionCard>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition"
          >
            Xong
          </button>
        </div>
      </div>

      <style>{`
        @keyframes modalPop {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-modal-pop { animation: modalPop 200ms ease-out; }
      `}</style>
    </div>,
    document.body
  );
}

/**
 * Section Card - Collapsible section with header
 */
function SectionCard({ expanded, onToggle, icon, title, badge, badgeClass, children }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition"
      >
        <div className="flex items-center gap-3">
          <span className="text-gray-400">{icon}</span>
          <span className="font-semibold text-gray-900">{title}</span>
          {badge && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeClass}`}>
              {badge}
            </span>
          )}
        </div>
        {expanded ? (
          <HiOutlineChevronDown className="w-5 h-5 text-gray-400" />
        ) : (
          <HiOutlineChevronRight className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {/* Content */}
      {expanded && <div className="px-4 py-4">{children}</div>}
    </div>
  );
}
