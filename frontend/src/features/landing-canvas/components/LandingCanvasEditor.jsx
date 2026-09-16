/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import LandingCanvasLayout from './LandingCanvasLayout.jsx';
import SettingsModal from './SettingsModal.jsx';
import ImportHtmlModal from './ImportHtmlModal.jsx';
import { useI18n } from '../../../i18n';
import {
  createLandingPageAdmin,
  updateLandingPageAdmin,
} from '../../landing-pages/services/landingPagesAdminApi.service.js';
import { prepareLeadFormConfigForSave } from '../../landing-pages/utils/landingLeadFormConfig.js';
// Import components từ GitHub (landing-pages)
import TemplateGallery from '../../landing-pages/components/TemplateGallery.jsx';
import SaveTemplateModal from '../../landing-pages/components/SaveTemplateModal.jsx';
import VisualBlockEditor from '../../landing-pages/components/VisualBlockEditor.jsx';
import LandingVersionModal from '../../landing-pages/components/LandingVersionModal.jsx';

/**
 * Main canvas editor component.
 *
 * Quản lý:
 *  - Form state (prop từ LandingCanvasPage)
 *  - Save logic (create/update API)
 *  - Settings Modal slide-in từ phải (Phase 5)
 *  - Block Editor Modal (Phase Extra)
 *  - Template Gallery Modal (Phase Extra)
 *  - Version History Modal (Phase Extra)
 */
