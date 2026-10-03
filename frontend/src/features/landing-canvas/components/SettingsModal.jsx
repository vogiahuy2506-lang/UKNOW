import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  HiOutlineX,
  HiOutlineGlobeAlt,
  HiOutlinePhotograph,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineExternalLink,
  HiOutlineClipboardCopy,
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
import CustomDomainPanel from './CustomDomainPanel.jsx';
import useLandingDomainInfo from '../hooks/useLandingDomainInfo.js';
import { SYSTEM_BASE_DOMAIN } from '../utils/landingDomain.js';

const BASE_DOMAIN = SYSTEM_BASE_DOMAIN;

/**
 * Settings Modal - Modal nhỏ gọn để chỉnh sửa landing page.
 *
 * PLAN_DON_GIAN_CAI_DAT_LANDING_VA_BIEU_MAU 03/10/2026 — mở ra thấy ngay hai việc chính, thứ ít dùng thu gọn:
 *   1. "Xuất bản & đường dẫn" (luôn mở): công tắc xuất bản, link trang + Sao chép / Mở trang, đường dẫn miễn phí, và
 *      tên miền riêng (CustomDomainPanel: kiểm DNS → kết nối, gỡ, kiểm tra lại — PLAN_TEN_MIEN_RIENG PR-D).
 *      Tiêu đề trang KHÔNG còn ở đây — sửa ở thanh trên cùng của trình soạn.
 *   2. "Form thu khách": chọn Form cơ bản hoặc Dùng biểu mẫu đã tạo (LeadFormConfigPanel; lựa chọn lưu cùng lần bấm Lưu trang).
 *   3. "Ảnh đã tải lên (N)": cuối modal, mặc định thu gọn.
 */
