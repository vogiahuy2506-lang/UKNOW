import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  HiOutlineCheck,
  HiOutlineExternalLink,
  HiOutlineMail,
  HiOutlineRefresh,
  HiOutlineUserGroup,
  HiOutlineChat,
} from 'react-icons/hi';
import campaignBuilderApiService from '../../campaigns/services/campaignBuilderApi.service';
import emailSettingsApiService from '../../settings/services/emailSettingsApi.service';
import zaloSettingsApiService from '../../settings/services/zaloSettingsApi.service';

const getQrImage = (payload) => (
  payload?.qrImage || payload?.qr_image || payload?.qrCode || payload?.qr_code || payload?.image || payload?.data?.qrImage || ''
);

const getSessionKey = (payload) => (
  payload?.sessionKey || payload?.session_key || payload?.data?.sessionKey || payload?.data?.session_key || ''
);

const normalizeEmailSettings = (response) => {
  const data = response?.data?.data ?? response?.data ?? [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  return [];
};

export const AskSenderAccountCard = ({ data, onSelect, onOther, t }) => {
  const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
  const channel = data?.channel || 'zalo';
  const isEmail = channel === 'email';

  return (
    <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-4">
      <div className="mb-3 flex items-center gap-2">
        {isEmail ? <HiOutlineMail className="h-5 w-5 text-orange-500" /> : <HiOutlineChat className="h-5 w-5 text-blue-500" />}
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-600">
          {t('aiChatbot.wizardSenderTitle') || 'Tài khoản gửi'}
        </span>
      </div>

      <div className="space-y-2">
        {accounts.map((account) => {
          const disabled = !account.usable;
          return (
            <button
              key={account.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(account)}
              className={`w-full rounded-xl border px-3 py-2 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                disabled
                  ? 'border-slate-200 bg-white text-slate-400'
                  : 'border-white bg-white text-slate-700 hover:border-orange-300 hover:bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{account.name}</p>
                  {account.email && <p className="truncate text-xs text-slate-500">{account.email}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  {account.isDefault && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Default</span>}
                  {!account.usable && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{account.status}</span>}
                </div>
              </div>
            </button>
          );
        })}

        {accounts.length === 0 && (
          <p className="rounded-xl bg-white px-3 py-3 text-xs text-slate-500">
            {isEmail ? (t('aiChatbot.wizardNoEmailSender') || 'Chưa có email sender active.') : (t('aiChatbot.wizardNoZaloAccount') || 'Chưa có tài khoản Zalo connected.')}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onOther}
        className="mt-3 w-full rounded-xl border border-orange-200 bg-white px-3 py-2 text-xs font-black text-orange-700 transition-all hover:bg-orange-100"
      >
        {t('aiChatbot.wizardOtherAccount') || 'Khác'}
      </button>
    </div>
  );
};

export const EmailSetupGuideCard = ({ data, onSelectAccount, onAccountsFound, t }) => {
  const [checking, setChecking] = useState(false);

  const handleCompleted = async () => {
    setChecking(true);
    try {
      const response = await emailSettingsApiService.getActiveSettings();
      const accounts = normalizeEmailSettings(response);
      if (accounts.length === 0) {
        toast.error(t('aiChatbot.wizardEmailStillMissing') || 'Chưa thấy email sender active.');
        return;
      }
      if (accounts.length === 1) {
        const account = accounts[0];
        onSelectAccount({
          id: account.id,
          name: account.name || account.email || account.replyTo || `#${account.id}`,
          email: account.email || account.reply_to || account.replyTo,
        });
        return;
      }
      onAccountsFound?.(accounts.map((account) => ({
        id: account.id,
        name: account.name || account.email || account.replyTo || `#${account.id}`,
        email: account.email || account.reply_to || account.replyTo,
        status: account.status || 'active',
        usable: true,
      })));
      toast.success(t('aiChatbot.wizardEmailReady') || 'Email sender đã sẵn sàng. Hãy chọn tài khoản ở bước tiếp theo.');
    } catch (error) {
      toast.error(error?.response?.data?.message || t('aiChatbot.wizardEmailCheckFailed') || 'Không kiểm tra được email sender.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <HiOutlineMail className="h-5 w-5 text-orange-500" />
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-600">
          {t('aiChatbot.wizardEmailSetupTitle') || 'Thiết lập email'}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          to={data?.settingsPath || '/app/settings/channels'}
          className="inline-flex items-center gap-1 rounded-xl bg-orange-500 px-3 py-2 text-xs font-black text-white hover:bg-orange-600"
        >
          <HiOutlineExternalLink className="h-4 w-4" />
          {t('aiChatbot.wizardOpenSettings') || 'Mở Settings'}
        </Link>
        <button
          type="button"
          onClick={handleCompleted}
          disabled={checking}
          className="inline-flex items-center gap-1 rounded-xl border border-orange-200 bg-white px-3 py-2 text-xs font-black text-orange-700 hover:bg-orange-100 disabled:opacity-60"
        >
          <HiOutlineCheck className="h-4 w-4" />
          {checking ? (t('common.loading') || 'Loading...') : (t('aiChatbot.wizardCompleted') || 'Đã hoàn thành')}
        </button>
      </div>
    </div>
  );
};

export const ZaloQrLoginCard = ({ channel = 'zalo', onConnected, t }) => {
  const [qr, setQr] = useState(null);
  const [sessionKey, setSessionKey] = useState('');
  const [status, setStatus] = useState('idle');
  const [loading, setLoading] = useState(false);

  const createQr = async () => {
    setLoading(true);
    setStatus('loading');
    try {
      const response = await zaloSettingsApiService.createLoginQr();
      const payload = response?.data?.data || response?.data || {};
      setQr(getQrImage(payload));
      setSessionKey(getSessionKey(payload));
      setStatus('pending');
    } catch (error) {
      setStatus('error');
      toast.error(error?.response?.data?.message || t('aiChatbot.wizardQrFailed') || 'Không tạo được QR Zalo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    createQr();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sessionKey) return undefined;
    let disposed = false;
    let timer = null;

    const pollStatus = async () => {
      if (disposed) return;
      try {
        const response = await zaloSettingsApiService.getLoginQrStatus(sessionKey);
        const payload = response?.data?.data || response?.data || {};
        const nextStatus = payload.status || payload.state;
        if (nextStatus === 'connected' || payload.account?.id || payload.accountId) {
          if (timer) window.clearInterval(timer);
          setStatus('connected');
          onConnected({
            id: payload.account?.id || payload.accountId,
            name: payload.account?.displayName || payload.account?.display_name || payload.displayName || payload.zaloName || 'Zalo',
          }, channel);
          return;
        }
        if (nextStatus === 'failed') {
          if (timer) window.clearInterval(timer);
          setStatus('failed');
          toast.error(payload.message || t('aiChatbot.wizardQrFailed') || 'Không tạo được QR Zalo.');
          return;
        } else if (nextStatus && !['pending', 'scanned', 'waiting'].includes(nextStatus)) {
          setStatus(nextStatus);
        } else {
          setStatus('pending');
        }
      } catch (error) {
        if (error?.response?.status === 404) {
          if (timer) window.clearInterval(timer);
          setStatus('expired');
        }
      }
    };

    pollStatus();
    timer = window.setInterval(pollStatus, 3000);

    return () => {
      disposed = true;
      if (timer) window.clearInterval(timer);
    };
  }, [channel, onConnected, sessionKey, t]);

  return (
    <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <HiOutlineChat className="h-5 w-5 text-blue-500" />
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">
          {t('aiChatbot.wizardZaloQrTitle') || 'Đăng nhập Zalo'}
        </span>
      </div>
      {qr ? (
        <img src={qr} alt="Zalo QR" className="mx-auto h-44 w-44 rounded-xl border border-white bg-white object-contain p-2" />
      ) : (
        <div className="mx-auto flex h-44 w-44 items-center justify-center rounded-xl border border-white bg-white text-xs text-slate-400">
          {loading ? (t('common.loading') || 'Loading...') : status}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-600">
          {status === 'expired'
            ? (t('aiChatbot.wizardQrExpired') || 'QR đã hết hạn.')
            : (t('aiChatbot.wizardQrHint') || 'Quét QR bằng điện thoại để kết nối.')}
        </p>
        <button
          type="button"
          onClick={createQr}
          disabled={loading}
          className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-100 disabled:opacity-60"
        >
          <HiOutlineRefresh className="h-4 w-4" />
          {t('aiChatbot.wizardNewQr') || 'Tạo mã mới'}
        </button>
      </div>
    </div>
  );
};

export const ZaloGroupPickerCard = ({ data, onSubmit, t }) => {
  const accountId = data?.accountId;
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadGroups = async () => {
    if (!accountId) return;
    setLoading(true);
    setError('');
    try {
      const response = await campaignBuilderApiService.getPreviewZaloGroups({ accountId });
      const payload = response?.data?.data || response?.data || {};
      const items = Array.isArray(payload) ? payload : (payload.groups || payload.items || []);
      setGroups(items);
    } catch (err) {
      setError(err?.response?.data?.message || t('aiChatbot.wizardGroupLoadFailed') || 'Không tải được danh sách nhóm.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const allIds = useMemo(() => groups.map((group) => group.groupId || group.group_id || group.id).filter(Boolean), [groups]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.includes(id));
  const toggle = (id) => setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));

  return (
    <div className="mt-4 rounded-2xl border border-purple-200 bg-purple-50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <HiOutlineUserGroup className="h-5 w-5 text-purple-500" />
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-600">
          {t('aiChatbot.wizardGroupTitle') || 'Chọn nhóm Zalo'}
        </span>
      </div>

      {loading && <p className="text-xs text-slate-500">{t('common.loading') || 'Loading...'}</p>}
      {error && (
        <div className="rounded-xl bg-white p-3">
          <p className="mb-2 text-xs text-red-600">{error}</p>
          <button type="button" onClick={loadGroups} className="rounded-xl border border-purple-200 px-3 py-2 text-xs font-black text-purple-700">
            {t('common.retry') || 'Thử lại'}
          </button>
        </div>
      )}
      {!loading && !error && groups.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setSelected(allSelected ? [] : allIds)}
            className="mb-2 rounded-xl border border-purple-200 bg-white px-3 py-2 text-xs font-black text-purple-700"
          >
            {allSelected ? (t('aiChatbot.wizardClearAll') || 'Bỏ chọn tất cả') : (t('aiChatbot.wizardSelectAll') || 'Chọn tất cả')}
          </button>
          <div className="max-h-56 space-y-2 overflow-y-auto">
            {groups.map((group) => {
              const id = group.groupId || group.group_id || group.id;
              const name = group.groupName || group.group_name || group.name || id;
              return (
                <label key={id} className="flex cursor-pointer items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm text-slate-700">
                  <input type="checkbox" checked={selected.includes(id)} onChange={() => toggle(id)} />
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  {group.memberCount || group.member_count ? <span className="text-xs text-slate-400">{group.memberCount || group.member_count}</span> : null}
                </label>
              );
            })}
          </div>
          <button
            type="button"
            disabled={selected.length === 0}
            onClick={() => onSubmit(selected, groups)}
            className="mt-3 w-full rounded-xl bg-purple-600 px-3 py-2 text-xs font-black text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('aiChatbot.wizardUseGroups') || 'Dùng các nhóm đã chọn'}
          </button>
        </>
      )}
    </div>
  );
};