export default function LandingCanvasEditor({ editingId, form, setForm, onClose }) {
  const { t } = useI18n();
  const tc = useI18n('landingCanvas.landingCanvasEditor');
  const ti = useI18n('landingCanvas.importHtml');
  const [saving, setSaving] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState(null);

  // Extra modals
  const [blockEditorOpen, setBlockEditorOpen] = useState(false);
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [importHtmlOpen, setImportHtmlOpen] = useState(false);
  // Đổi mỗi lần Nhập HTML áp dụng → remount CanvasPreviewArea để mode nội bộ của nó reset về
  // 'view' (PLAN_LANDING_DAN_HTML_CO_SAN_2026-09-13.md, Việc 1 — "cần mode nâng lên editor hoặc
  // reset qua key"; chọn key vì không cần đổi API/props hiện có của CanvasPreviewArea).
  const [previewResetKey, setPreviewResetKey] = useState(0);
  const previousHtmlRef = useRef('');

  const handleOpenSettingTab = useCallback((tab) => {
    setActiveModalTab((cur) => (cur === tab ? null : tab));
  }, []);

  const handleCloseSettings = useCallback(() => {
    setActiveModalTab(null);
  }, []);

  // Lắng nghe event từ SettingsModal tabs (thay đổi tab nội bộ)
  useEffect(() => {
    const handler = (e) => {
      if (typeof e.detail === 'string') {
        setActiveModalTab(e.detail);
      }
    };
    window.addEventListener('landing-canvas:change-setting-tab', handler);
    return () => window.removeEventListener('landing-canvas:change-setting-tab', handler);
  }, []);

  const resolveLeadFormConfigForSave = useCallback(() => {
    const { config, errors } = prepareLeadFormConfigForSave(
      form.leadFormConfig,
      form.leadFormPersistedMeta
    );
    if (errors.length) {
      setForm((prev) => ({
        ...prev,
        leadFormFieldErrors: Object.fromEntries(errors.map((e) => [e.key, e.message])),
      }));
      toast.error(errors[0].message);
      return null;
    }
    return config;
  }, [form.leadFormConfig, form.leadFormPersistedMeta, setForm]);

  const handleSave = useCallback(async () => {
    const slug = String(form.slug || '').trim().toLowerCase();
    if (!String(form.title || '').trim()) {
      toast.error(tc('titleRequiredToast'));
      return;
    }
    const leadFormConfig = resolveLeadFormConfigForSave();
    if (!leadFormConfig) return;
    setSaving(true);
    try {
      if (editingId) {
        const updated = await updateLandingPageAdmin(editingId, {
          slug: slug || null,
          title: form.title,
          htmlContent: form.htmlContent,
          isPublished: form.isPublished,
          domainType: form.domainType,
          customDomainHostname: form.customDomainHostname,
          customDomainIsApex: form.customDomainIsApex,
          leadFormConfig,
        });
        toast.success(t('landingPagesAdmin.updated'));
        if (updated?.warning) {
          toast(updated.warning, { icon: '⚠️', duration: 6000 });
        }
        onClose?.();
      } else {
        const created = await createLandingPageAdmin({
          slug: slug || null,
          title: form.title,
          htmlContent: form.htmlContent,
          isPublished: form.isPublished,
          domainType: form.domainType,
          customDomainHostname: form.customDomainHostname,
          customDomainIsApex: form.customDomainIsApex,
          leadFormConfig,
        });
        toast.success(t('landingPagesAdmin.created'));
        // Câu 3 sếp hỏi 14/09 — create() giờ cũng trả `warning` (ô form chưa khai báo), y hệt
        // update() bên trên; trước đây nhánh này bỏ qua field đó nên cảnh báo backend không tới
        // được người dùng khi TẠO MỚI landing có form dán sẵn ô lạ.
        if (created?.warning) {
          toast(created.warning, { icon: '⚠️', duration: 6000 });
        }
        const newId = created?.id ?? created?.data?.id;
        onClose?.(newId);
      }
    } catch (e) {
      const message = e?.response?.data?.message || e?.message || t('landingPagesAdmin.saveFailed');
      // PLAN_LEAD_FORM_TRUONG_THEM_2026-09-08.md PR-2d-2 việc 3: lỗi bất biến trường đã lưu
      // (validateCustomFieldInput, landingLeadFormConfig.util.js backend) không kèm khoá field
      // nào — configError() backend chỉ ném Error(message) trơn, không có .key (đọc code xác
      // nhận, "Backend không đổi" nên không thêm ở đây). Vì vậy KHÔNG thể chỉ đúng 1 dòng —
      // đánh dấu toàn bộ field đã persist (chắc chắn chứa đúng field gây lỗi, vì backend chỉ ném
      // lỗi này khi field.key đã có trong existingByKey, tức đã persist) để người dùng thấy đúng
      // vùng nghi vấn thay vì chỉ toast chung chung không biết sửa gì. UI đã khoá kiểu/mã option
      // cho field đã persist (panel disabled) nên lỗi này chỉ xảy ra trong ca hiếm (persistedMeta
      // cũ do đa tab/đua cập nhật), không phải luồng thao tác bình thường.
      if (/không được đổi (loại trường|mã lựa chọn) đã lưu/i.test(message)) {
        const persistedKeys = form.leadFormPersistedMeta?.keys || [];
        if (persistedKeys.length > 0) {
          setForm((prev) => ({
            ...prev,
            leadFormFieldErrors: {
              ...(prev.leadFormFieldErrors || {}),
              ...Object.fromEntries(persistedKeys.map((key) => [key, message])),
            },
          }));
        }
      }
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }, [editingId, form, onClose, resolveLeadFormConfigForSave, setForm, t]);

  // Handlers cho topbar extras
  const handleOpenTemplateGallery = useCallback(() => {
    setTemplateGalleryOpen(true);
  }, []);
  const handleOpenBlockEditor = useCallback(() => {
    setBlockEditorOpen(true);
  }, []);
  const handleOpenVersionHistory = useCallback(() => {
    if (!editingId) {
      toast(tc('versionHistoryUnavailable'));
      return;
    }
    setVersionHistoryOpen(true);
  }, [editingId]);

  // Open save template modal
  const handleOpenSaveTemplate = useCallback(() => {
    if (!form?.htmlContent?.trim()) {
      toast.error('Không có nội dung để lưu');
      return;
    }
    setSaveTemplateOpen(true);
  }, [form]);

  const handleOpenImportHtml = useCallback(() => {
    setImportHtmlOpen(true);
  }, []);

  /**
   * Áp dụng HTML vừa nhập (dán/đọc từ tệp) — KHÔNG qua AI, KHÔNG gọi prepareLandingHtmlOnSave ở
   * trình duyệt (backend tự làm lúc lưu, landingPageAdmin.service.js:128-132). ImportHtmlModal đã
   * tự hỏi xác nhận nếu trang đang có nội dung; ở đây chỉ còn việc set state + cho hoàn tác.
   */
  const handleApplyImportedHtml = useCallback((html) => {
    previousHtmlRef.current = form?.htmlContent || '';
    setForm((prev) => ({ ...prev, htmlContent: html }));
    setPreviewResetKey((k) => k + 1);

    toast.custom((t) => (
      <div
        className="flex items-center gap-3 bg-white rounded-lg shadow-lg border border-gray-200 px-4 py-3"
        style={{ opacity: t.visible ? 1 : 0, transition: 'opacity 0.2s' }}
      >
        <span className="text-[14px] text-gray-700">{ti('applied')}</span>
        <button
          type="button"
          onClick={() => {
            setForm((prev) => ({ ...prev, htmlContent: previousHtmlRef.current }));
            setPreviewResetKey((k) => k + 1);
            toast.dismiss(t.id);
          }}
          className="text-[13px] font-semibold text-orange-600 hover:text-orange-700"
        >
          {ti('undo')}
        </button>
      </div>
    ));
  }, [form, setForm, ti]);

  return (
    <>
      <LandingCanvasLayout
        form={form}
        setForm={setForm}
        editingId={editingId}
        saving={saving}
        onClose={onClose}
        onSave={handleSave}
        activeModalTab={activeModalTab}
        onOpenSettingTab={handleOpenSettingTab}
        onCloseSettings={handleCloseSettings}
        onOpenTemplateGallery={handleOpenTemplateGallery}
        onOpenVisualEditor={handleOpenBlockEditor}
        onOpenVersionHistory={handleOpenVersionHistory}
        onOpenSaveTemplate={handleOpenSaveTemplate}
        onOpenImportHtml={handleOpenImportHtml}
        previewResetKey={previewResetKey}
      />

      <ImportHtmlModal
        isOpen={importHtmlOpen}
        onClose={() => setImportHtmlOpen(false)}
        currentHtml={form?.htmlContent || ''}
        onApply={handleApplyImportedHtml}
      />

      <SettingsModal
        open={Boolean(activeModalTab)}
        tab={activeModalTab}
        onClose={handleCloseSettings}
        form={form}
        setForm={setForm}
        editingId={editingId}
      />

      {/* Visual Block Editor Modal */}
      <VisualBlockEditor
        isOpen={blockEditorOpen}
        onClose={() => setBlockEditorOpen(false)}
        initialHtml={form?.htmlContent || ''}
        onSave={(result) => {
          setForm((prev) => ({ ...prev, htmlContent: result.html }));
          toast.success(tc('blockEditorUpdated'));
          setBlockEditorOpen(false);
        }}
        onSaveAsTemplate={() => {
          setBlockEditorOpen(false);
          handleOpenSaveTemplate();
        }}
      />

      {/* Template Gallery Modal */}
      <TemplateGallery
        isOpen={templateGalleryOpen}
        onClose={() => setTemplateGalleryOpen(false)}
        onSelect={({ template, html }) => {
          setForm((prev) => ({
            ...prev,
            htmlContent: html,
            templateId: template.id,
            templateName: template.name,
          }));
          toast.success(tc('templateApplied'));
          setTemplateGalleryOpen(false);
        }}
        onGenerateWithAi={() => {
          setTemplateGalleryOpen(false);
          // TODO: Open AI modal
        }}
      />

      {/* Save Template Modal */}
      <SaveTemplateModal
        isOpen={saveTemplateOpen}
        onClose={() => setSaveTemplateOpen(false)}
        htmlContent={form?.htmlContent || ''}
        landingPageTitle={form?.title || ''}
        onSuccess={() => {
          toast.success('Đã lưu template');
        }}
      />

      {/* Landing Page Version History Modal */}
      <LandingVersionModal
        open={versionHistoryOpen}
        onClose={() => setVersionHistoryOpen(false)}
        landingPageId={editingId}
        onRestoreVersion={(htmlContent) => {
          setForm((prev) => ({ ...prev, htmlContent }));
          toast.success(tc('versionRestored'));
        }}
      />
    </>
  );
}
