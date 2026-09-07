/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import LandingCanvasLayout from './LandingCanvasLayout.jsx';
import SettingsModal from './SettingsModal.jsx';
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
  const [saving, setSaving] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState(null);

  // Extra modals
  const [blockEditorOpen, setBlockEditorOpen] = useState(false);
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);

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

  // Open save template modal
  const handleOpenSaveTemplate = useCallback(() => {
    if (!form?.htmlContent?.trim()) {
      toast.error('Không có nội dung để lưu');
      return;
    }
    setSaveTemplateOpen(true);
  }, [form]);

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
