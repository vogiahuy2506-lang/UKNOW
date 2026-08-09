import { useCallback, useEffect, useMemo, useState } from 'react';
import { HiOutlinePhotograph, HiOutlineExclamation } from 'react-icons/hi';
import api from '../../services/api';
import MessageAttachments from '../../components/MessageAttachments';
import { useI18n } from '../../i18n';

function daysRemaining(expiresAt) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function SourceBadge({ source, t }) {
  const label = {
    chatbot_web: t('mediaLibrary.sourceWeb'),
    chatbot_studio: t('mediaLibrary.sourceStudio'),
    ai_assistant: t('mediaLibrary.sourceAssistant'),
  }[source] || source;
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
      {label}
    </span>
  );
}

function LibraryCard({ item, t }) {
  const days = daysRemaining(item.expiresAt);
  return (
    <div className="border border-slate-200 rounded-xl p-3 bg-white flex flex-col gap-2 min-h-[140px]">
      <div className="flex items-center justify-between gap-2">
        <SourceBadge source={item.source} t={t} />
        {days != null && (
          <span className="text-[11px] text-slate-500">
            {t('mediaLibrary.daysLeft', { days })}
          </span>
        )}
      </div>
      <MessageAttachments
        attachments={[{
          type: item.type,
          url: item.url,
          name: item.displayName || item.name,
          size: item.sizeBytes || item.size,
        }]}
      />
      <div className="text-xs text-slate-600 truncate" title={item.displayName || item.name}>
        {item.displayName || item.name || '—'}
      </div>
    </div>
  );
}

function ChannelCard({ item, t }) {
  const [broken, setBroken] = useState(false);
  const isImage = item.type === 'image' || item.type === 'photo';

  if (broken || !item.url) {
    return (
      <div className="border border-amber-100 bg-amber-50 rounded-xl p-3 text-sm text-amber-800 flex gap-2 items-start">
        <HiOutlineExclamation className="w-4 h-4 mt-0.5 shrink-0" />
        <span>{t('mediaLibrary.platformFallback')}</span>
      </div>
    );
  }

  if (isImage) {
    return (
      <div className="border border-slate-200 rounded-xl p-3 bg-white space-y-2">
        <span className="text-[10px] font-semibold uppercase text-slate-500">{item.platform}</span>
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="block">
          <img
            src={item.url}
            alt={item.name || ''}
            className="max-h-40 rounded-lg object-cover w-full"
            onError={() => setBroken(true)}
          />
        </a>
        {item.name && <div className="text-xs text-slate-600 truncate">{item.name}</div>}
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-xl p-3 bg-white">
      <MessageAttachments attachments={[item]} />
    </div>
  );
}

export default function MediaLibraryPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState('owned'); // owned | channels
  const [source, setSource] = useState('');
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1, limit: 24 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const path = tab === 'channels' ? '/media-library/channels' : '/media-library';
      const params = { page, limit: 24 };
      if (tab === 'owned' && source) params.source = source;
      const res = await api.get(path, { params });
      setItems(res.data?.data || []);
      setPagination(res.data?.pagination || { total: 0, pages: 1, limit: 24 });
    } catch (err) {
      setError(err.response?.data?.message || err.message || t('mediaLibrary.loadError'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tab, source, page, t]);

  useEffect(() => {
    load();
  }, [load]);

  const sourceOptions = useMemo(() => ([
    { value: '', label: t('mediaLibrary.allSources') },
    { value: 'chatbot_web', label: t('mediaLibrary.sourceWeb') },
    { value: 'chatbot_studio', label: t('mediaLibrary.sourceStudio') },
    { value: 'ai_assistant', label: t('mediaLibrary.sourceAssistant') },
  ]), [t]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
          <HiOutlinePhotograph className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t('mediaLibrary.title')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('mediaLibrary.subtitle')}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={() => { setTab('owned'); setPage(1); }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === 'owned' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
        >
          {t('mediaLibrary.tabOwned')}
        </button>
        <button
          type="button"
          onClick={() => { setTab('channels'); setPage(1); }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === 'channels' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
        >
          {t('mediaLibrary.tabChannels')}
        </button>
        {tab === 'owned' && (
          <select
            value={source}
            onChange={(e) => { setSource(e.target.value); setPage(1); }}
            className="ml-auto border border-slate-200 rounded-lg text-sm px-2 py-1.5 bg-white"
          >
            {sourceOptions.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}
      </div>

      {tab === 'channels' && (
        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          {t('mediaLibrary.channelsNote')}
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500 py-12 text-center">{t('common.loading')}</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-slate-500 py-12 text-center border border-dashed border-slate-200 rounded-xl">
          {t('mediaLibrary.empty')}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tab === 'owned'
            ? items.map((item) => <LibraryCard key={item.id} item={item} t={t} />)
            : items.map((item, idx) => (
              <ChannelCard key={`${item.messageId || idx}-${item.url}`} item={item} t={t} />
            ))}
        </div>
      )}

      {pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 disabled:opacity-40"
          >
            {t('common.previous')}
          </button>
          <span className="text-sm text-slate-600">{page} / {pagination.pages}</span>
          <button
            type="button"
            disabled={page >= pagination.pages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 disabled:opacity-40"
          >
            {t('common.next')}
          </button>
        </div>
      )}
    </div>
  );
}
