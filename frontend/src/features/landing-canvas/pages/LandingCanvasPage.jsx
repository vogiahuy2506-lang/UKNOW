/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import LandingCanvasEditor from '../components/LandingCanvasEditor.jsx';
import {
  fetchLandingPageAdminById,
} from '../../landing-pages/services/landingPagesAdminApi.service.js';
import {
  defaultLeadFormConfig,
  normalizeLeadFormConfig,
  snapshotLeadFormPersistedMeta,
} from '../../landing-pages/utils/landingLeadFormConfig.js';
import { restoreOriginalHttpAnchors } from '../../landing-pages/utils/injectLandingEnhancements.js';
import { pickLinkedFormFields } from '../utils/landingFormLink.js';
import { useI18n } from '../../../i18n';
import { useAuthStore } from '../../../stores/authStore';
import {
  buildDraftKey,
  clearDraft,
  pickDraftForm,
  readDraft,
  snapshotDraftForm,
  stripMessagesUndoHtml,
} from '../utils/landingCanvasDraft.js';

/**
 * Landing đã lưu (server) → form của trình soạn.
 */
function buildServerForm(full) {
  return {
    slug: full.slug || '',
    title: full.title || '',
    htmlContent: restoreOriginalHttpAnchors(full.htmlContent || ''),
    isPublished: Boolean(full.isPublished),
    domainType: full.domainType === 'custom' ? 'custom' : 'system',
    customDomainHostname: full.customDomainHostname || null,
    customDomainIsApex: Boolean(full.customDomainIsApex),
    // Trạng thái hàng landing_page_domains ('active' | 'pending_verification' | 'disabled'). Trường CHỈ-SERVER
    // (không thuộc DRAFT_FORM_FIELDS, không gửi lên khi lưu) — modal Cài đặt trang dùng nó để hiện
    // "Đang chạy / Chờ xác minh" và chọn link trang.
    customDomainStatus: full.customDomainStatus || null,
    // PLAN_LEAD_FORM_TRUONG_THEM_2026-09-08.md PR-2d-1 việc 3: full.leadFormConfig đến từ
    // toPublicLeadFormConfig (backend, landingPageAdmin.service.js:35-38) — đã LUÔN đầy đủ
    // fixedFields/customFields. normalizeLeadFormConfig/snapshotLeadFormPersistedMeta ở
    // đây trước kia là bản tối giản, rơi mất 2 khoá đó ngay lúc đọc — nay đã là bản schema
    // đầy đủ (khôi phục ở landingLeadFormConfig.js), khoá key/option đã lưu giữ đúng để UI
    // tương lai (PR-2d-2) khoá được bất biến kiểu/mã option. Không đổi gì ở call site này —
    // sửa ở nguồn (utils) là đủ.
    leadFormConfig: normalizeLeadFormConfig(full.leadFormConfig),
    leadFormPersistedMeta: snapshotLeadFormPersistedMeta(full.leadFormConfig),
    leadFormFieldErrors: {},
    // PR-5b-2b mục 7 — Biểu mẫu gắn landing này (PR-5b-2a forms.landing_page_id), null nếu
    // chưa có. Dùng để hiện link "Mở Biểu mẫu của trang này" trong trình soạn.
    // PR-F: kèm tên / khoá công khai / nguồn ('chosen' = biểu mẫu khách chọn, 'basic' = form tự sinh) — chỉ-server.
    ...pickLinkedFormFields(full),
    // Lựa chọn "Dùng biểu mẫu đã tạo" chờ bấm Lưu (landingFormLink.js); null = không đổi gì.
    linkedFormChoice: null,
  };
}

/**
 * Page wrapper cho Landing Canvas editor — render bên trong MainLayout outlet.
 *
 * Routes:
 *   - /app/settings/landing-pages/new      → editingId = null
 *   - /app/settings/landing-pages/:id/edit → editingId = số
 *
 * Phase 2 flow:
 *   1. Mount → fetch (nếu edit) hoặc build default form (nếu new).
 *   2. Có thể nhận `aiDraft` từ location.state (khi user navigate từ AiChatbot).
 *   3. Render Loading / Error / LandingCanvasEditor.
 *
 * Nháp (PLAN_LANDING_GIU_NHAP_KHI_F5_2026-10-03.md): form đang soạn + hội thoại AI được ghi vào
 * localStorage (LandingCanvasEditor → useLandingCanvasDraft); mount lại thì khôi phục ở đây.
 */
