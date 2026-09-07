/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useState } from 'react';
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
  applyLeadFormDraft,
} from '../../landing-pages/utils/landingLeadFormConfig.js';
import { useI18n } from '../../../i18n';

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
 */
export default function LandingCanvasPage() {
  const tc = useI18n('landingCanvas.notFound');
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Check if this is a "new" page:
  // - URL ends with /new (id is undefined because no :id param)
  // - Or id is literally 'new'
  const isNew = id === 'new' || (id === undefined && location.pathname.endsWith('/new'));
  console.log('[LandingCanvasPage] Params:', { id, isNew, idType: typeof id, pathname: location.pathname });
  const editingId = isNew ? null : Number(id);

  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);

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
      leadFormConfig: draft?.leadFormDraft
        ? applyLeadFormDraft(draft.leadFormDraft)
        : defaultLeadFormConfig(),
      leadFormPersistedMeta: { keys: [], optionValuesByKey: {} },
      leadFormFieldErrors: {},
    };
  }, []);

  useEffect(() => {
    setError(null);
    setForm(null);

    if (isNew) {
      const draft = location.state?.aiDraft || null;
      setForm(buildDefaultForm(draft));
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const full = await fetchLandingPageAdminById(editingId);
        if (cancelled) return;
        setForm({
          slug: full.slug || '',
          title: full.title || '',
          htmlContent: full.htmlContent || '',
          isPublished: Boolean(full.isPublished),
          domainType: full.domainType === 'custom' ? 'custom' : 'system',
          customDomainHostname: full.customDomainHostname || null,
          customDomainIsApex: Boolean(full.customDomainIsApex),
          leadFormConfig: normalizeLeadFormConfig(full.leadFormConfig),
          leadFormPersistedMeta: snapshotLeadFormPersistedMeta(full.leadFormConfig),
          leadFormFieldErrors: {},
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
  }, [buildDefaultForm, editingId, isNew, location.state]);

  const handleClose = useCallback(
    (nextId) => {
      // Sau khi create → nếu có newId thì chuyển sang edit mode
      if (nextId && !editingId) {
        navigate(`/app/settings/landing-pages/${nextId}/edit`, { replace: true });
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

  if (!form) {
    return <CanvasState title={tc('loading')} spinner />;
  }

  return <LandingCanvasEditor editingId={editingId} form={form} setForm={setForm} onClose={handleClose} />;
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
