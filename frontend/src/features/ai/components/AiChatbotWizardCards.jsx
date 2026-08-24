import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  HiOutlineCheck,
  HiOutlineExternalLink,
  HiOutlineMail,
  HiOutlineRefresh,
  HiOutlineUserGroup,
  HiOutlineChat,
  HiOutlineArrowLeft,
  HiOutlineSearch,
} from 'react-icons/hi';
import campaignBuilderApiService from '../../campaigns/services/campaignBuilderApi.service';
import emailSettingsApiService from '../../settings/services/emailSettingsApi.service';
import zaloSettingsApiService from '../../settings/services/zaloSettingsApi.service';
import chatbotApiService from '../../chatbot/services/chatbotApi.service';

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

const PLATFORM_DOMAIN = import.meta.env.VITE_DEFAULT_FROM_DOMAIN || 'digiso.vn';

export const AskSenderAccountCard = ({ data, onSelect, onOther, onDismiss, isActive = true, t }) => {
  const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
  const channel = data?.channel || 'zalo';
  const isEmail = channel === 'email';
  const noUsableAccount = Boolean(data?.noUsableAccount);

  return (
    <div className={`mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-4 ${isActive ? '' : 'opacity-60 pointer-events-none'}`}>
      <div className="mb-3 flex items-center gap-2">
        {isEmail ? <HiOutlineMail className="h-5 w-5 text-orange-500" /> : <HiOutlineChat className="h-5 w-5 text-blue-500" />}
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-600">
          {t('aiChatbot.wizardSenderTitle') || 'Tài khoản gửi'}
        </span>
      </div>

      {!isEmail && noUsableAccount && accounts.length > 0 && (
        <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {t('aiChatbot.wizardZaloAllDisconnected') || 'Tất cả tài khoản Zalo đang mất kết nối. Bạn quét mã QR để kết nối lại nhé.'}
        </p>
      )}

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
        className={`mt-3 w-full rounded-xl border px-3 py-2 text-xs font-black transition-all ${
          !isEmail && noUsableAccount
            ? 'border-blue-300 bg-blue-600 text-white hover:bg-blue-700'
            : 'border-orange-200 bg-white text-orange-700 hover:bg-orange-100'
        }`}
      >
        {!isEmail && noUsableAccount
          ? (t('aiChatbot.wizardZaloReconnectQr') || 'Kết nối lại bằng QR')
          : (t('aiChatbot.wizardOtherAccount') || 'Khác')}
      </button>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="mt-2 w-full text-center text-xs text-slate-500 hover:text-slate-700 py-1 transition-colors"
        >
          {t('aiChatbot.wizardDismiss') || 'Không phải, tôi chỉ hỏi thôi'}
        </button>
      )}
    </div>
  );
};

