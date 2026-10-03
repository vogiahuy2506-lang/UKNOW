/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import LandingCanvasLayout from './LandingCanvasLayout.jsx';
import SettingsModal from './SettingsModal.jsx';
import ImportHtmlModal from './ImportHtmlModal.jsx';
import LeaveEditorModal from './LeaveEditorModal.jsx';
import useLandingCanvasDraft from '../hooks/useLandingCanvasDraft.js';
import { isDraftFormDirty, snapshotDraftForm } from '../utils/landingCanvasDraft.js';
import { useBrowserRouterBlocker } from '../../campaigns/hooks/useBrowserRouterBlocker.js';
import { useI18n } from '../../../i18n';
import {
  createLandingPageAdmin,
  updateLandingPageAdmin,
} from '../../landing-pages/services/landingPagesAdminApi.service.js';
import { prepareLeadFormConfigForSave } from '../../landing-pages/utils/landingLeadFormConfig.js';
import { applyLinkedFormChoiceToHtml, buildLinkedFormPayload } from '../utils/landingFormLink.js';
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
export default function LandingCanvasEditor({
  editingId,
  form,
  setForm,
  onClose,
  // --- Nháp (PLAN_LANDING_GIU_NHAP_KHI_F5_2026-10-03.md) ---
  scope = null, // { userId, ownerId } — khoá nháp theo người dùng + chủ workspace
  baseline = null, // ảnh chụp form lúc tải xong / form rỗng (trang mới) — mốc để tính "bẩn"
  baseUpdatedAt = null, // updatedAt của bản đã lưu mà nháp dựa trên
  initialMessages = null, // hội thoại AI khôi phục từ nháp
  restoredAt = null, // có giá trị → hiện banner "Đã khôi phục bản nháp lúc …"
  onResetSession, // Page dựng lại phiên mới (sau Bắt đầu trang mới / Bỏ bản nháp)
}) {
  const { t } = useI18n();
  const tc = useI18n('landingCanvas.landingCanvasEditor');
  const ti = useI18n('landingCanvas.importHtml');
  const [saving, setSaving] = useState(false);
  const td = useI18n('landingCanvas.draft');
  const [baselineSnapshot, setBaselineSnapshot] = useState(baseline);
  const [messages, setMessages] = useState(initialMessages || []);
  const [leaveError, setLeaveError] = useState(null);
  // Bẩn = form khác mốc (tin nhắn không làm bẩn).
  const dirty = useMemo(
    () => isDraftFormDirty(form, baselineSnapshot),
    [form, baselineSnapshot]
  );
  const blocker = useBrowserRouterBlocker(dirty);
  const draft = useLandingCanvasDraft({
    scope,
    editingId,
    form,
    messages,
    dirty,
    baseUpdatedAt,
    interruptedText: td('interrupted'),
  });
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

  /**
   * Lưu landing. `navigateAfter:false` dùng cho modal "Lưu và rời đi" (điều hướng do bộ chặn lo).
   * `title` ghi đè tên (modal nhập tên khi trang chưa có tên).
   * @returns {Promise<{ok: boolean, id?: number|null, updatedAt?: string|null, message?: string}>}
   */
  const saveLanding = useCallback(async ({ navigateAfter = true, title: titleOverride } = {}) => {
    const effectiveTitle = titleOverride !== undefined ? titleOverride : form.title;
    const slug = String(form.slug || '').trim().toLowerCase();
    if (!String(effectiveTitle || '').trim()) {
      toast.error(tc('titleRequiredToast'));
      return { ok: false, message: tc('titleRequiredToast') };
    }
    const leadFormConfig = resolveLeadFormConfigForSave();
    if (!leadFormConfig) return { ok: false };
    setSaving(true);
    try {
      if (editingId) {
        // "Dùng biểu mẫu đã tạo" (PR-F): lựa chọn chờ lưu → gửi `linkedFormId` + đưa HTML về dạng có ĐÚNG MỘT chỗ trống
        // chờ biểu mẫu (backend thay bằng khối nhúng). Không có lựa chọn thì body và HTML y nguyên như trước.
        const linkChoice = form.linkedFormChoice || null;
        const htmlToSave = linkChoice
          ? applyLinkedFormChoiceToHtml(form.htmlContent, linkChoice, form.linkedFormPublicKey)
          : form.htmlContent;
        const updated = await updateLandingPageAdmin(editingId, {
          slug: slug || null,
          title: effectiveTitle,
          htmlContent: htmlToSave,
          isPublished: form.isPublished,
          domainType: form.domainType,
          customDomainHostname: form.customDomainHostname,
          customDomainIsApex: form.customDomainIsApex,
          leadFormConfig,
          ...buildLinkedFormPayload(linkChoice),
        });
        toast.success(t('landingPagesAdmin.updated'));
        if (updated?.warning) {
          toast(updated.warning, { icon: '⚠️', duration: 6000 });
        }
        const updatedAt = updated?.updatedAt ?? null;
        // Lưu xong trình soạn đóng (onClose bên dưới) nên không cần đồng bộ lại biểu mẫu đang gắn vào state: mở lại thì tải
        // từ server (GET trả linkedFormId / Source / PublicKey).
        const savedForm = { ...form, title: effectiveTitle };
        if (titleOverride !== undefined) setForm((prev) => ({ ...prev, title: effectiveTitle }));
        setBaselineSnapshot(snapshotDraftForm(savedForm));
        draft.commitSaved({ updatedAt });
        if (navigateAfter) {
          blocker.allowNext();
          onClose?.();
        }
        return { ok: true, id: editingId, updatedAt };
      } else {
        const created = await createLandingPageAdmin({
          slug: slug || null,
          title: effectiveTitle,
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
        const updatedAt = created?.updatedAt ?? created?.data?.updatedAt ?? null;
        const savedForm = { ...form, title: effectiveTitle };
        if (titleOverride !== undefined) setForm((prev) => ({ ...prev, title: effectiveTitle }));
        setBaselineSnapshot(snapshotDraftForm(savedForm));
        // Hội thoại chuyển sang khoá của trang vừa tạo (mở lại vẫn thấy cuộc trò chuyện).
        draft.commitSaved({ newId: newId ?? null, updatedAt });
        if (navigateAfter) {
          blocker.allowNext();
          onClose?.(newId);
        }
        return { ok: true, id: newId ?? null, updatedAt };
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
      return { ok: false, message };
    } finally {
      setSaving(false);
    }
  }, [blocker, draft, editingId, form, onClose, resolveLeadFormConfigForSave, setForm, t, tc]);

  const handleSave = useCallback(() => saveLanding({ navigateAfter: true }), [saveLanding]);

  // onClose của topbar nhận cả sự kiện click — chỉ gọi không đối số (tránh coi event là newId).
  const handleCloseRequest = useCallback(() => {
    onClose?.();
  }, [onClose]);

  // --- Rời trình soạn khi còn thay đổi chưa lưu: modal Lưu / Không lưu / Ở lại ---
  const leaveOpen = blocker.state === 'blocked';
  useEffect(() => {
    if (!leaveOpen) setLeaveError(null);
  }, [leaveOpen]);

  const handleLeaveSave = useCallback(
    async (title) => {
      setLeaveError(null);
      const result = await saveLanding({ navigateAfter: false, title });
      if (result.ok) {
        blocker.proceed();
      } else if (result.message) {
        setLeaveError(result.message);
      }
    },
    [blocker, saveLanding]
  );

  const handleLeaveDiscard = useCallback(() => {
    draft.discard();
    blocker.proceed();
  }, [blocker, draft]);

  const handleLeaveStay = useCallback(() => {
    blocker.reset();
  }, [blocker]);

  // Ghi nháp thất bại (hết dung lượng) mà còn thay đổi chưa lưu → cảnh báo của trình duyệt khi F5/đóng tab.
  const shouldWarnUnload = draft.writeFailed && dirty;
  useEffect(() => {
    if (!shouldWarnUnload) return undefined;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [shouldWarnUnload]);

  const handleDiscardRestored = useCallback(() => {
    draft.discard();
    onResetSession?.();
  }, [draft, onResetSession]);

  const restoredBanner = restoredAt ? (
    <div
      data-testid="draft-restored-banner"
      className="shrink-0 flex items-center justify-between gap-3 px-4 py-1.5 bg-amber-50 border-b border-amber-200 text-[13px] text-amber-900"
    >
      <span className="min-w-0 truncate">
        {td('restoredBanner', {
          time: new Date(restoredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        })}
      </span>
      <button
        type="button"
        onClick={handleDiscardRestored}
        className="shrink-0 font-semibold text-amber-800 hover:text-amber-950 underline"
      >
        {editingId ? td('discardDraft') : td('startNew')}
      </button>
    </div>
  ) : null;

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
        onClose={handleCloseRequest}
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
        initialMessages={initialMessages}
        onMessagesChange={setMessages}
        banner={restoredBanner}
      />

      <LeaveEditorModal
        open={leaveOpen}
        initialTitle={form?.title || ''}
        saving={saving}
        error={leaveError}
        onSave={handleLeaveSave}
        onDiscard={handleLeaveDiscard}
        onStay={handleLeaveStay}
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