export default function LandingCanvasPage() {
  const tc = useI18n('landingCanvas.notFound');
  const td = useI18n('landingCanvas.draft');
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Check if this is a "new" page:
  // - URL ends with /new (id is undefined because no :id param)
  // - Or id is literally 'new'
  const isNew = id === 'new' || (id === undefined && location.pathname.endsWith('/new'));
  const editingId = isNew ? null : Number(id);

  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  // Phiên soạn: mốc "bẩn", hội thoại + banner khôi phục từ nháp.
  const [session, setSession] = useState(null);
  const sessionRef = useRef(null);
  sessionRef.current = session;
  const loadedRouteRef = useRef(null);

  const user = useAuthStore((st) => st.user);
  const activeContext = useAuthStore((st) => st.activeContext);
  const userId = user?.id ?? null;
  const ownerId = activeContext?.type === 'employee' ? activeContext.ownerId : userId;
  const scope = useMemo(() => ({ userId, ownerId }), [userId, ownerId]);
  const aiDraft = location.state?.aiDraft || null;

  const buildDefaultForm = useCallback((draft) => {
    const draftHtml = (() => {
      const html = draft?.html || '';
      if (!html) return '';
      const isFullDoc = /<!doctype\s+html/i.test(html) || /<html[\s>]/i.test(html);
      if (isFullDoc) return html;
      return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${
        draft.title || ''
      }</title><script src="https://cdn.tailwindcss.com"></script><style>${
        draft.css || ''
      }</style></head><body>${html}</body></html>`;
    })();

    return {
      slug: '',
      title: draft?.title || '',
      htmlContent: draftHtml,
      isPublished: false,
      domainType: 'system',
      customDomainHostname: null,
      customDomainIsApex: false,
      // PLAN_LEAD_FORM_TRUONG_THEM_2026-09-08.md PR-2d-1 việc 2: leadFormConfig đã được BACKEND
      // áp dụng sẵn (applyLeadFormDraftToConfig, ai.controller.js) — dùng nguyên, không tự sinh
      // khoá cf_* ở trình duyệt nữa (applyLeadFormDraft cũ là nguồn khoá ngẫu nhiên).
      leadFormConfig: draft?.leadFormConfig
        ? normalizeLeadFormConfig(draft.leadFormConfig)
        : defaultLeadFormConfig(),
      leadFormPersistedMeta: { keys: [], optionValuesByKey: {} },
      leadFormFieldErrors: {},
      linkedFormId: null,
      linkedFormTitle: null,
      linkedFormPublicKey: null,
      linkedFormSource: null,
      linkedFormChoice: null,
    };
  }, []);

  /** Trường nháp → form (leadFormConfig chuẩn hoá lại; trường chỉ-server giữ từ `base`). */
  const applyDraftForm = useCallback((base, draftForm) => {
    const picked = pickDraftForm(draftForm) || {};
    return {
      ...base,
      ...picked,
      leadFormConfig: picked.leadFormConfig
        ? normalizeLeadFormConfig(picked.leadFormConfig)
        : base.leadFormConfig,
    };
  }, []);

  const startSession = useCallback((nextForm, extra = {}) => {
    setForm(nextForm);
    setSession({
      baseline: extra.baseline,
      baseUpdatedAt: extra.baseUpdatedAt ?? null,
      initialMessages: extra.initialMessages || [],
      restoredAt: extra.restoredAt ?? null,
      nonce: (sessionRef.current?.nonce || 0) + 1,
    });
  }, []);

  useEffect(() => {
    const routeKey = isNew ? 'new' : String(editingId);
    // Sau khi dùng aiDraft ta `replace` state=null → effect chạy lại; đừng dựng lại phiên (mất hội thoại).
    if (isNew && !aiDraft && loadedRouteRef.current === routeKey && sessionRef.current) {
      return undefined;
    }
    loadedRouteRef.current = routeKey;

    setError(null);
    setForm(null);
    setSession(null);
    const draftKey = buildDraftKey(scope, isNew ? null : editingId);

    if (isNew) {
      const emptyForm = buildDefaultForm(null);
      const baseline = snapshotDraftForm(emptyForm);
      if (aiDraft) {
        // Trợ lý AI chuyển sang: dùng bản này, GHI ĐÈ nháp cũ, rồi xoá state khỏi history —
        // history.state sống qua F5, không xoá thì F5 sau đó áp lại aiDraft đè bản đã sửa tiếp.
        clearDraft(draftKey);
        startSession(buildDefaultForm(aiDraft), { baseline });
        navigate(location.pathname, { replace: true, state: null });
        return undefined;
      }
      const saved = readDraft(draftKey);
      if (saved && (saved.form || saved.messages.length > 0)) {
        let restoredForm = emptyForm;
        try {
          if (saved.form) restoredForm = applyDraftForm(emptyForm, saved.form);
        } catch {
          restoredForm = emptyForm;
        }
        startSession(restoredForm, {
          baseline,
          initialMessages: saved.messages,
          restoredAt: saved.savedAt,
        });
        return undefined;
      }
      startSession(emptyForm, { baseline });
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const full = await fetchLandingPageAdminById(editingId);
        if (cancelled) return;
        const serverForm = buildServerForm(full);
        const serverUpdatedAt = full.updatedAt ?? null;
        const baseline = snapshotDraftForm(serverForm);
        const saved = readDraft(draftKey);
        if (!saved) {
          startSession(serverForm, { baseline, baseUpdatedAt: serverUpdatedAt });
          return;
        }
        const matches = Boolean(serverUpdatedAt) && saved.baseUpdatedAt === serverUpdatedAt;
        if (matches) {
          let nextForm = serverForm;
          try {
            if (saved.form) nextForm = applyDraftForm(serverForm, saved.form);
          } catch {
            nextForm = serverForm;
          }
          startSession(nextForm, {
            baseline,
            baseUpdatedAt: serverUpdatedAt,
            initialMessages: saved.messages,
            restoredAt: saved.form ? saved.savedAt : null,
          });
          return;
        }
        // Trang đã được lưu ở nơi khác sau khi nháp ghi: bỏ form nháp; Hoàn tác không được kéo về
        // HTML cũ hơn bản đã lưu → bỏ previousHtml/suggestedHtml của hội thoại.
        if (saved.form) toast(td('staleDraft'));
        startSession(serverForm, {
          baseline,
          baseUpdatedAt: serverUpdatedAt,
          initialMessages: stripMessagesUndoHtml(saved.messages),
        });
      } catch (e) {
        if (cancelled) return;
        setError(e);
        toast.error(e?.response?.data?.message || tc('loadFailed'));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [buildDefaultForm, editingId, isNew, aiDraft, scope]);

  /** Bắt đầu trang mới / Bỏ bản nháp: dựng lại phiên sạch (Editor đã xoá nháp trước khi gọi). */
  const handleResetSession = useCallback(() => {
    setError(null);
    if (isNew) {
      const emptyForm = buildDefaultForm(null);
      startSession(emptyForm, { baseline: snapshotDraftForm(emptyForm) });
      return;
    }
    // Trang sửa: tải lại bản đã lưu từ server.
    setForm(null);
    setSession(null);
    (async () => {
      try {
        const full = await fetchLandingPageAdminById(editingId);
        const serverForm = buildServerForm(full);
        startSession(serverForm, {
          baseline: snapshotDraftForm(serverForm),
          baseUpdatedAt: full.updatedAt ?? null,
        });
      } catch (e) {
        setError(e);
        toast.error(e?.response?.data?.message || tc('loadFailed'));
      }
    })();
  }, [buildDefaultForm, editingId, isNew, startSession, tc]);

  const handleClose = useCallback(
    (nextId) => {
      // Sau khi create → nếu có newId (số/chuỗi, KHÔNG phải sự kiện click) thì chuyển sang edit mode
      const validId = typeof nextId === 'number' || typeof nextId === 'string' ? nextId : null;
      if (validId && !editingId) {
        navigate(`/app/settings/landing-pages/${validId}/edit`, { replace: true });
        return;
      }
      navigate('/app/settings/landing-pages');
    },
    [editingId, navigate]
  );

  if (error) {
    return (
      <CanvasState
        title={tc('title')}
        description={error?.response?.data?.message || error?.message || tc('description')}
        actionLabel={tc('backToList')}
        onAction={() => navigate('/app/settings/landing-pages')}
      />
    );
  }

  if (!form || !session) {
    return <CanvasState title={tc('loading')} spinner />;
  }

  return (
    <LandingCanvasEditor
      key={`${isNew ? 'new' : editingId}:${session.nonce}`}
      editingId={editingId}
      form={form}
      setForm={setForm}
      onClose={handleClose}
      scope={scope}
      baseline={session.baseline}
      baseUpdatedAt={session.baseUpdatedAt}
      initialMessages={session.initialMessages}
      restoredAt={session.restoredAt}
      onResetSession={handleResetSession}
    />
  );
}

function CanvasState({ title, description, actionLabel, onAction, spinner = false }) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-3 max-w-md">
          {spinner ? (
            <div className="mx-auto w-8 h-8 border-2 border-gray-300 border-t-orange-500 rounded-full animate-spin" />
          ) : null}
          <p className="text-base font-semibold text-gray-800">{title}</p>
          {description ? <p className="text-sm text-gray-500">{description}</p> : null}
          {actionLabel ? (
            <button
              type="button"
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-orange-500 text-white text-[13px] font-medium hover:bg-orange-600 transition-colors"
              onClick={onAction}
            >
              {actionLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
