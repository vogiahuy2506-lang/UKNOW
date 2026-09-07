import { useEffect, useMemo, useState } from 'react';
import {
  fetchLandingCustomDomain,
  putLandingCustomDomain,
  postLandingCustomDomainVerify,
  deleteLandingCustomDomain,
} from '../../landing-pages/services/landingPagesAdminApi.service.js';
import {
  HiOutlineGlobeAlt,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineExclamationCircle,
  HiOutlineRefresh,
  HiOutlineClipboardCopy,
  HiOutlineExternalLink,
  HiOutlineShieldCheck,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useI18n } from '../../../i18n';

const BASE_DOMAIN = 'founderai.biz';

/**
 * Domain Settings Panel trong Settings Modal.
 *
 * Tham chiếu logic từ LandingPageFullEditor (admin) + GitHub best-practice
 * cho custom domain flow (Cloudflare/Vercel/Netlify style):
 *
 *  1. User nhập hostname (vd: lp.example.com hoặc example.com)
 *  2. Tự động detect Apex vs Subdomain (≤ 2 phần = apex)
 *  3. Radio chọn thủ công nếu cần override
 *  4. Lưu → backend trả verificationRecord + status
 *  5. Hiển thị DNS instructions rõ ràng (A record vs CNAME record)
 *  6. Verify → poll status tới khi ACTIVE
 *  7. Auto provisioning SSL khi DNS active
 */
