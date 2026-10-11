import { useCallback, useEffect, useState } from 'react';
import {
  HiOutlineLink,
  HiOutlineTrash,
  HiOutlineRefresh,
  HiOutlineExclamation,
  HiOutlineExternalLink,
  HiOutlineGlobeAlt,
} from 'react-icons/hi';
import PageContainer from '../../components/common/PageContainer';
import toast from 'react-hot-toast';
import facebookSettingsApiService from '../../features/settings/services/facebookSettingsApi.service';
import { useI18n } from '../../i18n';

/**
 * Status pill for a Facebook connection.
 * has_credentials=false → token is missing (refresh needed).
 */
function ConnectionStatus({ conn, t }) {
  if (!conn.has_credentials) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        {t('facebookSettings.statusTokenMissing')}
      </span>
    );
  }
  
  // Show expiry warning if token is expiring soon (within 7 days)
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : null;
  const now = new Date();
  const daysUntilExpiry = expiresAt ? Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24)) : null;
  
  if (daysUntilExpiry !== null && daysUntilExpiry <= 7) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-300">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
        {daysUntilExpiry <= 0
          ? t('facebookSettings.statusExpired')
          : t('facebookSettings.statusExpiresIn', { days: daysUntilExpiry })}
      </span>
    );
  }
  
  if (daysUntilExpiry !== null && daysUntilExpiry <= 14) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        {t('facebookSettings.statusExpiresIn', { days: daysUntilExpiry })}
      </span>
    );
  }
  
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-green-200 dark:border-green-900/60 bg-green-50 dark:bg-green-950/40 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:text-green-300">
      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
      {t('facebookSettings.statusConnected')}
    </span>
  );
}

