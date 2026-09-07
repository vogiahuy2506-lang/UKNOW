import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import LandingCanvasLayout from './LandingCanvasLayout.jsx';
import SettingsModal from './SettingsModal.jsx';
import BlockEditorModal from './BlockEditorModal.jsx';
import TemplateGalleryModal from './TemplateGalleryModal.jsx';
import VersionHistoryModal from './VersionHistoryModal.jsx';
import { useI18n } from '../../../i18n';
import {
  createLandingPageAdmin,
  createLandingTemplate,
  updateLandingPageAdmin,
} from '../../landing-pages/services/landingPagesAdminApi.service.js';
import { prepareLeadFormConfigForSave } from '../../landing-pages/utils/landingLeadFormConfig.js';

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
  const [saving, setSaving] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState(null);

  // Extra modals
  const [blockEditorOpen, setBlockEditorOpen] = useState(false);
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);

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
        const newId = created?.id ?? created?.data?.id;
        onClose?.(newId);
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || t('landingPagesAdmin.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [editingId, form, onClose, resolveLeadFormConfigForSave, t]);

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

  // Save directly as template - no modal
  const handleOpenSaveTemplate = useCallback(async () => {
    if (!form?.htmlContent?.trim()) {
      toast.error('Không có nội dung để lưu');
      return;
    }
    try {
      await createLandingTemplate({
        name: form.title || 'Landing Page Template',
        description: '',
        htmlStructure: form.htmlContent,
      });
      toast.success('Đã lưu vào gallery');
    } catch (e) {
      toast.error(e?.message || 'Không thể lưu template');
    }
  }, [form]);

  // Callbacks khi modal trả kết quả
  const handleTemplateApply = useCallback(
    (html, title) => {
      setForm((prev) => ({
        ...prev,
        htmlContent: html,
        ...(title ? { title } : {}),
      }));
      toast.success(tc('templateApplied'));
    },
    [setForm]
  );

  const handleBlockEditorApply = useCallback(
    (html) => {
      setForm((prev) => ({ ...prev, htmlContent: html }));
      toast.success(tc('blockEditorUpdated'));
    },
    [setForm]
  );

  const handleVersionRestore = useCallback(
    (html) => {
      setForm((prev) => ({ ...prev, htmlContent: html }));
      toast.success(tc('versionRestored'));
    },
    [setForm]
  );

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
      />

      <SettingsModal
        open={Boolean(activeModalTab)}
        tab={activeModalTab}
        onClose={handleCloseSettings}
        form={form}
        setForm={setForm}
        editingId={editingId}
      />

      <BlockEditorModal
        open={blockEditorOpen}
        html={form?.htmlContent || ''}
        onApply={handleBlockEditorApply}
        onClose={() => setBlockEditorOpen(false)}
      />

      <TemplateGalleryModal
        open={templateGalleryOpen}
        currentHtml={form?.htmlContent || ''}
        onApply={handleTemplateApply}
        onClose={() => setTemplateGalleryOpen(false)}
      />

      <VersionHistoryModal
        open={versionHistoryOpen}
        landingId={editingId}
        currentHtml={form?.htmlContent || ''}
        onRestore={handleVersionRestore}
        onClose={() => setVersionHistoryOpen(false)}
      />
    </>
  );
}