export const EmailSetupGuideCard = ({ data, onSelectAccount, onAccountsFound, onDismiss, isActive = true, t }) => {
  const [checking, setChecking] = useState(false);
  const [quickMode, setQuickMode] = useState(false);
  const [creating, setCreating] = useState(false);
  const [quickForm, setQuickForm] = useState({
    name: '',
    replyTo: '',
    platformPrefix: '',
  });

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

  const updateQuickForm = (key, value) => {
    setQuickForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreateQuickSender = async () => {
    const name = String(quickForm.name || '').trim();
    const replyTo = String(quickForm.replyTo || '').trim();
    const platformPrefix = String(quickForm.platformPrefix || '').trim().toLowerCase();

    if (!name || !replyTo || !platformPrefix) {
      toast.error(t('aiChatbot.wizardQuickEmailMissing') || 'Bạn nhập đủ 3 ô để tạo email gửi nhanh nhé.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) {
      toast.error(t('aiChatbot.wizardQuickEmailInvalidReplyTo') || 'Email Reply-To chưa hợp lệ.');
      return;
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(platformPrefix)) {
      toast.error(t('aiChatbot.wizardQuickEmailInvalidPrefix') || 'Prefix chỉ gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.');
      return;
    }

    setCreating(true);
    try {
      const response = await emailSettingsApiService.createEmailSetting({
        name,
        replyTo,
        emailMode: 'platform',
        platformPrefix,
      });
      const created = response?.data?.data || {};
      toast.success(t('aiChatbot.wizardQuickEmailCreated') || 'Đã tạo email sender. Mình tiếp tục chiến dịch nhé.');
      onSelectAccount?.({
        id: created.id,
        name: created.name || name,
        email: created.email || `${platformPrefix}@${PLATFORM_DOMAIN}`,
      });
    } catch (error) {
      toast.error(error?.response?.data?.message || t('aiChatbot.wizardQuickEmailCreateFailed') || 'Không tạo được email sender.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={`mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-4 ${isActive ? '' : 'opacity-60 pointer-events-none'}`}>
      <div className="mb-3 flex items-center gap-2">
        <HiOutlineMail className="h-5 w-5 text-orange-500" />
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-600">
          {t('aiChatbot.wizardEmailSetupTitle') || 'Thiết lập email'}
        </span>
      </div>
      <p className="mb-3 text-xs text-slate-600">
        {t('aiChatbot.wizardEmailSetupHint') || 'Bạn có thể tạo nhanh email gửi ngay tại đây, không cần vào Settings.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setQuickMode((prev) => !prev)}
          className="inline-flex items-center gap-1 rounded-xl border border-orange-200 bg-white px-3 py-2 text-xs font-black text-orange-700 hover:bg-orange-100"
        >
          <HiOutlineCheck className="h-4 w-4" />
          {quickMode
            ? (t('aiChatbot.wizardHideQuickEmail') || 'Ẩn tạo nhanh')
            : (t('aiChatbot.wizardQuickEmailSetup') || 'Tạo nhanh trong chat')}
        </button>
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

      {quickMode && (
        <div className="mt-3 space-y-3 rounded-xl border border-orange-200 bg-white p-3">
          <div>
            <p className="mb-1 text-[11px] font-semibold text-slate-600">{t('aiChatbot.wizardQuickSenderName') || 'Tên người gửi'}</p>
            <input
              type="text"
              value={quickForm.name}
              onChange={(event) => updateQuickForm('name', event.target.value)}
              placeholder={t('aiChatbot.wizardQuickSenderNamePlaceholder') || 'Ví dụ: Founder AI'}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-orange-400"
            />
          </div>

          <div>
            <p className="mb-1 text-[11px] font-semibold text-slate-600">{t('aiChatbot.wizardQuickReplyTo') || 'Email Reply-To'}</p>
            <input
              type="email"
              value={quickForm.replyTo}
              onChange={(event) => updateQuickForm('replyTo', event.target.value)}
              placeholder={t('aiChatbot.wizardQuickReplyToPlaceholder') || 'Ví dụ: hello@congty.com'}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-orange-400"
            />
          </div>

          <div>
            <p className="mb-1 text-[11px] font-semibold text-slate-600">
              {t('aiChatbot.wizardQuickFromPrefix') || 'Địa chỉ gửi (prefix)'}
            </p>
            <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <input
                type="text"
                value={quickForm.platformPrefix}
                onChange={(event) => updateQuickForm('platformPrefix', event.target.value.replace(/[^a-zA-Z0-9._-]/g, ''))}
                placeholder={t('aiChatbot.wizardQuickFromPrefixPlaceholder') || 'no-reply'}
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none"
              />
              <span className="ml-2 shrink-0 text-xs text-slate-500">@{PLATFORM_DOMAIN}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCreateQuickSender}
            disabled={creating}
            className="w-full rounded-xl bg-orange-500 px-3 py-2 text-xs font-black text-white transition-all hover:bg-orange-600 disabled:opacity-60"
          >
            {creating
              ? (t('aiChatbot.wizardQuickCreating') || 'Đang tạo...')
              : (t('aiChatbot.wizardQuickCreateAndContinue') || 'Tạo email gửi & tiếp tục')}
          </button>
        </div>
      )}

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="mt-2 w-full text-center text-xs text-slate-500 hover:text-slate-700 py-1 transition-colors"
        >
          {t('aiChatbot.wizardDismiss') || 'Không phải, tôi chỉ hỏi thôi'}
        </button>
      )}
    </div>
  );
};

export const ZaloQrLoginCard = ({ channel = 'zalo', onConnected, onBackToAccounts, onDismiss, isActive = true, t }) => {
  const [qr, setQr] = useState(null);
  const [sessionKey, setSessionKey] = useState('');
  const [status, setStatus] = useState('idle');
  const [loading, setLoading] = useState(false);
  const onConnectedRef = useRef(onConnected);
  const channelRef = useRef(channel);
  const tRef = useRef(t);

  useEffect(() => {
    onConnectedRef.current = onConnected;
  }, [onConnected]);

  useEffect(() => {
    channelRef.current = channel;
  }, [channel]);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

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
    if (!isActive) return;
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
          onConnectedRef.current({
            id: payload.account?.id || payload.accountId,
            name: payload.account?.displayName || payload.account?.display_name || payload.displayName || payload.zaloName || 'Zalo',
          }, channelRef.current);
          return;
        }
        if (nextStatus === 'failed') {
          if (timer) window.clearInterval(timer);
          setStatus('failed');
          toast.error(payload.message || tRef.current('aiChatbot.wizardQrFailed') || 'Không tạo được QR Zalo.');
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
  }, [sessionKey]);

  return (
    <div className={`mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 ${isActive ? '' : 'opacity-60 pointer-events-none'}`}>
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
      {typeof onBackToAccounts === 'function' && (
        <button
          type="button"
          onClick={() => onBackToAccounts(channel)}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-xs font-black text-blue-700 transition-all hover:bg-blue-100"
        >
          <HiOutlineArrowLeft className="h-4 w-4" />
          {t('aiChatbot.wizardBackToZaloAccounts') || 'Chọn tài khoản có sẵn'}
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-600 transition-all hover:bg-slate-50"
        >
          {t('common.cancel') || 'Huỷ'}
        </button>
      )}
    </div>
  );
};