export default function FacebookSettings() {
  const { t } = useI18n();
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [refreshingId, setRefreshingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const loadConnections = useCallback(async () => {
    try {
      const res = await facebookSettingsApiService.listConnections();
      const list = res?.data?.data;
      setConnections(Array.isArray(list) ? list : []);
    } catch (err) {
      console.warn('[FacebookSettings] listConnections:', err.message);
      setConnections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Read ?oauth=success from URL (set by OAuth callback redirect).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('oauth') === 'success') {
      toast.success(
        t('facebookSettings.oauthSuccess', { count: params.get('page_count') || '' })
      );
      // Remove the query param so reload doesn't re-toast.
      const url = new URL(window.location.href);
      url.searchParams.delete('oauth');
      url.searchParams.delete('page_count');
      window.history.replaceState({}, '', url.toString());
    } else if (params.get('oauth') === 'error') {
      toast.error(
        t('facebookSettings.oauthError', { reason: params.get('reason') || '' })
      );
      const url = new URL(window.location.href);
      url.searchParams.delete('oauth');
      url.searchParams.delete('error');
      url.searchParams.delete('reason');
      window.history.replaceState({}, '', url.toString());
    }
    loadConnections();
  }, [loadConnections, t]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await facebookSettingsApiService.initOAuth();
      const authUrl = res?.data?.auth_url;
      if (authUrl) {
        // Open in a popup to avoid losing the current page context.
        const popup = window.open(authUrl, 'facebook_oauth', 'width=600,height=700,scrollbars=yes');
        if (!popup) {
          toast.error(t('facebookSettings.popupBlocked'));
          return;
        }
        // Poll popup until it closes (OAuth redirects back to ChannelSettings).
        const poll = setInterval(() => {
          if (popup.closed) {
            clearInterval(poll);
            loadConnections();
          }
        }, 1000);
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || t('facebookSettings.initOAuthFailed');
      toast.error(msg);
    } finally {
      setConnecting(false);
    }
  };

  const handleRefresh = async (id) => {
    setRefreshingId(id);
    try {
      await facebookSettingsApiService.refreshToken(id);
      toast.success(t('facebookSettings.refreshSuccess'));
      loadConnections();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || t('facebookSettings.refreshFailed'));
    } finally {
      setRefreshingId(null);
    }
  };

  const handleDelete = async (id, pageName) => {
    if (!window.confirm(t('facebookSettings.confirmDisconnect', { name: pageName }))) {
      return;
    }
    setDeletingId(id);
    try {
      await facebookSettingsApiService.disconnect(id);
      toast.success(t('facebookSettings.disconnectSuccess'));
      setConnections((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || t('facebookSettings.disconnectFailed'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <PageContainer
      icon={HiOutlineGlobeAlt}
      title={t('facebookSettings.title')}
      subtitle={t('facebookSettings.subtitle')}
      actions={
        <button
          type="button"
          onClick={handleConnect}
          disabled={connecting}
          className="inline-flex items-center gap-2 shrink-0 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          <HiOutlineLink className="w-4 h-4" />
          {connecting ? t('facebookSettings.connecting') : t('facebookSettings.connectAccount')}
        </button>
      }
    >

      {/* Help card */}
      <div className="flex items-start gap-3 rounded-xl border border-indigo-100 dark:border-indigo-950/60 bg-indigo-50/50 dark:bg-indigo-950/30 p-4">
        <HiOutlineExclamation className="w-5 h-5 text-indigo-500 dark:text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-sm text-slate-700 dark:text-dk-text">
          <p className="font-medium text-indigo-800 dark:text-indigo-300">{t('facebookSettings.howItWorks')}</p>
          <ol className="mt-1 space-y-0.5 text-slate-600 dark:text-dk-text2 list-decimal list-inside">
            <li>
              {t('facebookSettings.step1', {
                action: `"${t('facebookSettings.connectAccount')}"`,
              })}
            </li>
            <li>{t('facebookSettings.step2')}</li>
            <li>
              {t('facebookSettings.step3', {
                location: t('facebookSettings.chatbotStudioDeployTab'),
              })}
            </li>
          </ol>
        </div>
      </div>

      {/* Connection list */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400 dark:text-dk-muted text-sm">
          <HiOutlineRefresh className="w-4 h-4 animate-spin mr-2" />
          {t('facebookSettings.loading')}
        </div>
      ) : connections.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-dashed border-slate-200 dark:border-dk-border">
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-dk-raised flex items-center justify-center mx-auto mb-3">
            <span className="text-xl font-bold text-slate-400 dark:text-dk-muted">f</span>
          </div>
          <p className="text-sm font-medium text-slate-600 dark:text-dk-text">{t('facebookSettings.emptyTitle')}</p>
          <p className="text-xs text-slate-400 dark:text-dk-muted mt-1">
            {t('facebookSettings.emptySubtitle')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl hover:border-slate-300 dark:hover:border-dk-border transition-colors"
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-base shrink-0">
                f
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-dk-text truncate">
                  {conn.fb_page_name || conn.display_name || 'Facebook Page'}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-dk-muted font-mono">
                  ID: {conn.fb_page_id || conn.external_channel_id}
                </p>
              </div>

              {/* Status */}
              <div className="shrink-0">
                <ConnectionStatus conn={conn} t={t} />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {/* Refresh */}
                <button
                  type="button"
                  onClick={() => handleRefresh(conn.id)}
                  disabled={refreshingId === conn.id}
                  title={t('facebookSettings.refreshToken')}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-dk-text hover:bg-slate-100 dark:hover:bg-dk-raised rounded-lg transition-colors disabled:opacity-50"
                >
                  <HiOutlineRefresh className={`w-4 h-4 ${refreshingId === conn.id ? 'animate-spin' : ''}`} />
                </button>

                {/* Open Meta */}
                {conn.fb_page_id && (
                  <a
                    href={`https://www.facebook.com/${conn.fb_page_id}`}
                    target="_blank"
                    rel="noreferrer"
                    title={t('facebookSettings.openFanpage')}
                    className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-dk-text hover:bg-slate-100 dark:hover:bg-dk-raised rounded-lg transition-colors"
                  >
                    <HiOutlineExternalLink className="w-4 h-4" />
                  </a>
                )}

                {/* Disconnect */}
                <button
                  type="button"
                  onClick={() => handleDelete(conn.id, conn.fb_page_name || conn.display_name)}
                  disabled={deletingId === conn.id}
                  title={t('facebookSettings.disconnect')}
                  className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors disabled:opacity-50"
                >
                  <HiOutlineTrash className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer tip */}
      {connections.length > 0 && (
        <p className="text-xs text-slate-400 dark:text-dk-muted">
          {t('facebookSettings.footerTip', {
            icon: '🔄',
          })}
        </p>
      )}
    </PageContainer>
  );
}