export default function DomainSettingsPanel({ form, setForm, editingId }) {
  const tc = useI18n('landingCanvas.domainSettings');
  const [cdInfo, setCdInfo] = useState(null);
  const [cdLoading, setCdLoading] = useState(false);
  const [cdBusy, setCdBusy] = useState(false);
  // Local UI mode (chỉ UI — backend vẫn lưu cả hai như cũ)
  // 'system' = dùng slug subdomain miễn phí
  // 'custom' = dùng tên miền riêng
  const [mode, setMode] = useState(
    form?.customDomainHostname ? 'custom' : 'system'
  );
  const [hostnameDraft, setHostnameDraft] = useState(form?.customDomainHostname || '');
  const [apexMode, setApexMode] = useState(false); // override auto-detect

  useEffect(() => {
    if (form?.customDomainHostname) setMode('custom');
    else if (!hostnameDraft.trim()) setMode('system');
  }, [form?.customDomainHostname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setHostnameDraft(form?.customDomainHostname || '');
  }, [form?.customDomainHostname]);

  // Auto-detect apex từ hostname (≤ 2 phần = apex)
  const autoApex = useMemo(() => {
    const parts = String(hostnameDraft || '').trim().toLowerCase().split('.').filter(Boolean);
    return parts.length > 0 && parts.length <= 2;
  }, [hostnameDraft]);

  useEffect(() => {
    if (!editingId) {
      setCdInfo(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        setCdLoading(true);
        const info = await fetchLandingCustomDomain(editingId);
        if (!cancelled) {
          const data = info?.data || null;
          setCdInfo(data);
          if (data?.isApexDomain != null) setApexMode(Boolean(data.isApexDomain));
        }
      } catch {
        if (!cancelled) setCdInfo(null);
      } finally {
        if (!cancelled) setCdLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editingId]);

  const status = cdInfo?.status || (cdInfo?.hostname ? 'PENDING' : 'NONE');
  const isApex = apexMode || autoApex;

  const handleSaveSlug = () => {
    const cleaned = String(form?.slug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '');
    setForm((prev) => ({
      ...prev,
      slug: cleaned,
      domainType: 'system',
      customDomainHostname: null,
      customDomainIsApex: false,
    }));
    setMode('system');
    toast.success(tc('freeSlugSuccess'));
  };

  const handleSaveHostname = async () => {
    if (!editingId) {
      toast.error(tc('notSavedError'));
      return;
    }
    const hostname = String(hostnameDraft || '').trim().toLowerCase();
    if (!hostname || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(hostname)) {
      toast.error(tc('hostnameInvalid'));
      return;
    }
    setCdBusy(true);
    try {
      const result = await putLandingCustomDomain(editingId, hostname, isApex);
      setCdInfo(result?.data || null);
      setForm((prev) => ({
        ...prev,
        domainType: 'custom',
        customDomainHostname: hostname,
        customDomainIsApex: isApex,
      }));
      setMode('custom');
      const waitTime = tc(isApex ? 'dnsWaitApex' : 'dnsWaitSub');
      toast.success(
        result?.data?.status === 'ACTIVE'
          ? tc('saveHostnameAutoVerified')
          : tc('saveHostnameSuccess', { waitTime })
      );
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || tc('saveHostnameError'));
    } finally {
      setCdBusy(false);
    }
  };

  const handleVerify = async () => {
    if (!editingId || !cdInfo?.hostname) return;
    setCdBusy(true);
    try {
      const result = await postLandingCustomDomainVerify(editingId);
      setCdInfo((prev) => ({ ...(prev || {}), ...(result?.data || {}) }));
      if (result?.data?.status === 'ACTIVE') {
        toast.success(tc('verifyActiveSuccess'));
      } else {
        const recordType = isApex ? 'A record' : 'CNAME record';
        toast.error(tc('verifyPending', { recordType }));
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || tc('verifyError'));
    } finally {
      setCdBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!editingId) return;
    if (!window.confirm(tc('confirmRemove'))) return;
    setCdBusy(true);
    try {
      await deleteLandingCustomDomain(editingId);
      setCdInfo(null);
      setHostnameDraft('');
      setMode('system');
      setForm((prev) => ({
        ...prev,
        domainType: 'system',
        customDomainHostname: null,
        customDomainIsApex: false,
      }));
      toast.success(tc('removeSuccess'));
    } catch (e) {
        toast.error(e?.response?.data?.message || tc('removeError'));
    } finally {
      setCdBusy(false);
    }
  };

  const copyToClipboard = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(tc('copied'));
    } catch {
      toast.error(tc('copyError'));
    }
  };

  return (
    <div className="space-y-6">
      {/* Switcher: chọn giữa slug miễn phí / tên miền riêng */}
      <div className="rounded-xl border border-gray-200 bg-gray-100 p-1.5 flex gap-1.5">
        <button
          type="button"
          onClick={() => setMode('system')}
          className={`flex-1 inline-flex items-center justify-center gap-2 px-6 py-4 rounded-lg text-[18px] font-semibold transition-colors ${
            mode === 'system'
              ? 'bg-white text-orange-600 shadow-sm border border-orange-200'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <HiOutlineGlobeAlt className="w-5 h-5" />
          {tc('modeFree')}
          <span className="text-[14px] text-green-600 font-medium">{tc('modeFreeBadge')}</span>
        </button>
        <button
          type="button"
          onClick={() => setMode('custom')}
          className={`flex-1 inline-flex items-center justify-center gap-2 px-6 py-4 rounded-lg text-[18px] font-semibold transition-colors ${
            mode === 'custom'
              ? 'bg-white text-purple-600 shadow-sm border border-purple-200'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <HiOutlineGlobeAlt className="w-5 h-5" />
          {tc('modeCustom')}
          <span className="text-[14px] text-purple-500 font-medium">{tc('modeCustomBadge')}</span>
        </button>
      </div>

      {mode === 'system' ? (
        /* ============== MODE: Subdomain miễn phí ============== */
        <section className="rounded-xl border border-gray-200 bg-white p-7 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <HiOutlineGlobeAlt className="w-7 h-7 text-orange-600" />
            <p className="text-[20px] font-semibold text-gray-900">{tc('freeTitle')}</p>
          </div>
          <p className="text-[17px] text-gray-500 mb-5">
            {tc('freeDesc')}{' '}
            <code className="text-[16px] bg-gray-100 px-2 py-0.5 rounded font-mono">
              {form?.slug || tc('freeSlugPlaceholder')}.{BASE_DOMAIN}
            </code>
          </p>
          <div className="flex items-center gap-3">
            <input
              value={form?.slug || ''}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  slug: e.target.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, ''),
                }))
              }
              placeholder={tc('freeSlugPlaceholder')}
              className="flex-1 rounded-lg border border-gray-300 px-5 py-3.5 text-[18px] focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition"
            />
            <button
              type="button"
              onClick={handleSaveSlug}
              className="px-6 h-[56px] rounded-lg bg-orange-500 text-white text-[18px] font-semibold hover:bg-orange-600 transition-colors"
            >
              {tc('freeSaveBtn')}
            </button>
          </div>
          <p className="text-[15px] text-gray-500 mt-3">
            {tc('freeSlugHelp')}
          </p>
        </section>
      ) : (
        /* ============== MODE: Tên miền riêng ============== */
        <section className="rounded-xl border border-gray-200 bg-white p-7 shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HiOutlineGlobeAlt className="w-6 h-6 text-purple-600" />
            <p className="text-[20px] font-semibold text-gray-900">{tc('customTitle')}</p>
          </div>
          {cdInfo?.hostname ? <StatusBadge status={status} tc={tc} /> : null}
        </div>

        {!editingId ? (
          <p className="text-[16px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-4">
            {tc('customNotSavedWarning')}
          </p>
        ) : cdLoading ? (
          <div className="flex items-center gap-2 text-[16px] text-gray-500">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-orange-500 rounded-full animate-spin" />
            {tc('customLoading')}
          </div>
        ) : (
          <>
            {/* Input hostname */}
            <div>
              <label className="text-[16px] font-medium text-gray-700 mb-2 block">{tc('hostnameLabel')}</label>
              <div className="flex items-center gap-3">
                <input
                  value={hostnameDraft}
                  onChange={(e) => setHostnameDraft(e.target.value)}
                  placeholder={tc('hostnamePlaceholder')}
                  className="flex-1 rounded-lg border border-gray-300 px-5 py-3.5 text-[18px] font-mono focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition"
                />
                <button
                  type="button"
                  onClick={handleSaveHostname}
                  disabled={cdBusy || !hostnameDraft.trim()}
                  className="px-6 h-[56px] rounded-lg bg-purple-600 text-white text-[18px] font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {tc('save')}
                </button>
              </div>
            </div>

            {/* Radio Sub/Apex (override auto-detect) */}
            <div className="flex flex-wrap items-center gap-5 text-[16px]">
              <span className="text-gray-600 font-medium">{tc('domainTypeLabel')}</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="domain-type"
                  checked={!isApex}
                  onChange={() => setApexMode(false)}
                  className="text-purple-600 focus:ring-purple-500 w-4 h-4"
                />
                <span className="text-gray-700">{tc('subdomainLabel')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="domain-type"
                  checked={isApex}
                  onChange={() => setApexMode(true)}
                  className="text-purple-600 focus:ring-purple-500 w-4 h-4"
                />
                <span className="text-gray-700">{tc('apexLabel')}</span>
              </label>
            </div>

            {/* Status timeline */}
            {cdInfo?.hostname ? <StatusTimeline status={status} isApex={isApex} tc={tc} /> : null}

            {/* DNS instructions */}
            {cdInfo?.hostname ? (
              <DnsInstructions
                cdInfo={cdInfo}
                isApex={isApex}
                onCopy={copyToClipboard}
                tc={tc}
              />
            ) : null}

            {/* SSL info */}
            {cdInfo?.hostname && status === 'ACTIVE' ? (
              <div className="flex items-center gap-2 text-[15px] text-gray-600 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
                <HiOutlineShieldCheck className="w-5 h-5 text-green-600 shrink-0" />
                <span>
                  SSL:{' '}
                  {cdInfo.sslActive ? (
                    <span className="text-green-700 font-medium">{tc('sslActive')}</span>
                  ) : (
                    <span className="text-amber-700">{tc('sslPending')}</span>
                  )}
                </span>
              </div>
            ) : null}

            {/* Action buttons */}
            {cdInfo?.hostname ? (
              <div className="flex flex-wrap gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={cdBusy}
                  className="px-5 h-12 rounded-lg bg-white border border-gray-300 text-[16px] text-gray-700 hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-2"
                >
                  <HiOutlineRefresh className="w-5 h-5" /> {tc('verifyDns')}
                </button>
                {cdInfo.hostname ? (
                  <a
                    href={`https://${cdInfo.hostname}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-5 h-12 rounded-lg bg-white border border-gray-300 text-[16px] text-gray-700 hover:bg-gray-50 inline-flex items-center gap-2"
                  >
                    <HiOutlineExternalLink className="w-5 h-5" /> {tc('openDomain')}
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={cdBusy}
                  className="px-5 h-12 rounded-lg bg-white border border-red-300 text-[16px] text-red-600 hover:bg-red-50 disabled:opacity-50 ml-auto"
                >
                  {tc('removeDomain')}
                </button>
              </div>
            ) : null}
          </>
        )}
        </section>
      )}
    </div>
  );
}

/**
 * Status timeline — 4 bước:
 *  1. Thêm tên miền ✓
 *  2. Cấu hình DNS (chờ propagate)
 *  3. Xác minh DNS
 *  4. Cấp SSL
 */
function StatusTimeline({ status, isApex, tc }) {
  const steps = [
    { key: 'added', label: tc('stepAddDomain'), always: true },
    { key: 'dns', label: isApex ? tc('stepDnsApex') : tc('stepDnsSub') },
    { key: 'verified', label: tc('stepVerifyDns'), activeOn: ['ACTIVE'] },
    { key: 'ssl', label: tc('stepSsl'), activeOn: ['ACTIVE'] },
  ];

  const activeIdx = steps.findIndex((s) => s.activeOn?.includes(status));

  return (
    <div className="rounded-xl bg-gray-50 border border-gray-200 p-5">
      <p className="text-[14px] font-semibold text-gray-500 mb-3.5 uppercase tracking-[1.2px]">
        {tc('stepsTitle')}
      </p>
      <ol className="space-y-3">
        {steps.map((step, i) => {
          const done = i <= activeIdx;
          const current = i === activeIdx && status !== 'ACTIVE';
          return (
            <li key={step.key} className="flex items-center gap-3.5 text-[16px]">
              <span
                className={`w-8 h-8 rounded-full flex items-center justify-center text-[14px] font-bold shrink-0 ${
                  done
                    ? 'bg-green-500 text-white'
                    : current
                      ? 'bg-amber-400 text-white animate-pulse'
                      : 'bg-gray-200 text-gray-500'
                }`}
              >
                {done && !current ? '✓' : i + 1}
              </span>
              <span
                className={`${
                  done ? 'text-gray-800' : current ? 'text-amber-700 font-semibold' : 'text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * DNS instructions — hiển thị các record cần thêm vào DNS provider.
 *  - Apex (example.com): A record trỏ về IP server
 *  - Subdomain (lp.example.com): CNAME trỏ về target
 *
 * Thứ tự ưu tiên value của A record:
 *   1. cdInfo.dnsRecords[].value (BACKEND trả IP server thật)
 *   2. import.meta.env.VITE_LANDING_SERVER_IP (fallback nếu backend chưa trả)
 *   3. Nếu cả 2 đều rỗng → placeholder, kèm cảnh báo.
 */
function DnsInstructions({ cdInfo, isApex, onCopy, tc }) {
  const envServerIp = String(import.meta.env.VITE_LANDING_SERVER_IP || '').trim();

  const fromBackend = cdInfo?.dnsRecords?.length
    ? cdInfo.dnsRecords
    : cdInfo?.verificationRecord
      ? [{
          type: isApex ? 'A' : 'CNAME',
          host: cdInfo.dnsRecords?.host || (isApex ? '@' : (cdInfo.hostname?.split('.')[0] || 'lp')),
          value: cdInfo.verificationRecord,
          ttl: cdInfo.dnsRecords?.ttl || 3600,
        }]
      : null;

  let records;
  if (fromBackend && fromBackend.length > 0) {
    records = fromBackend.map((r) => ({
      type: r.type || (isApex ? 'A' : 'CNAME'),
      host: r.host || (isApex ? '@' : (cdInfo.hostname?.split('.')[0] || 'lp')),
      value: r.value || '',
      ttl: r.ttl || 3600,
      note: r.note,
    }));
  } else {
    // Fallback khi backend chưa trả record (vd: chưa lưu lần nào)
    const host = isApex ? '@' : (cdInfo.hostname?.split('.')[0] || 'lp');
    const value = isApex
      ? (envServerIp || '')               // A record — cần IP server thật
      : `${BASE_DOMAIN}.`;                 // CNAME — luôn trỏ về domain hệ thống
    records = [
      {
        type: isApex ? 'A' : 'CNAME',
        host,
        value,
        ttl: 3600,
        note: isApex && !envServerIp ? tc('dnsMissingValue') : undefined,
      },
    ];
  }

  // Nếu vẫn còn record thiếu value → cảnh báo user
  const missingValue = records.some((r) => !r.value);

  const waitTime = tc(isApex ? 'dnsWaitApex' : 'dnsWaitSub');

  return (
    <div className="rounded-xl bg-purple-50/40 border border-purple-200 p-5 space-y-3.5">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold text-purple-700 uppercase tracking-[1.2px]">
          {tc('dnsGuideTitle')}
        </p>
        <span className="text-[14px] text-gray-500">
          {tc('dnsWaitTime')} <strong className="text-gray-700">{waitTime}</strong>
        </span>
      </div>
      <p className="text-[17px] text-gray-600 leading-relaxed">
        {tc('dnsGuideDesc')} <strong>{records.length}</strong> {tc('dnsGuideDescSuffix')}
      </p>
      {missingValue ? (
        <div className="flex items-start gap-2 text-[15px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
          <HiOutlineExclamationCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <span>
            {tc('dnsMissingValue')} <strong>{tc('dnsMissingValueBtn')}</strong> {tc('dnsMissingValueSuffix')}
          </span>
        </div>
      ) : null}
      <div className="space-y-2.5">
        {records.map((r, i) => (
          <div
            key={i}
            className="grid grid-cols-[68px_1fr_auto] gap-3.5 items-center bg-white border border-purple-200 rounded-lg px-4 py-3"
          >
            <span className="text-[15px] font-bold text-purple-700 bg-purple-100 px-2 py-1 rounded text-center">
              {r.type}
            </span>
            <div className="min-w-0">
              <div className="text-[15px] text-gray-500 font-mono truncate">
                <span className="text-gray-400">{tc('dnsHost')}</span> {r.host}
              </div>
              <div className={`text-[17px] font-mono truncate ${r.value ? 'text-gray-800' : 'text-gray-400 italic'}`}>
                <span className="text-gray-400">{tc('dnsValue')}</span>{' '}
                {r.value || tc('dnsValuePending')}
              </div>
              {r.note ? (
                <div className="text-[14px] text-gray-500 mt-0.5">{r.note}</div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onCopy(`${r.type} ${r.host} → ${r.value}`, tc('dnsRecordCopied'))}
              disabled={!r.value}
              className="p-2.5 rounded hover:bg-purple-100 text-purple-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              title={tc('dnsCopyBtn')}
            >
              <HiOutlineClipboardCopy className="w-5 h-5" />
            </button>
          </div>
        ))}
      </div>
      {cdInfo?.verificationRecord ? (
        <div className="text-[15px] text-gray-600 pt-3 border-t border-purple-100 mt-1.5 leading-relaxed">
          {tc('dnsTxtRecord')}{' '}
          <code className="bg-white px-2.5 py-1.5 rounded border border-purple-200 text-gray-700 font-mono text-[15px]">
            {cdInfo.verificationRecord}
          </code>
        </div>
      ) : null}
    </div>
  );
}

function StatusBadge({ status, tc }) {
  if (status === 'ACTIVE') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[14px] font-semibold bg-green-50 text-green-700 border border-green-200">
        <HiOutlineCheckCircle className="w-4 h-4" /> {tc('statusActive')}
      </span>
    );
  }
  if (status === 'PENDING') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[14px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
        <HiOutlineClock className="w-4 h-4" /> {tc('statusPending')}
      </span>
    );
  }
  if (status === 'ERROR') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[14px] font-semibold bg-red-50 text-red-700 border border-red-200">
        <HiOutlineExclamationCircle className="w-4 h-4" /> {tc('statusError')}
      </span>
    );
  }
  return null;
}