const foldDiacritics = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/đ/gi, (m) => (m === 'Đ' ? 'D' : 'd'))
  .toLowerCase();

export const ZaloGroupPickerCard = ({ data, onSubmit, onDismiss, isActive = true, t }) => {
  const accountId = data?.accountId;
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

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

  const filteredGroups = useMemo(() => {
    const query = foldDiacritics(search.trim());
    if (!query) return groups;
    return groups.filter((group) => {
      const name = group.groupName || group.group_name || group.name || '';
      return foldDiacritics(name).includes(query);
    });
  }, [groups, search]);

  const filteredIds = useMemo(
    () => filteredGroups.map((group) => group.groupId || group.group_id || group.id).filter(Boolean),
    [filteredGroups]
  );
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.includes(id));
  const toggle = (id) => setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  const toggleAllFiltered = () => setSelected((prev) => (
    allSelected
      ? prev.filter((id) => !filteredIds.includes(id))
      : Array.from(new Set([...prev, ...filteredIds]))
  ));

  return (
    <div className={`mt-4 rounded-2xl border border-purple-200 bg-purple-50 p-4 ${isActive ? '' : 'opacity-60 pointer-events-none'}`}>
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
          <div className="relative mb-2">
            <HiOutlineSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('aiChatbot.wizardGroupSearchPlaceholder') || 'Tìm nhóm...'}
              className="w-full rounded-xl border border-purple-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
          </div>
          <button
            type="button"
            onClick={toggleAllFiltered}
            disabled={filteredIds.length === 0}
            className="mb-2 rounded-xl border border-purple-200 bg-white px-3 py-2 text-xs font-black text-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {allSelected ? (t('aiChatbot.wizardClearAll') || 'Bỏ chọn tất cả') : (t('aiChatbot.wizardSelectAll') || 'Chọn tất cả')}
          </button>
          {filteredGroups.length === 0 ? (
            <p className="rounded-xl bg-white px-3 py-2 text-xs text-slate-500">
              {t('aiChatbot.wizardGroupSearchEmpty') || 'Không tìm thấy nhóm phù hợp.'}
            </p>
          ) : (
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {filteredGroups.map((group) => {
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
          )}
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
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="mt-2 w-full text-center text-xs text-slate-500 hover:text-slate-700 py-1 transition-colors"
        >
          {t('aiChatbot.wizardDismiss') || 'Không phải, tôi chỉ hỏi thôi'}
        </button>
      )}
    </div>
  );
};

