import { useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineClipboardCopy } from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import {
  postLandingCustomDomainCheck,
  putLandingCustomDomain,
  postLandingCustomDomainVerify,
  deleteLandingCustomDomain,
} from '../../landing-pages/services/landingPagesAdminApi.service.js';
import { SYSTEM_BASE_DOMAIN } from '../utils/landingDomain.js';

/** Khách hay dán nguyên URL: bỏ giao thức, đường dẫn, dấu chấm cuối; chữ thường. */
function normalizeHostInput(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/\.$/, '');
}

/** Giá trị DNS hiển thị / sao chép: bỏ dấu chấm cuối của CNAME (nhiều nhà cung cấp tự thêm, một số không nhận). */
function displayDnsValue(value) {
  return String(value || '').replace(/\.$/, '');
}

function errorMessage(err, fallback) {
  const fromServer = err?.response?.data?.message;
  if (typeof fromServer === 'string' && fromServer.trim()) return fromServer;
  return err?.message || fallback;
}

/**
 * Bảng bản ghi DNS khách cần thêm (Loại / Tên / Giá trị), mỗi ô Tên và Giá trị có nút Sao chép.
 */
function DnsRecordsTable({ records, tc }) {
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(tc('sections.customDomain.copied'));
    } catch {
      toast.error(tc('sections.customDomain.copyFailed'));
    }
  };
  if (!records?.length) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-left text-sm" data-testid="custom-domain-dns-table">
        <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
          <tr>
            <th className="px-3 py-2">{tc('sections.customDomain.dnsType')}</th>
            <th className="px-3 py-2">{tc('sections.customDomain.dnsHost')}</th>
            <th className="px-3 py-2">{tc('sections.customDomain.dnsValue')}</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const value = displayDnsValue(record.value);
            return (
              <tr key={`${record.type}-${record.host}-${value}`} className="border-t border-gray-100">
                <td className="px-3 py-2 font-mono text-gray-900">{record.type}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5 font-mono text-gray-900">
                    {record.host}
                    <button
                      type="button"
                      onClick={() => copy(record.host)}
                      aria-label={`${tc('sections.customDomain.copy')} ${tc('sections.customDomain.dnsHost')}`}
                      className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                    >
                      <HiOutlineClipboardCopy className="h-4 w-4" />
                    </button>
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5 font-mono text-gray-900">
                    {value}
                    <button
                      type="button"
                      onClick={() => copy(value)}
                      aria-label={`${tc('sections.customDomain.copy')} ${tc('sections.customDomain.dnsValue')}`}
                      className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                    >
                      <HiOutlineClipboardCopy className="h-4 w-4" />
                    </button>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Khối "Tên miền riêng" trong Cài đặt trang (PLAN_TEN_MIEN_RIENG, PR-D).
 *
 * Quy tắc cứng: KHÔNG đụng `form` / `domainType` — panel này không nhận `setForm`. Mọi thay đổi đi qua API tên miền
 * riêng rồi gọi `onChanged()` để modal nạp lại tình trạng từ server (xem hooks/useLandingDomainInfo.js).
 *
 * Luồng kết nối: nhập tên miền → "Kiểm tra" (POST .../check, KHÔNG ghi gì) → hiện bảng DNS cần thêm → khi DNS đúng mới
 * có nút "Kết nối tên miền" (PUT). Link miễn phí vẫn chạy cho tới khi kết nối xong.
 *
 * @param {{
 *   editingId: number|null|undefined,
 *   domain: { kind: string, hostname: string, status: string|null, dnsRecords: object[] },
 *   slug: string,
 *   onChanged: () => (void|Promise<void>),
 * }} props
 */
export default function CustomDomainPanel({ editingId, domain, slug, onChanged }) {
  const tc = useI18n('landingCanvas.settingsModal');
  const [expanded, setExpanded] = useState(false);
  const [hostname, setHostname] = useState('');
  const [isApex, setIsApex] = useState(false);
  const [check, setCheck] = useState(null); // kết quả xem trước DNS của (hostname, isApex) đang nhập
  const [busy, setBusy] = useState(null); // 'check' | 'connect' | 'verify' | 'remove'
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [justConnected, setJustConnected] = useState(false);

  const cleanSlug = String(slug || '').trim();
  const freeLink = cleanSlug ? `${cleanSlug}.${SYSTEM_BASE_DOMAIN}` : '';
  const isCustom = domain.kind === 'custom-active' || domain.kind === 'custom-pending';

  const resetConnectForm = () => {
    setExpanded(false);
    setHostname('');
    setIsApex(false);
    setCheck(null);
    setError('');
  };

  const handleHostnameChange = (e) => {
    setHostname(e.target.value);
    setCheck(null);
    setError('');
  };

  const handleTypeChange = (apex) => {
    setIsApex(apex);
    setCheck(null);
    setError('');
  };

  const handleCheck = async () => {
    const host = normalizeHostInput(hostname);
    if (!host) {
      setError(tc('sections.customDomain.hostnameRequired'));
      return;
    }
    setBusy('check');
    setError('');
    try {
      const result = await postLandingCustomDomainCheck(editingId, host, isApex);
      setHostname(host);
      setCheck(result);
    } catch (err) {
      setCheck(null);
      setError(errorMessage(err, tc('sections.customDomain.genericError')));
    } finally {
      setBusy(null);
    }
  };

  const handleConnect = async () => {
    const host = normalizeHostInput(hostname);
    setBusy('connect');
    setError('');
    try {
      await putLandingCustomDomain(editingId, host, isApex);
      toast.success(tc('sections.customDomain.connected'));
      setJustConnected(true);
      resetConnectForm();
      await onChanged?.();
    } catch (err) {
      // 422: DNS không còn đúng lúc bấm Kết nối → hiện lại bảng bản ghi từ phản hồi (không ghi gì ở server).
      const body = err?.response?.data;
      if (err?.response?.status === 422 && body?.data) setCheck(body.data);
      setError(errorMessage(err, tc('sections.customDomain.genericError')));
    } finally {
      setBusy(null);
    }
  };

  const handleVerify = async () => {
    setBusy('verify');
    setError('');
    try {
      await postLandingCustomDomainVerify(editingId);
      toast.success(tc('sections.customDomain.verified'));
      setJustConnected(true);
      await onChanged?.();
    } catch (err) {
      setError(errorMessage(err, tc('sections.customDomain.genericError')));
    } finally {
      setBusy(null);
    }
  };

  const handleRemove = async () => {
    setBusy('remove');
    setError('');
    try {
      await deleteLandingCustomDomain(editingId);
      toast.success(tc('sections.customDomain.removed'));
      setConfirmRemove(false);
      setJustConnected(false);
      await onChanged?.();
    } catch (err) {
      setConfirmRemove(false);
      setError(errorMessage(err, tc('sections.customDomain.genericError')));
    } finally {
      setBusy(null);
    }
  };

  // Trang chưa lưu: chưa có id để gắn tên miền.
  if (!editingId) {
    return (
      <p className="text-xs text-gray-500" data-testid="custom-domain-save-first">
        {tc('sections.customDomain.saveFirst')}
      </p>
    );
  }

  // ── Trang ĐÃ có tên miền riêng (đang chạy hoặc chưa xác minh) ──────────────────────────────────────────────────
  if (isCustom) {
    const active = domain.kind === 'custom-active';
    return (
      <div className="space-y-3 rounded-xl border border-purple-100 bg-white p-4" data-testid="custom-domain-block">
        <p className="text-sm font-semibold text-gray-900">{tc('sections.customDomain.hostnameLabel')}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-mono text-gray-800">{domain.hostname}</span>
          <span className="font-medium text-gray-700">{tc('sections.customDomain.statusLabel')}:</span>
          <span
            data-testid="custom-domain-status"
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              active
                ? 'bg-green-100 text-green-700'
                : domain.status === 'disabled'
                ? 'bg-gray-100 text-gray-600'
                : 'bg-amber-100 text-amber-800'
            }`}
          >
            {active
              ? tc('sections.customDomain.statusActive')
              : domain.status === 'disabled'
              ? tc('sections.customDomain.statusDisabled')
              : tc('sections.customDomain.statusPending')}
          </span>
        </div>

        {active && justConnected ? (
          <p className="text-xs text-green-700" data-testid="custom-domain-https-hint">
            {tc('sections.customDomain.httpsHint')}
          </p>
        ) : null}

        {!active ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-600">{tc('sections.customDomain.pendingNote')}</p>
            <DnsRecordsTable records={domain.dnsRecords} tc={tc} />
            <button
              type="button"
              onClick={handleVerify}
              disabled={busy !== null}
              className="rounded-lg bg-orange-500 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-orange-600 disabled:opacity-50"
            >
              {busy === 'verify' ? tc('sections.customDomain.checking') : tc('sections.customDomain.recheck')}
            </button>
          </div>
        ) : null}

        {confirmRemove ? (
          <div
            role="alertdialog"
            aria-label={tc('sections.customDomain.remove')}
            data-testid="custom-domain-remove-confirm"
            className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3"
          >
            <p className="text-sm text-amber-900">
              {freeLink
                ? tc('sections.customDomain.removeConfirm', { link: freeLink })
                : tc('sections.customDomain.removeConfirmNoSlug')}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleRemove}
                disabled={busy !== null || !freeLink}
                className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {busy === 'remove' ? tc('sections.customDomain.removing') : tc('sections.customDomain.removeYes')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmRemove(false)}
                disabled={busy !== null}
                className="rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                {tc('sections.customDomain.removeCancel')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setError('');
              setConfirmRemove(true);
            }}
            disabled={busy !== null}
            className="rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            {tc('sections.customDomain.remove')}
          </button>
        )}

        {error ? (
          <p role="alert" className="whitespace-pre-line text-xs text-red-600" data-testid="custom-domain-error">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  // ── Trang đang dùng link miễn phí (hoặc chưa có hàng nào): cho kết nối tên miền riêng ────────────────────────────
  if (!expanded) {
    return (
      <div className="space-y-1.5" data-testid="custom-domain-offer">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-lg border border-orange-200 bg-orange-50 px-3.5 py-2 text-sm font-medium text-orange-700 transition hover:bg-orange-100"
        >
          {tc('sections.customDomain.useOwn')}
        </button>
        {domain.kind === 'free' ? (
          <p className="text-xs text-gray-500">{tc('sections.customDomain.freeKeepsRunning')}</p>
        ) : null}
        {error ? (
          <p role="alert" className="whitespace-pre-line text-xs text-red-600" data-testid="custom-domain-error">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const verified = Boolean(check?.verified);
  return (
    <div className="space-y-3 rounded-xl border border-purple-100 bg-white p-4" data-testid="custom-domain-connect">
      <p className="text-sm font-semibold text-gray-900">{tc('sections.customDomain.useOwn')}</p>

      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium text-gray-700">{tc('sections.customDomain.typeLabel')}</legend>
        <label className="flex items-center gap-2 text-sm text-gray-800">
          <input
            type="radio"
            name="custom-domain-type"
            checked={!isApex}
            onChange={() => handleTypeChange(false)}
          />
          {tc('sections.customDomain.typeSubdomain')}
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-800">
          <input
            type="radio"
            name="custom-domain-type"
            checked={isApex}
            onChange={() => handleTypeChange(true)}
          />
          {tc('sections.customDomain.typeApex')}
        </label>
      </fieldset>

      <div>
        <label htmlFor="custom-domain-input" className="mb-1 block text-xs font-medium text-gray-700">
          {tc('sections.customDomain.hostnameInputLabel')}
        </label>
        <input
          id="custom-domain-input"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={hostname}
          onChange={handleHostnameChange}
          placeholder={isApex ? 'tenmien.com' : 'lp.tenmien.com'}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm text-gray-900 placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleCheck}
          disabled={busy !== null || !hostname.trim()}
          className="rounded-lg bg-orange-500 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-orange-600 disabled:opacity-50"
        >
          {busy === 'check'
            ? tc('sections.customDomain.checking')
            : check
            ? tc('sections.customDomain.recheck')
            : tc('sections.customDomain.check')}
        </button>
        {verified ? (
          <button
            type="button"
            onClick={handleConnect}
            disabled={busy !== null}
            className="rounded-lg bg-green-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
          >
            {busy === 'connect' ? tc('sections.customDomain.connecting') : tc('sections.customDomain.connect')}
          </button>
        ) : null}
        <button
          type="button"
          onClick={resetConnectForm}
          disabled={busy !== null}
          className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 disabled:opacity-50"
        >
          {tc('sections.customDomain.close')}
        </button>
      </div>

      {check ? (
        <div className="space-y-2" data-testid="custom-domain-check-result">
          {!verified ? (
            <>
              <p className="text-xs font-medium text-amber-800">{tc('sections.customDomain.dnsTitle')}</p>
              <DnsRecordsTable records={check.dnsRecords} tc={tc} />
              <p className="text-xs font-medium text-amber-800" data-testid="custom-domain-dns-missing">
                {tc('sections.customDomain.dnsMissing')}
              </p>
              {check.message ? (
                <p className="whitespace-pre-line text-xs text-gray-500">{check.message}</p>
              ) : null}
            </>
          ) : (
            <p className="text-xs font-medium text-green-700" data-testid="custom-domain-dns-ok">
              {tc('sections.customDomain.dnsOk')}
            </p>
          )}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="whitespace-pre-line text-xs text-red-600" data-testid="custom-domain-error">
          {error}
        </p>
      ) : null}

      <p className="text-xs text-gray-500">{tc('sections.customDomain.freeKeepsRunning')}</p>
    </div>
  );
}