export default function SettingsModal({ open, onClose, form, setForm, editingId, tab }) {
  const modalRef = useRef(null);
  const tc = useI18n('landingCanvas.settingsModal');
  const tcDomain = useI18n('landingCanvas');
  // LeadFormConfigPanel (khôi phục nguyên vẹn từ 3c514bc8^) gọi t('leadFormConfig.xxx') với
  // khoá ĐẦY ĐỦ — leadFormConfig là namespace GỐC (vi.js/en.js), không nằm dưới
  // landingCanvas.settingsModal, nên phải dùng t KHÔNG scope (khác tc/tcDomain ở trên).
  const { t, locale } = useI18n();

  // Section expand state (khối "Xuất bản & đường dẫn" luôn mở nên không có khoá). Khoá 'lead-form' (không phải
  // leadForm) khớp ĐÚNG chuỗi tab-id dùng xuyên suốt hệ thống: openTab('lead-form') ở useCanvasConversation.js,
  // và LandingCanvasLayout.jsx extract() cũng trả về đúng chuỗi này — lệch tên khoá thì useEffect bên dưới ghi
  // nhầm khoá mới thay vì cập nhật đúng section.
  const [expandedSections, setExpandedSections] = useState({
    'lead-form': true,
    images: false,
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

  // Tình trạng tên miền đọc từ SERVER (hook), không từ `form`: modal KHÔNG được đổi `form.domainType` (chốt PR-1 —
  // 03/10/2026 "Lưu tên miền" chỉ đổi state form rồi lúc lưu trang backend gỡ subdomain miễn phí mà không đăng ký hostname
  // nào → production mất link 4 trang: 50, 76, 88, 105). Kết nối / gỡ tên miền đi thẳng qua API tên miền riêng
  // (CustomDomainPanel, không nhận `setForm`), xong thì nạp lại từ server. `form` chỉ là dữ liệu dự phòng lúc server chưa trả lời.
  const { domain, reload: reloadDomain } = useLandingDomainInfo({ open, editingId, form });
  const hasCustomDomain = domain.kind === 'custom-active' || domain.kind === 'custom-pending';
  // domain_type='custom' mà không còn hàng tên miền nào (trang hỏng ở production): link miễn phí đã chết.
  const isBrokenCustom = domain.kind === 'none' && form?.domainType === 'custom';

  // PLAN_LEAD_FORM_TRUONG_THEM_2026-09-08.md PR-2d-2 việc 2: prop `tab` được LandingCanvasEditor.jsx
  // truyền xuống (openTab('lead-form') từ ý định chat) — đảm bảo section đích luôn mở mỗi khi tab đích đổi lúc
  // modal mở.
  useEffect(() => {
    if (!open || !tab) return;
    setExpandedSections((prev) => (prev[tab] ? prev : { ...prev, [tab]: true }));
  }, [open, tab]);

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
    // Chỉ làm sạch slug. KHÔNG đổi domainType / hostname: đổi domainType làm backend gỡ hàng landing_page_domains.
    setForm((prev) => ({ ...prev, slug: cleaned }));
    toast.success(tcDomain('topbar.freeSlugSuccess'));
  };

  // Link trang đang dùng: tên miền riêng ĐÃ chạy (nếu có), không thì <slug>.founderai.biz (chỉ khi trang đã lưu).
  const slug = String(form?.slug || '').trim();
  let publicHost = '';
  let linkHint = '';
  if (hasCustomDomain) {
    if (domain.kind === 'custom-active') publicHost = domain.hostname;
    else linkHint = tc('sections.publish.linkPendingHint');
  } else if (isBrokenCustom) {
    linkHint = tc('sections.publish.linkNoDomainHint');
  } else if (!editingId) {
    linkHint = tc('sections.publish.linkUnsavedHint');
  } else if (slug) {
    publicHost = `${slug}.${BASE_DOMAIN}`;
  } else {
    linkHint = tc('sections.publish.linkNoSlugHint');
  }
  const publicUrl = publicHost ? `https://${publicHost}` : '';

  const handleCopyLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success(tc('sections.publish.linkCopied'));
    } catch {
      toast.error(tc('sections.publish.linkCopyFailed'));
    }
  };

  const uploadedImagesCount = inPageImages.length + pendingUploadedAssets.length;
  const customFieldCount = (form?.leadFormConfig?.customFields || []).length;
  // Huy hiệu "Dùng biểu mẫu": biểu mẫu KHÁCH CHỌN (đang gắn hoặc đang chờ lưu), không phải form tự sinh của Form cơ bản.
  const usesChosenForm = form?.linkedFormChoice
    ? form.linkedFormChoice.mode === 'linked'
    : form?.linkedFormSource === 'chosen';
  const leadFormBadge = usesChosenForm
    ? tc('sections.leadForm.badgeLinked')
    : customFieldCount > 0
    ? tc('sections.leadForm.badgeCustom', { count: customFieldCount })
    : null;

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl lg:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col animate-modal-pop"
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
          {/* ═══ KHỐI 1: Xuất bản & đường dẫn (luôn mở) ═══ */}
          <SectionCard
            alwaysOpen
            icon={<HiOutlineGlobeAlt className="w-5 h-5" />}
            title={tc('sections.publish.title')}
            badge={form?.isPublished ? tc('published') : tc('draft')}
            badgeClass={form?.isPublished ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}
          >
            <div className="space-y-4">
              {/* Publish toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50/90 border border-gray-200/60 rounded-xl">
                <div>
                  <p className="font-semibold text-gray-900">{tc('sections.publish.publishLabel')}</p>
                  <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                    {form?.isPublished ? tc('sections.publish.publishOnDesc') : tc('sections.publish.publishOffDesc')}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    aria-label={tc('sections.publish.publishLabel')}
                    checked={Boolean(form?.isPublished)}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, isPublished: e.target.checked }));
                      toast.success(
                        e.target.checked ? tc('sections.publish.toastOn') : tc('sections.publish.toastOff')
                      );
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-orange-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                </label>
              </div>

              {/* Link trang đang dùng */}
              <div className="rounded-xl border border-gray-200/70 bg-white p-4 space-y-2">
                <p className="text-sm font-semibold text-gray-900">{tc('sections.publish.linkLabel')}</p>
                {publicUrl ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <code
                      data-testid="landing-public-url"
                      className="min-w-0 flex-1 truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm text-gray-900"
                    >
                      {publicUrl}
                    </code>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                      >
                        <HiOutlineClipboardCopy className="w-4 h-4" />
                        {tc('sections.publish.linkCopy')}
                      </button>
                      <a
                        href={publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-600 transition"
                      >
                        <HiOutlineExternalLink className="w-4 h-4" />
                        {tc('sections.publish.linkOpen')}
                      </a>
                    </div>
                  </div>
                ) : null}
                {linkHint ? <p className="text-xs text-gray-500">{linkHint}</p> : null}
                {publicUrl && !form?.isPublished ? (
                  <p className="text-xs text-amber-700">{tc('sections.publish.linkDraftHint')}</p>
                ) : null}
              </div>

              {/* Đường dẫn miễn phí (slug) — chỉ khi không dùng tên miền riêng */}
              {!hasCustomDomain && !isBrokenCustom && (
                <div>
                  <label htmlFor="landing-slug-input" className="block text-sm font-medium text-gray-700 mb-1.5">
                    {tc('sections.publish.slugLabel')}
                  </label>
                  <div className="flex gap-2">
                    <div className="flex min-w-0 flex-1 items-center rounded-lg border border-gray-200 focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100">
                      <input
                        id="landing-slug-input"
                        type="text"
                        value={form?.slug || ''}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            slug: e.target.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, ''),
                          }))
                        }
                        placeholder="ten-page"
                        className="min-w-0 flex-1 rounded-lg bg-transparent px-4 py-2.5 font-mono text-gray-900 placeholder:text-gray-400 focus:outline-none"
                      />
                      <span className="shrink-0 pr-3 font-mono text-sm text-gray-500">.{BASE_DOMAIN}</span>
                    </div>
                    <button
                      onClick={handleSaveSlug}
                      className="px-5 py-2.5 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition"
                    >
                      {tc('sections.publish.slugSave')}
                    </button>
                  </div>
                </div>
              )}

              {/* Tên miền riêng: kết nối (kiểm DNS trước) / gỡ / kiểm tra lại — xem CustomDomainPanel */}
              <CustomDomainPanel
                editingId={editingId}
                domain={domain}
                slug={form?.slug}
                onChanged={reloadDomain}
              />
            </div>
          </SectionCard>

          {/* ═══ KHỐI 2: Form thu khách ═══ */}
          <SectionCard
            expanded={expandedSections['lead-form']}
            onToggle={() => toggleSection('lead-form')}
            icon={<HiOutlineClipboardList className="w-5 h-5" />}
            title={tc('sections.leadForm.title')}
            badge={leadFormBadge}
            badgeClass="bg-blue-100 text-blue-700"
          >
            <LeadFormConfigPanel form={form} setForm={setForm} t={t} editingId={editingId} />
          </SectionCard>

          {/* ═══ KHỐI 3: Ảnh đã tải lên (cuối modal, mặc định thu gọn) ═══ */}
          <SectionCard
            expanded={expandedSections.images}
            onToggle={() => toggleSection('images')}
            icon={<HiOutlinePhotograph className="w-5 h-5" />}
            title={
              <span className="flex items-center gap-1.5 flex-wrap">
                <span>{tc('sections.images.title')}</span>
                <span className="text-sm font-normal text-gray-500">({uploadedImagesCount})</span>
              </span>
            }
          >
            <div className="space-y-4">
              {/* Dòng gợi ý thông minh */}
              <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200/70 text-xs text-amber-900 flex items-start gap-2.5">
                <span className="text-base leading-none shrink-0 mt-0.5">💡</span>
                <div className="space-y-0.5">
                  <div className="font-semibold text-amber-950">Mẹo chèn ảnh vào trang:</div>
                  <div className="text-amber-900/90 leading-relaxed">
                    Để ảnh nằm đúng vị trí đẹp nhất (Logo, Banner chính, Khối sản phẩm...), bạn chỉ cần đính kèm ảnh trực tiếp trong <strong>Khung Chat AI</strong> và nhắn vị trí mong muốn. Mục này dùng để bạn xem lại và lấy link các ảnh đã tải lên.
                  </div>
                </div>
              </div>

              {/* Nút Tải ảnh lên */}
              <div>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.gif,.heic,.heif"
                  multiple
                  className="hidden"
                  onChange={handleImageUpload}
                />
                <button
                  type="button"
                  disabled={isUploadingImage}
                  onClick={() => imageInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-xl text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 transition border border-gray-200/80"
                >
                  <HiOutlinePhotograph className="w-4 h-4 text-gray-500" />
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
 * Section Card - Collapsible section with header. `alwaysOpen`: khối luôn mở (không có nút thu gọn).
 */
function SectionCard({ expanded, onToggle, icon, title, badge, badgeClass, children, alwaysOpen = false }) {
  const headerContent = (
    <>
      <div className="flex items-center gap-3">
        <span className="text-gray-400">{icon}</span>
        <span className="font-semibold text-gray-900">{title}</span>
        {badge && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeClass}`}>
            {badge}
          </span>
        )}
      </div>
      {alwaysOpen ? null : expanded ? (
        <HiOutlineChevronDown className="w-5 h-5 text-gray-400" />
      ) : (
        <HiOutlineChevronRight className="w-5 h-5 text-gray-400" />
      )}
    </>
  );
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      {alwaysOpen ? (
        <div className="w-full flex items-center justify-between px-4 py-3 bg-gray-50">{headerContent}</div>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={Boolean(expanded)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition"
        >
          {headerContent}
        </button>
      )}

      {/* Content */}
      <div className={alwaysOpen || expanded ? 'px-4 py-4' : 'hidden'}>{children}</div>
    </div>
  );
}