export const ZaloFriendPickerCard = ({ data, onSubmit, onDismiss, isActive = true, t }) => {
  const accountId = data?.accountId;
  const maxRecipients = data?.maxRecipients || 1000;
  const [friends, setFriends] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  /**
   * Tài khoản có bạn bè hay không, KHÔNG phụ thuộc từ khoá đang gõ.
   * `totalCount` là số kết quả của lượt tải hiện tại nên tìm không ra là về 0 — dùng nó
   * để quyết định hiển thị sẽ làm ô tìm kiếm biến mất đúng lúc người dùng cần sửa từ khoá.
   */
  const [hasAnyFriend, setHasAnyFriend] = useState(false);
  const searchTimerRef = useRef(null);

  const loadFriends = async (targetPage = 1, searchQuery = '') => {
    if (!accountId) return;
    setLoading(true);
    setError('');
    try {
      const response = await chatbotApiService.getZaloFriends({
        accountId,
        search: searchQuery,
        page: targetPage,
        limit: 100,
      });
      const payload = response?.data?.data || response?.data || {};
      setFriends(payload.items || []);
      setTotalPages(payload.totalPages || 1);
      setTotalCount(payload.total || 0);
      setPage(payload.page || targetPage);
      // Chỉ lượt tải KHÔNG lọc mới nói lên được danh bạ có người hay không.
      if (!String(searchQuery || '').trim() && (payload.total || 0) > 0) {
        setHasAnyFriend(true);
      }
      if (payload.lastSyncedAt) {
        setLastSyncedAt(payload.lastSyncedAt);
      }
    } catch (err) {
      setError(err?.response?.data?.message || t('aiChatbot.wizardFriendLoadFailed') || 'Không tải được danh bạ Zalo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFriends(1, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  /**
   * Gõ tới đâu gọi API tới đó thì mỗi phím là một request, và phản hồi về không đúng thứ
   * tự nên kết quả cuối cùng chưa chắc ứng với từ khoá cuối cùng. Hoãn 300ms.
   */
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearch(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => loadFriends(1, val), 300);
  };

  useEffect(() => () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
  }, []);

  const handleSyncContacts = async () => {
    if (!accountId || syncing) return;
    setSyncing(true);
    try {
      await chatbotApiService.syncZaloContacts(accountId);
      toast.success(t('aiChatbot.wizardZaloSyncSuccess') || 'Đồng bộ danh bạ thành công.');
      // Đồng bộ xong mà vẫn lọc theo từ khoá cũ thì người dùng thấy danh bạ "vẫn trống"
      // dù vừa tải về đủ bạn bè. Xoá từ khoá rồi mới tải lại.
      setSearch('');
      await loadFriends(1, '');
    } catch (err) {
      toast.error(err?.response?.data?.message || t('aiChatbot.wizardZaloSyncFailed') || 'Đồng bộ danh bạ thất bại.');
    } finally {
      setSyncing(false);
    }
  };

  const currentFriendIds = useMemo(
    () => friends.map((f) => f.friend_id || f.friendId || f.id).filter(Boolean),
    [friends]
  );
  const allCurrentSelected = currentFriendIds.length > 0 && currentFriendIds.every((id) => selected.includes(id));

  const toggle = (id) => setSelected((prev) => {
    if (prev.includes(id)) {
      return prev.filter((item) => item !== id);
    }
    if (prev.length >= maxRecipients) {
      toast.error(t('aiChatbot.wizardMaxRecipientsReached', { max: maxRecipients }) || `Tối đa ${maxRecipients} người nhận.`);
      return prev;
    }
    return [...prev, id];
  });

  const toggleAllCurrent = () => setSelected((prev) => {
    if (allCurrentSelected) {
      return prev.filter((id) => !currentFriendIds.includes(id));
    }
    const toAdd = currentFriendIds.filter((id) => !prev.includes(id));
    const combined = [...prev, ...toAdd];
    if (combined.length > maxRecipients) {
      toast.error(t('aiChatbot.wizardMaxRecipientsReached', { max: maxRecipients }) || `Tối đa ${maxRecipients} người nhận.`);
      return combined.slice(0, maxRecipients);
    }
    return combined;
  });

  const handleSubmit = () => {
    const selectedObjects = friends.filter((f) => selected.includes(f.friend_id || f.friendId || f.id));
    onSubmit(selected, selectedObjects);
  };

  return (
    <div className={`mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 ${isActive ? '' : 'opacity-60 pointer-events-none'}`}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HiOutlineChat className="h-5 w-5 text-blue-500" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">
            {t('aiChatbot.wizardFriendTitle') || 'Danh bạ Zalo'}
          </span>
        </div>
        <button
          type="button"
          onClick={handleSyncContacts}
          disabled={syncing}
          className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 disabled:opacity-50"
        >
          <HiOutlineRefresh className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? (t('common.syncing') || 'Đang đồng bộ...') : (t('aiChatbot.wizardReSync') || 'Đồng bộ lại')}
        </button>
      </div>

      {lastSyncedAt && (
        <p className="mb-2 text-[11px] text-slate-500">
          {t('aiChatbot.wizardLastSynced') || 'Đồng bộ gần nhất'}: {new Date(lastSyncedAt).toLocaleString('vi-VN')}
        </p>
      )}

      {error && (
        <div className="rounded-xl bg-white p-3">
          <p className="mb-2 text-xs text-red-600">{error}</p>
          <button type="button" onClick={() => loadFriends(1, search)} className="rounded-xl border border-blue-200 px-3 py-2 text-xs font-black text-blue-700">
            {t('common.retry') || 'Thử lại'}
          </button>
        </div>
      )}

      {/*
        Ô tìm kiếm phải nằm NGOÀI mọi nhánh `loading` / `totalCount`.
        Trước 25/08/2026 nó nằm trong `{!loading && !error && totalCount > 0 && (...)}`:
        gõ một ký tự → loadFriends → setLoading(true) → cả khối chứa input bị gỡ khỏi DOM
        → xong request thì input được dựng lại mới tinh, con trỏ mất. Người dùng chỉ gõ
        được đúng ký tự đầu rồi thấy ô nháy liên tục.
        Điều kiện `totalCount > 0` còn làm ô tìm kiếm biến mất khi không ai khớp từ khoá,
        nên không sửa lại được từ khoá vừa gõ sai.
      */}
      {!error && (hasAnyFriend || search) && (
        <div className="relative mb-2">
          <HiOutlineSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={handleSearchChange}
            placeholder={t('aiChatbot.wizardFriendSearchPlaceholder') || 'Tìm bạn bè theo tên hoặc SĐT...'}
            className="w-full rounded-xl border border-blue-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
      )}

      {loading && <p className="text-xs text-slate-500">{t('common.loading') || 'Loading...'}</p>}

      {/* Danh bạ trống thật — khác hẳn "tìm không ra", nên nút Đồng bộ mới có nghĩa ở đây. */}
      {!loading && !error && totalCount === 0 && !search && (
        <div className="rounded-xl bg-white p-4 text-center">
          <p className="text-xs text-slate-600 mb-2">
            {t('aiChatbot.wizardNoFriendsFound') || 'Chưa có bạn bè nào trong danh bạ đã đồng bộ.'}
          </p>
          <button
            type="button"
            onClick={handleSyncContacts}
            disabled={syncing}
            className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {syncing ? (t('common.syncing') || 'Đang đồng bộ...') : (t('aiChatbot.wizardSyncNow') || 'Đồng bộ danh bạ ngay')}
          </button>
        </div>
      )}

      {/* Có danh bạ nhưng từ khoá không khớp ai — đừng bảo người ta đi đồng bộ lại. */}
      {!loading && !error && totalCount === 0 && search && (
        <div className="rounded-xl bg-white p-4 text-center">
          <p className="text-xs text-slate-600 mb-2">
            {t('aiChatbot.wizardFriendSearchEmpty', { keyword: search })
              || `Không tìm thấy bạn bè nào khớp "${search}".`}
          </p>
          <button
            type="button"
            onClick={() => { setSearch(''); loadFriends(1, ''); }}
            className="rounded-xl border border-blue-200 px-3 py-2 text-xs font-black text-blue-700"
          >
            {t('aiChatbot.wizardClearSearch') || 'Xoá từ khoá'}
          </button>
        </div>
      )}

      {!loading && !error && totalCount > 0 && (
        <>
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={toggleAllCurrent}
              disabled={currentFriendIds.length === 0}
              className="rounded-xl border border-blue-200 bg-white px-3 py-1.5 text-xs font-black text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {allCurrentSelected ? (t('aiChatbot.wizardClearAll') || 'Bỏ chọn') : (t('aiChatbot.wizardSelectAll') || 'Chọn tất cả')}
            </button>
            <span className="text-xs font-bold text-slate-600">
              {t('aiChatbot.wizardSelectedCount', { count: selected.length, max: maxRecipients }) || `Đã chọn: ${selected.length} / ${maxRecipients}`}
            </span>
          </div>

          {friends.length === 0 ? (
            <p className="rounded-xl bg-white px-3 py-2 text-xs text-slate-500">
              {t('aiChatbot.wizardFriendSearchEmpty', { keyword: search })
                || 'Không tìm thấy bạn bè phù hợp.'}
            </p>
          ) : (
            <div className="max-h-60 space-y-2 overflow-y-auto">
              {friends.map((friend) => {
                const id = friend.friend_id || friend.friendId || friend.id;
                const name = friend.display_name || friend.displayName || id;
                const avatar = friend.avatar_url || friend.avatar;
                const phone = friend.phone;
                const isChecked = selected.includes(id);

                return (
                  <label key={id} className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-white px-3 py-2 text-sm text-slate-700 hover:bg-blue-50 transition-colors">
                    <input type="checkbox" checked={isChecked} onChange={() => toggle(id)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    {avatar ? (
                      <img src={avatar} alt={name} className="h-8 w-8 rounded-full object-cover border border-slate-200" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600">
                        {name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1 truncate">
                      <p className="truncate font-semibold text-slate-800 text-xs">{name}</p>
                      {phone && <p className="text-[11px] text-slate-400 truncate">{phone}</p>}
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => loadFriends(page - 1, search)}
                className="rounded-lg border border-blue-200 bg-white px-2.5 py-1 font-bold text-blue-600 disabled:opacity-40"
              >
                {t('common.previous') || 'Trước'}
              </button>
              <span>Trang {page} / {totalPages} ({totalCount} bạn)</span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => loadFriends(page + 1, search)}
                className="rounded-lg border border-blue-200 bg-white px-2.5 py-1 font-bold text-blue-600 disabled:opacity-40"
              >
                {t('common.next') || 'Sau'}
              </button>
            </div>
          )}

          <button
            type="button"
            disabled={selected.length === 0}
            onClick={handleSubmit}
            className="mt-3 w-full rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            {t('aiChatbot.wizardUseFriends', { count: selected.length }) || `Dùng ${selected.length} bạn bè đã chọn`}
          </button>
        </>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="mt-2 w-full text-center text-xs text-slate-500 hover:text-slate-700 py-1 transition-colors"
        >
          {t('aiChatbot.wizardDismiss') || 'Không phải, tôi chỉ hỏi thôi'}
        </button>
      )}
    </div>
  );
};

