/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  HiOutlineTemplate,
  HiOutlineViewGrid, HiOutlineGlobeAlt, HiOutlineChevronDown, HiOutlineChevronRight,
  HiOutlineClipboard, HiOutlineTrash, HiOutlineCheck, HiOutlineExternalLink,
  HiOutlineQuestionMarkCircle, HiOutlineCode, HiOutlineX, HiOutlineRefresh,
  HiOutlinePencilAlt, HiOutlineArrowRight, HiOutlineArrowLeft, HiOutlineShieldCheck,
  HiOutlineLink, HiOutlineCheckCircle, HiOutlineClock,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useI18n } from '../../../i18n';
import { useDebouncedCallback } from '../../../hooks/useDebounce.js';
import {
  deleteLandingCustomDomain,
  fetchLandingCustomDomain,
  generateLandingHtmlWithAi,
  postLandingCustomDomainVerify,
  postLandingCustomDomainProvisionSsl,
  putLandingCustomDomain,
  updateLandingPageAdmin,
} from '../services/landingPagesAdminApi.service.js';
import { getLandingManualInsertSnippets } from '../utils/injectLandingEnhancements.js';
import SaveTemplateModal from './SaveTemplateModal.jsx';
import { normalizeLandingLpTrackApiBase } from '../utils/normalizeLandingLpTrackApiBase.js';
import TemplateGallery from './TemplateGallery.jsx';
import VisualBlockEditor from './VisualBlockEditor.jsx';
import LeadFormConfigPanel from './LeadFormConfigPanel.jsx';
import { getAiQuotaErrorMessage } from '../../../utils/aiLimitError.util';

const LP_FORM_MARKER = '<!-- UKNOW_LP_FORM -->';
const BASE_DOMAIN = 'founderai.biz';

const getAiErrorMessage = (error, t, fallbackKey) => {
  if (error?.response?.data?.code === 'RESOURCE_LIMIT_EXCEEDED') {
    return getAiQuotaErrorMessage(error, t);
  }
  const data = error?.response?.data || {};
  return data.message || error?.message || t(fallbackKey);
};

// AI Templates for quick generation
const AI_TEMPLATES = {
  saas: {
    name: 'SaaS / Phần mềm',
    icon: '💻',
    color: '#3b82f6',
    prompt: 'Tạo landing page cho một sản phẩm SaaS với các section: Hero với headline mạnh, Tính năng chính 3 cột, Đánh giá khách hàng, FAQ, Form đăng ký, và Footer. Sử dụng tone chuyên nghiệp, hiện đại.'
  },
  course: {
    name: 'Khóa học online',
    icon: '📚',
    color: '#8b5cf6',
    prompt: 'Tạo landing page cho khóa học online với: Hero với tiêu đề hấp dẫn, Giới thiệu khóa học, Lợi ích khi học, Testimonials từ học viên, FAQ, Form đăng ký, và Footer. Sử dụng tone truyền cảm hứng, đáng tin cậy.'
  },
  ecommerce: {
    name: 'Cửa hàng online',
    icon: '🛒',
    color: '#10b981',
    prompt: 'Tạo landing page cho cửa hàng online với: Hero với sản phẩm nổi bật, Cam kết của cửa hàng, Danh mục sản phẩm, Đánh giá khách hàng, Ưu đãi đặc biệt, Form liên hệ, và Footer. Sử dụng tone thân thiện, đáng tin.'
  },
  agency: {
    name: 'Dịch vụ/Agency',
    icon: '🎯',
    color: '#f59e0b',
    prompt: 'Tạo landing page cho agency dịch vụ với: Hero với USP rõ ràng, Dịch vụ cung cấp, Case study thành công, Đội ngũ chuyên gia, Quy trình làm việc, Form tư vấn, và Footer. Sử dụng tone chuyên nghiệp, đáng tin.'
  },
  event: {
    name: 'Sự kiện/Hội thảo',
    icon: '🎪',
    color: '#ec4899',
    prompt: 'Tạo landing page cho sự kiện/hội thảo với: Hero với thông tin sự kiện, Diễn giả nổi bật, Lịch trình sự kiện, Địa điểm và thời gian, Testimonials, Form đăng ký tham gia, và Footer. Sử dụng tone năng động, hấp dẫn.'
  },
};

function SectionCard({ title, icon: Icon, children, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-5 h-5 text-gray-600" />}
          <span className="font-medium text-gray-800">{title}</span>
        </div>
        {isOpen ? (
          <HiOutlineChevronDown className="w-5 h-5 text-gray-400" />
        ) : (
          <HiOutlineChevronRight className="w-5 h-5 text-gray-400" />
        )}
      </button>
      {isOpen && (
        <div className="p-4 border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  );
}

const TONE_STYLES = {
  success: {
    wrapper: 'border-green-200 bg-green-50/40',
    headerBg: 'bg-green-50 border-green-100',
    iconWrap: 'bg-green-100 text-green-700',
    badge: 'bg-green-100 text-green-700',
    hostname: 'text-green-900',
  },
  info: {
    wrapper: 'border-purple-200 bg-purple-50/30',
    headerBg: 'bg-purple-50 border-purple-100',
    iconWrap: 'bg-purple-100 text-purple-700',
    badge: 'bg-purple-100 text-purple-700',
    hostname: 'text-purple-900',
  },
  warning: {
    wrapper: 'border-amber-200 bg-amber-50/30',
    headerBg: 'bg-amber-50 border-amber-100',
    iconWrap: 'bg-amber-100 text-amber-700',
    badge: 'bg-amber-100 text-amber-700',
    hostname: 'text-amber-900',
  },
};

const BADGE_TONE = {
  success: 'bg-green-100 text-green-700',
  info: 'bg-blue-100 text-blue-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
};

function DomainActionButton({ action, variant = 'secondary' }) {
  const { icon: Icon, label, onClick, href, external, disabled, spinning } = action;
  const baseClass =
    'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClass = (() => {
    if (variant === 'primary') {
      return 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700 hover:border-blue-700';
    }
    if (variant === 'danger') {
      return 'bg-white border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300';
    }
    return 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400';
  })();

  const content = (
    <>
      {Icon && <Icon className={`w-3.5 h-3.5 ${spinning ? 'animate-spin' : ''}`} />}
      {label}
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        className={`${baseClass} ${variantClass}`}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${baseClass} ${variantClass}`}
    >
      {content}
    </button>
  );
}

function DomainActionBar({ primaryActions = [], secondaryActions = [], dangerActions = [] }) {
  if (!primaryActions.length && !secondaryActions.length && !dangerActions.length) return null;

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-gray-100 bg-gray-50/60">
      <div className="flex items-center gap-2 flex-wrap">
        {primaryActions.map((a) => (
          <DomainActionButton key={a.key} action={a} variant="primary" />
        ))}
        {secondaryActions.map((a) => (
          <DomainActionButton key={a.key} action={a} variant="secondary" />
        ))}
      </div>
      {dangerActions.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {dangerActions.map((a) => (
            <DomainActionButton key={a.key} action={a} variant="danger" />
          ))}
        </div>
      )}
    </div>
  );
}

function DomainActionCard({
  tone = 'info',
  icon: Icon,
  badge,
  badgeTone = 'info',
  hostname,
  editableHostname, // { value, onChange, suffix, placeholder } — chỉnh hostname ngay tại header
  editable = false,
  description,
  meta,
  bodyExtras,
  primaryActions = [],
  secondaryActions = [],
  dangerActions = [],
}) {
  const styles = TONE_STYLES[tone] || TONE_STYLES.info;
  const badgeClass = BADGE_TONE[badgeTone] || BADGE_TONE.info;

  return (
    <div className={`border rounded-lg overflow-hidden ${styles.wrapper}`}>
      <div className={`flex items-center gap-2 px-3 py-2.5 border-b ${styles.headerBg}`}>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${styles.iconWrap}`}>
          {Icon && <Icon className="w-4 h-4" />}
        </div>
        <div className="min-w-0 flex-1">
          {badge && (
            <span className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded uppercase tracking-wide ${badgeClass}`}>
              {badge}
            </span>
          )}
          {editableHostname ? (
            <div className="mt-0.5 flex items-center rounded-md border border-gray-300 bg-white overflow-hidden focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
              <input
                className="flex-1 px-2 py-1 text-sm font-mono outline-none min-w-0"
                value={editableHostname.value}
                onChange={(e) => editableHostname.onChange(e.target.value.replace(/^\/+/, ''))}
                placeholder={editableHostname.placeholder || 'your-slug'}
              />
              {editableHostname.suffix && (
                <span className="px-2 py-1 text-sm text-gray-500 bg-gray-50 border-l border-gray-300 font-mono flex-shrink-0">
                  {editableHostname.suffix}
                </span>
              )}
            </div>
          ) : (
            <p className={`font-mono font-semibold text-sm break-all ${styles.hostname} ${editable ? 'mt-0.5' : ''}`}>
              {hostname}
            </p>
          )}
        </div>
      </div>
      {(description || meta || bodyExtras) && (
        <div className="px-3 py-3 space-y-2">
          {description && <p className="text-xs text-gray-600">{description}</p>}
          {meta && <div className="text-xs text-gray-500">{meta}</div>}
          {bodyExtras}
        </div>
      )}
      {(primaryActions.length > 0 || secondaryActions.length > 0 || dangerActions.length > 0) && (
        <DomainActionBar
          primaryActions={primaryActions}
          secondaryActions={secondaryActions}
          dangerActions={dangerActions}
        />
      )}
    </div>
  );
}

/**
 * Segmented switch để đổi giữa "subdomain hệ thống" và "tên miền riêng".
 * Click đúp vào tab hiện tại sẽ không có tác dụng — chỉ chuyển khi user chọn tab khác.
 */
function DomainSourceSwitch({ value, onChange, disabled }) {
  const options = [
    { id: 'system', label: 'Subdomain miễn phí', icon: HiOutlineGlobeAlt },
    { id: 'custom', label: 'Tên miền riêng', icon: HiOutlineShieldCheck },
  ];
  return (
    <div className="inline-flex w-full rounded-lg border border-gray-200 bg-gray-100 p-0.5">
      {options.map((opt) => {
        const active = value === opt.id;
        const Icon = opt.icon;
        return (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.id)}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              active
                ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                : 'text-gray-500 hover:text-gray-700 disabled:opacity-50'
            }`}
          >
            <Icon className={`w-3.5 h-3.5 ${active ? 'text-blue-600' : ''}`} />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Wrapper giống nhau cho mọi "phần" domain. Hai phần Subdomain miễn phí và Tên miền riêng
 * dùng cùng skeleton → đảm bảo 2 cột luôn cân nhau.
 */
function DomainColumn({
  icon: Icon,
  title,
  badge,
  badgeTone = 'info',
  headerTone = 'gray',
  children,
  footer,
}) {
  const headerTones = {
    gray: 'bg-gray-50 text-gray-700',
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    amber: 'bg-amber-50 text-amber-700',
    purple: 'bg-purple-50 text-purple-700',
  };
  const badgeClass = BADGE_TONE[badgeTone] || BADGE_TONE.info;
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white flex flex-col h-full">
      <div className={`flex items-center gap-2 px-3 py-2.5 border-b border-gray-200 ${headerTones[headerTone] || headerTones.gray}`}>
        <div className="w-7 h-7 rounded-lg bg-white/70 flex items-center justify-center">
          {Icon && <Icon className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{title}</p>
        </div>
      </div>
      <div className="flex-1 p-3 space-y-3">{children}</div>
      {footer && (
        <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/50 flex flex-wrap items-center justify-end gap-2">
          {footer}
        </div>
      )}
    </div>
  );
}

/**
 * Card "Subdomain miễn phí" — luôn hiển thị, luôn có thể đổi slug.
 *
 * Props:
 *  - slug: form.slug hiện tại
 *  - originalSlug: slug đang active trên server (chỉ enable nút Áp dụng khi khác)
 *  - activeHostname: subdomain đã active (vd: "lp.mybrand.founderai.biz")
 *  - isActive / isPending / isLoading: trạng thái hiện tại
 *  - busy: disable inputs
 *  - onChangeSlug(slug)
 *  - onApply() — gọi API đổi subdomain
 *  - onRetry() — thử lại khi pending
 */
function SubdomainCard({
  slug,
  originalSlug,
  activeHostname,
  isActive,
  isPending,
  isLoading,
  busy,
  onChangeSlug,
  onApply,
  onRetry,
}) {
  const slugChanged = String(slug || '').trim() !== String(originalSlug || '').trim();
  const finalHostname = `${slug || ''}.${BASE_DOMAIN}`;

  let badge, badgeTone, headerTone, statusText;
  if (isLoading) {
    badge = 'Đang tải';
    badgeTone = 'info';
    headerTone = 'gray';
    statusText = 'Đang tải trạng thái…';
  } else if (isPending) {
    badge = 'Đang cấp';
    badgeTone = 'warning';
    headerTone = 'amber';
    statusText = 'Hệ thống đang tạo subdomain trên Cloudflare…';
  } else if (isActive) {
    badge = 'Hoạt động';
    badgeTone = 'success';
    headerTone = 'green';
    statusText = null;
  } else {
    badge = 'Chưa cấu hình';
    badgeTone = 'info';
    headerTone = 'gray';
    statusText = 'Subdomain sẽ được cấp tự động ngay khi bạn bấm Áp dụng.';
  }

  return (
    <DomainColumn
      icon={HiOutlineGlobeAlt}
      title="Subdomain miễn phí (hệ thống cấp)"
      badge={badge}
      badgeTone={badgeTone}
      headerTone={headerTone}
      footer={
        <>
          {isActive && (
            <a
              href={`https://${finalHostname}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded border border-blue-200 transition-colors"
            >
              <HiOutlineExternalLink className="w-3.5 h-3.5" />
              Mở
            </a>
          )}
          {isPending && (
            <button
              type="button"
              onClick={onRetry}
              disabled={busy}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 rounded border border-amber-200 disabled:opacity-50 transition-colors"
            >
              <HiOutlineRefresh className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
              Thử lại
            </button>
          )}
          <button
            type="button"
            onClick={onApply}
            disabled={busy || isLoading || !slugChanged || !slug.trim()}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50 disabled:bg-gray-300 transition-colors"
          >
            <HiOutlineCheck className="w-3.5 h-3.5" />
            {busy ? 'Đang áp dụng…' : 'Áp dụng'}
          </button>
        </>
      }
    >
      {/* Input slug — nhập trực tiếp trong card */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Slug subdomain miễn phí
        </label>
        <div className="flex items-stretch rounded-lg border border-gray-300 bg-white focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 overflow-hidden">
          <input
            type="text"
            className="flex-1 px-2 py-2 text-sm font-mono outline-none min-w-0 disabled:bg-gray-50 disabled:text-gray-500"
            value={slug || ''}
            onChange={(e) => onChangeSlug?.(e.target.value)}
            placeholder="your-slug"
            disabled={busy || isLoading}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <span className="px-2 py-2 text-sm text-gray-500 bg-gray-50 border-l border-gray-300 font-mono flex-shrink-0">
            .{BASE_DOMAIN}
          </span>
        </div>
        <p className="text-[11px] text-gray-500 mt-1">
          Nhập slug rồi bấm <strong>Áp dụng</strong> để cấp subdomain. Để trống hệ thống sẽ tự sinh.
        </p>
      </div>

      {/* Status text */}
      {statusText && (
        <div className={`text-xs px-2.5 py-1.5 rounded flex items-start gap-1.5 ${
          isPending ? 'bg-amber-50 text-amber-700 border border-amber-100'
                    : 'bg-gray-50 text-gray-600 border border-gray-100'
        }`}>
          {isPending ? <HiOutlineClock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                     : <HiOutlineQuestionMarkCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
          <span>{statusText}</span>
        </div>
      )}

      {/* Hostname đang active (chỉ khi active và khác với input) */}
      {isActive && activeHostname && activeHostname !== finalHostname && (
        <div className="text-xs text-gray-500">
          Đang hoạt động tại:{' '}
          <a
            href={`https://${activeHostname}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-mono text-gray-700 hover:text-blue-600"
          >
            {activeHostname}
          </a>
        </div>
      )}

      {/* Backup link */}
      {isActive && slug && (
        <div className="text-xs text-gray-500 border-t border-gray-100 pt-2">
          <span className="text-gray-400">Link dự phòng (luôn hoạt động): </span>
          <a
            href={`https://${BASE_DOMAIN}/lp/${encodeURIComponent(slug)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-mono text-gray-700 hover:text-blue-600"
          >
            {BASE_DOMAIN}/lp/{slug}
          </a>
        </div>
      )}
    </DomainColumn>
  );
}

/**
 * Card "Tên miền riêng" — luôn hiển thị, hiển thị theo 3 trạng thái:
 *   - active: đang hoạt động
 *   - pending: đang chờ DNS
 *   - none: chưa cấu hình → hiện form nhập
 *
 * Props:
 *  - cdInfo: object từ API getCustomDomain
 *  - hostnameDraft / onChangeHostnameDraft: input form nhập
 *  - isApexDomain / onToggleApex: chọn loại domain
 *  - busy: disable inputs
 *  - onSave() — gọi API PUT custom-domain
 *  - onVerify() — gọi API verify
 *  - onProvisionSsl() — gọi API provision-ssl
 *  - onRemove() — xóa custom domain
 *  - onUseSystem() — chuyển sang dùng subdomain miễn phí
 */
function CustomDomainCard({
  cdInfo,
  hostnameDraft,
  onChangeHostnameDraft,
  isApexDomain,
  onToggleApex,
  busy,
  onSave,
  onVerify,
  onProvisionSsl,
  onRemove,
  onUseSystem,
  pendingCreate = false,
}) {
  const configured = cdInfo?.configured;
  const status = cdInfo?.status;
  const isActive = configured && status === 'active' && !cdInfo?.cfManaged;
  const isPending = configured && status === 'pending_verification' && !cdInfo?.cfManaged;

  // Xác định loại domain đã lưu: 'sub' | 'apex' | null
  const savedApex = cdInfo?.apex === true || cdInfo?.domainSubtype === 'apex';
  const savedSubtype = cdInfo?.domainSubtype;
  const isApexSaved =
    Boolean(savedApex) ||
    (savedSubtype === 'apex') ||
    (savedSubtype !== 'subdomain' && Boolean(cdInfo?.hostname) && (cdInfo?.hostname || '').split('.').length <= 2);

  // Tiêu đề card phân biệt Sub vs Apex
  const cardTitle = (isActive || isPending || configured)
    ? (isApexSaved ? 'Tên miền riêng — Apex' : 'Tên miền riêng — Sub')
    : (isApexDomain ? 'Tên miền riêng — Apex' : 'Tên miền riêng — Sub');

  let badge, badgeTone, headerTone;
  if (isActive) {
    badge = 'Hoạt động';
    badgeTone = 'success';
    headerTone = 'green';
  } else if (isPending) {
    badge = 'Chờ DNS';
    badgeTone = 'warning';
    headerTone = 'amber';
  } else if (configured) {
    badge = 'Đang xử lý';
    badgeTone = 'info';
    headerTone = 'blue';
  } else {
    badge = 'Chưa cấu hình';
    badgeTone = 'info';
    headerTone = 'purple';
  }

  // === ACTIVE ===
  if (isActive) {
    return (
      <DomainColumn
        icon={HiOutlineShieldCheck}
        title={cardTitle}
        badge={badge}
        badgeTone={badgeTone}
        headerTone={headerTone}
        footer={
          <>
            <button
              type="button"
              onClick={onUseSystem}
              disabled={busy}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded border border-gray-200 disabled:opacity-50 transition-colors"
            >
              <HiOutlineArrowLeft className="w-3.5 h-3.5" />
              Dùng subdomain miễn phí
            </button>
            <button
              type="button"
              onClick={onProvisionSsl}
              disabled={busy}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded border border-blue-200 disabled:opacity-50 transition-colors"
            >
              <HiOutlineShieldCheck className="w-3.5 h-3.5" />
              {busy ? 'Đang cấp…' : 'Cấp SSL'}
            </button>
            <a
              href={`https://${cdInfo.hostname}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded border border-blue-200 transition-colors"
            >
              <HiOutlineExternalLink className="w-3.5 h-3.5" />
              Mở
            </a>
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded border border-red-200 disabled:opacity-50 transition-colors"
            >
              <HiOutlineTrash className="w-3.5 h-3.5" />
              Xóa
            </button>
          </>
        }
      >
        <div>
          <p className="font-mono font-semibold text-sm break-all text-gray-900">{cdInfo.hostname}</p>
          <p className="text-[11px] text-gray-500 mt-1">
            {cdInfo.isApexDomain ? 'Tên miền chính.' : 'Tên con của website bạn.'} HTTPS đã được cấp.
          </p>
        </div>
      </DomainColumn>
    );
  }

  // === PENDING (chờ DNS) ===
  if (isPending) {
    const isApex = cdInfo?.isApexDomain;
    const hostnameParts = String(cdInfo.hostname || '').split('.');
    const recordName = isApex
      ? '@'
      : (hostnameParts.length > 2 ? hostnameParts.slice(0, -2).join('.') || 'www' : 'www');
    const cnameTarget = cdInfo.cnameTarget || BASE_DOMAIN;
    const apexIp = cdInfo.apexFixedIp || '103.110.87.210';
    return (
      <DomainColumn
        icon={HiOutlineLink}
        title={cardTitle}
        badge={badge}
        badgeTone={badgeTone}
        headerTone={headerTone}
        footer={
          <>
            <button
              type="button"
              onClick={onUseSystem}
              disabled={busy}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded border border-gray-200 disabled:opacity-50 transition-colors"
            >
              <HiOutlineArrowLeft className="w-3.5 h-3.5" />
              Dùng subdomain miễn phí
            </button>
            <button
              type="button"
              onClick={onVerify}
              disabled={busy}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 rounded border border-amber-200 disabled:opacity-50 transition-colors"
            >
              <HiOutlineRefresh className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
              {busy ? 'Đang kiểm tra…' : 'Kiểm tra lại'}
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded border border-red-200 disabled:opacity-50 transition-colors"
            >
              <HiOutlineX className="w-3.5 h-3.5" />
              Hủy
            </button>
          </>
        }
      >
        <div>
          <p className="text-xs text-gray-600 mb-1.5">
            Vào trang quản lý tên miền, thêm <strong>1 dòng</strong> sau:
          </p>
          <div className="bg-gray-900 rounded-md p-2.5 font-mono text-xs text-green-400 space-y-1">
            <div><span className="text-gray-500">Loại: </span><span>{isApex ? 'A' : 'CNAME'}</span></div>
            <div><span className="text-gray-500">Tên: </span><span>{recordName}</span></div>
            <div>
              <span className="text-gray-500">Trỏ về: </span>
              <span className="text-yellow-300 break-all">{isApex ? apexIp : cnameTarget}</span>
            </div>
          </div>
          <p className="text-[11px] text-gray-500 mt-1.5">
            Sau khi lưu, DNS cần khoảng <strong>30 phút - 24 giờ</strong> để cập nhật. Có thể đóng trang và quay lại.
          </p>
        </div>
      </DomainColumn>
    );
  }

  // === NONE (chưa cấu hình) — form nhập ===
  return (
    <DomainColumn
      icon={HiOutlineShieldCheck}
      title={cardTitle}
      badge={badge}
      badgeTone={badgeTone}
      headerTone={headerTone}
      footer={
        <>
          {configured && (
            <button
              type="button"
              onClick={onUseSystem}
              disabled={busy}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded border border-gray-200 disabled:opacity-50 transition-colors"
            >
              <HiOutlineArrowLeft className="w-3.5 h-3.5" />
              Dùng subdomain miễn phí
            </button>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={busy || !hostnameDraft.trim()}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50 disabled:bg-gray-300 transition-colors"
          >
            <HiOutlineCheck className="w-3.5 h-3.5" />
            {busy ? 'Đang lưu…' : (pendingCreate ? 'Tạo landing + cấu hình domain' : 'Thêm domain')}
          </button>
        </>
      }
    >
      <p className="text-xs text-gray-600">
        Dùng tên miền <strong>của bạn</strong>. Sau khi lưu, hệ thống sẽ kiểm tra DNS rồi cấp HTTPS.
      </p>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Nhập tên miền của bạn
        </label>
        <input
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
          placeholder={isApexDomain ? 'example.com' : 'lp.example.com'}
          value={hostnameDraft}
          onChange={(e) => onChangeHostnameDraft(e.target.value)}
          disabled={busy}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onToggleApex(false)}
          className={`text-left rounded-lg border p-2 transition-colors ${
            !isApexDomain
              ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-200'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="text-xs font-medium text-gray-800 flex items-center gap-1">
            Tên con
            {!isApexDomain && <HiOutlineCheckCircle className="w-3.5 h-3.5 text-purple-600" />}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">vd: lp.your.com</div>
        </button>
        <button
          type="button"
          onClick={() => onToggleApex(true)}
          className={`text-left rounded-lg border p-2 transition-colors ${
            isApexDomain
              ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-200'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="text-xs font-medium text-gray-800 flex items-center gap-1">
            Tên miền chính
            {isApexDomain && <HiOutlineCheckCircle className="w-3.5 h-3.5 text-purple-600" />}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">vd: your.com</div>
        </button>
      </div>
    </DomainColumn>
  );
}

export default function LandingPageFullEditor({
  open,
  editingId,
  form,
  setForm,
  saving,
  previewSrcDoc,
  links,
  onClose,
  onSave,
  onCreatePageWithCustomDomain,
}) {
  const { t } = useI18n();
  const snippetContext = useMemo(() => {
    const slug = String(form.slug || '').trim().toLowerCase();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const apiBase = normalizeLandingLpTrackApiBase(
      String(import.meta.env.VITE_API_URL || `${origin}/api`)
    );
    const result = getLandingManualInsertSnippets({ slug, frontendOrigin: origin, apiBase }, t);
    return {
      ...result,
      publicUrl: slug ? `https://${encodeURIComponent(slug)}.${BASE_DOMAIN}` : '',
    };
  }, [form.slug, t]);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiMode, setAiMode] = useState('select'); // 'select' | 'custom'
  const [aiTemplate, setAiTemplate] = useState('saas');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const [visualEditorOpen, setVisualEditorOpen] = useState(false);
  const [saveTemplateModalOpen, setSaveTemplateModalOpen] = useState(false);

  const [editorSplit, setEditorSplit] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const editorContainerRef = useRef(null);
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 1024
  );

  useEffect(() => {
    const handleViewportResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handleViewportResize);
    return () => window.removeEventListener('resize', handleViewportResize);
  }, []);

  const startResize = (event) => {
    event.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;
    const handleMove = (event) => {
      const container = editorContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const percent = (offsetX / rect.width) * 100;
      setEditorSplit(Math.min(75, Math.max(25, percent)));
    };
    const handleUp = () => setIsResizing(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isResizing]);

  useEffect(() => {
    if (!open) {
      setAiOpen(false);
      setAiPrompt('');
      setAiBusy(false);
      setAiMode('select');
      setAiTemplate('saas');
      setTemplateGalleryOpen(false);
      setVisualEditorOpen(false);
      setSaveTemplateModalOpen(false);
    }
  }, [open]);

  const runAiGenerate = async () => {
    const p = String(aiPrompt || '').trim();
    if (!p) {
      toast.error(t('landingPageEditor.enterDescription'));
      return;
    }
    setAiBusy(true);
    try {
      const res = await generateLandingHtmlWithAi({
        prompt: p,
        title: String(form.title || '').trim() || undefined,
      });
      if (!res?.success || !res?.data?.html) {
        throw new Error(res?.message || t('landingPageEditor.invalidResponse'));
      }
      let html = String(res.data.html);
      const nextTitle = String(res.data.title || '').trim();
      if (snippetContext.iframeBlock && html.includes(LP_FORM_MARKER)) {
        html = html.split(LP_FORM_MARKER).join(snippetContext.iframeBlock);
      } else if (snippetContext.iframeBlock && !html.includes(LP_FORM_MARKER)) {
        toast(t('landingPageEditor.noFormPosition'), { icon: 'ℹ️' });
      } else if (!snippetContext.iframeBlock) {
        toast(t('landingPageEditor.enterSlugForEmbed'), { icon: 'ℹ️' });
      }
      setForm((prev) => ({
        ...prev,
        htmlContent: html,
        ...(nextTitle ? { title: nextTitle } : {}),
      }));
      toast.success(t('landingPageEditor.htmlGenerated'));
      setAiOpen(false);
      setAiPrompt('');
      setAiMode('select');
      setAiTemplate('saas');
    } catch (e) {
      toast.error(getAiErrorMessage(e, t, 'landingPageEditor.htmlFailed'));
    } finally {
      setAiBusy(false);
    }
  };

  // Quick generate with template
  const runQuickAiGenerate = async () => {
    const template = AI_TEMPLATES[aiTemplate];
    if (!template) return;

    setAiBusy(true);
    try {
      const res = await generateLandingHtmlWithAi({
        prompt: template.prompt,
        title: String(form.title || '').trim() || undefined,
      });
      if (!res?.success || !res?.data?.html) {
        throw new Error(res?.message || t('landingPageEditor.invalidResponse'));
      }
      let html = String(res.data.html);
      const nextTitle = String(res.data.title || '').trim();
      if (snippetContext.iframeBlock && html.includes(LP_FORM_MARKER)) {
        html = html.split(LP_FORM_MARKER).join(snippetContext.iframeBlock);
      } else if (snippetContext.iframeBlock && !html.includes(LP_FORM_MARKER)) {
        toast(t('landingPageEditor.noFormPosition'), { icon: 'ℹ️' });
      } else if (!snippetContext.iframeBlock) {
        toast(t('landingPageEditor.enterSlugForEmbed'), { icon: 'ℹ️' });
      }
      setForm((prev) => ({
        ...prev,
        htmlContent: html,
        ...(nextTitle ? { title: nextTitle } : {}),
      }));
      toast.success(t('landingPageEditor.htmlGenerated'));
      setAiOpen(false);
      setAiPrompt('');
      setAiMode('select');
      setAiTemplate('saas');
    } catch (e) {
      toast.error(getAiErrorMessage(e, t, 'landingPageEditor.htmlFailed'));
    } finally {
      setAiBusy(false);
    }
  };

  const handleTemplateSelect = ({ template, html, cssVariables: _cssVariables, defaultConfig: _defaultConfig }) => {
    let finalHtml = html;
    if (!finalHtml.includes(LP_FORM_MARKER) && snippetContext?.iframeBlock) {
      finalHtml += `\n${LP_FORM_MARKER}`;
    }
    setForm((prev) => ({
      ...prev,
      htmlContent: finalHtml,
      templateId: template.id,
      templateName: template.name,
    }));
    toast.success(t('landingPageEditor.templateUsed'));
  };

  const handleVisualEditorSave = ({ html, data: _data }) => {
    let finalHtml = html;
    if (!finalHtml.includes(LP_FORM_MARKER) && snippetContext?.iframeBlock) {
      finalHtml += `\n${LP_FORM_MARKER}`;
    }
    setForm((prev) => ({
      ...prev,
      htmlContent: finalHtml,
    }));
    toast.success(t('landingPageEditor.visualSaved'));
    setVisualEditorOpen(false);
  };

  // Save current landing page as template - uses SaveTemplateModal instead
  const handleSaveAsTemplate = () => {
    if (!form.htmlContent || !form.htmlContent.trim()) {
      toast.error('Không có nội dung để lưu template');
      return;
    }
    setSaveTemplateModalOpen(true);
  };

  const copyText = async (label, text) => {
    if (!String(text || '').trim()) {
      toast.error(t('landingPageEditor.noContentToCopy'));
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('landingPageEditor.copied'));
    } catch {
      toast.error(t('landingPageEditor.copyFailed'));
    }
  };

  const [cdLoading, setCdLoading] = useState(false);
  const [cdBusy, setCdBusy] = useState(false);
  const [cdHostnameDraft, setCdHostnameDraft] = useState('');
  const [cdIsApexDomain, setCdIsApexDomain] = useState(false);
  const [cdInfo, setCdInfo] = useState(null);
  const [showCustomDomainFormForAutoPending, setShowCustomDomainFormForAutoPending] = useState(false);

  useEffect(() => {
    if (!open || !editingId) {
      setCdInfo(null);
      setCdHostnameDraft('');
      setCdIsApexDomain(false);
      setShowCustomDomainFormForAutoPending(false);
      return;
    }
    let cancelled = false;
    setCdLoading(true);
    fetchLandingCustomDomain(editingId)
      .then((res) => {
        if (cancelled || !res?.success) return;
        setCdInfo(res.data);
        setCdHostnameDraft(res.data?.hostname ? String(res.data.hostname) : '');
        setCdIsApexDomain(res.data?.isApexDomain === true);
        setShowCustomDomainFormForAutoPending(false);
      })
      .catch(() => {
        if (!cancelled) toast.error(t('landingPageEditor.loadDomainFailed'));
      })
      .finally(() => {
        if (!cancelled) setCdLoading(false);
      });
    return () => {
      cancelled = true;
    };

  }, [open, editingId]);

  const saveCustomDomainHostname = async () => {
    if (!editingId) return;
    const h = String(cdHostnameDraft || '').trim().toLowerCase();
    if (!h) {
      toast.error(t('landingPageEditor.hostnameFormat'));
      return;
    }
    setCdBusy(true);
    try {
      const res = await putLandingCustomDomain(editingId, h, cdIsApexDomain);
      if (!res?.success) throw new Error(res?.message || t('landingPageEditor.saveFailed'));
      setCdInfo(res.data);
      setShowCustomDomainFormForAutoPending(false);
      if (res.data.status === 'active') {
        toast.success(t('landingPageEditor.dnsSaved'));
      } else {
        // Thông báo rõ ràng về thời gian chờ DNS propagate
        const waitTime = cdIsApexDomain ? '5-30 phút' : '30 phút - 24 giờ';
        toast.success(
          `Đã thêm domain. DNS cần khoảng ${waitTime} để xác thực. Bạn có thể đóng trang này và quay lại sau.`
        );
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || t('landingPageEditor.saveDomainFailed'));
    } finally {
      setCdBusy(false);
    }
  };

  const _verifyCustomDomain = async () => {
    if (!editingId) return;
    setCdBusy(true);
    try {
      const res = await postLandingCustomDomainVerify(editingId);
      if (!res?.success) throw new Error(res?.message || t('landingPageEditor.verifyFailed'));
      setCdInfo(res.data);
      if (res.data.status === 'active') {
        toast.success(t('landingPageEditor.domainVerified'));
      } else {
        const isApex = res.data?.isApexDomain;
        const recordType = isApex ? 'A record' : 'CNAME record';
        toast.error(
          `${recordType} chưa đúng hoặc DNS chưa propagate. Vui lòng đợi khoảng 30 phút - 24 giờ rồi thử lại.`
        );
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || t('landingPageEditor.verifyFailed'));
    } finally {
      setCdBusy(false);
    }
  };

  // Tạo landing page mới + cấu hình custom domain ngay trong 1 lần submit.
  // Cần parent cung cấp onCreatePageWithCustomDomain(form, hostname, isApex)
  //  → trả về Promise<{ id: number, cdInfo: object }>
  const createPageWithCustomDomain = async () => {
    const h = String(cdHostnameDraft || '').trim().toLowerCase();
    if (!h) {
      toast.error(t('landingPageEditor.hostnameFormat'));
      return;
    }
    setCdBusy(true);
    try {
      const result = await onCreatePageWithCustomDomain(
        {
          title: form.title || h,
          slug: form.slug || '',
          htmlContent: form.htmlContent || '',
          isPublished: Boolean(form.isPublished),
          leadFormConfig: form.leadFormConfig,
          leadFormPersistedMeta: form.leadFormPersistedMeta,
        },
        h,
        cdIsApexDomain
      );
      setCdInfo(result?.cdInfo ?? null);
      setShowCustomDomainFormForAutoPending(false);
      toast.success(
        cdIsApexDomain
          ? 'Đã tạo landing + cấu hình apex domain. DNS cần khoảng 5-30 phút để xác thực.'
          : 'Đã tạo landing + cấu hình subdomain. DNS cần khoảng 30 phút - 24 giờ để xác thực.'
      );
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || 'Không tạo được landing page');
    } finally {
      setCdBusy(false);
    }
  };

  const verifyCustomDomain = useDebouncedCallback(_verifyCustomDomain, 1000);

  const removeCustomDomain = async () => {
    if (!editingId) return;
    if (!window.confirm(t('landingPageEditor.confirmRemoveDomain'))) return;
    setCdBusy(true);
    try {
      const res = await deleteLandingCustomDomain(editingId);
      if (!res?.success) throw new Error(res?.message || t('landingPageEditor.deleteFailed'));
      setCdInfo({ configured: false, instructions: null, record: null });
      setCdHostnameDraft('');
      toast.success(t('landingPageEditor.domainRemoved'));
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || t('landingPageEditor.deleteDomainFailed'));
    } finally {
      setCdBusy(false);
    }
  };

  const provisionSsl = async () => {
    if (!editingId) return;
    setCdBusy(true);
    try {
      const res = await postLandingCustomDomainProvisionSsl(editingId);
      if (!res?.success) throw new Error(res?.message || 'Cấp SSL thất bại');
      toast.success('Đã gửi yêu cầu cấp SSL. Vui lòng chờ vài phút và làm mới trang.');
      setCdInfo((prev) => ({ ...prev, sslStatus: 'pending' }));
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || 'Cấp SSL thất bại');
    } finally {
      setCdBusy(false);
    }
  };

  /**
   * Đổi subdomain miễn phí từ trong card (không cần bấm Lưu ở trên cùng).
   * Gọi PUT /admin/landing-pages/:id với body { slug }.
   * Server sẽ xóa CF subdomain cũ và cấp subdomain mới.
   */
  const applySystemSubdomain = async () => {
    if (!editingId) return;
    let newSlug = String(form.slug || '').trim().toLowerCase().replace(/^\/+/, '');
    if (!newSlug) {
      // Tự sinh từ hostname đang có (vd: lp.mybrand.founderai.biz → lp-mybrand) hoặc từ id.
      const fromHost = (cdInfo?.hostname || '').split('.')[0];
      newSlug = fromHost && fromHost !== 'www'
        ? fromHost.replace(/[^a-z0-9_-]/gi, '')
        : `lp${editingId}`;
    }
    if (!newSlug) {
      toast.error('Không thể sinh slug tự động. Vui lòng nhập slug ở ô bên trên.');
      return;
    }
    setForm((p) => ({ ...p, slug: newSlug }));
    setCdBusy(true);
    try {
      const res = await updateLandingPageAdmin(editingId, {
        slug: newSlug,
        domainType: 'system',
        domainSubtype: 'subdomain',
      });
      if (!res?.success) throw new Error(res?.message || 'Không đổi được subdomain');
      setCdInfo((prev) => ({ ...(prev || {}), hostname: `${newSlug}.${BASE_DOMAIN}`, configured: true, status: 'active', cfManaged: true }));
      toast.success(`Đã cấp lại subdomain ${newSlug}.${BASE_DOMAIN}`);
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || 'Không đổi được subdomain');
    } finally {
      setCdBusy(false);
    }
  };

  if (!open) return null;

  const slug = String(form.slug || '').trim().toLowerCase();
  const isCfManagedDomain = Boolean(cdInfo?.cfManaged);
  const isAutoSubdomainPending = Boolean(
    cdInfo?.configured
    && cdInfo?.status === 'pending_verification'
    && isCfManagedDomain
  );
  const showCustomDomainForm = !isAutoSubdomainPending || showCustomDomainFormForAutoPending;
  // Khi page đang dùng subdomain miễn phí (cfManaged=true), KHÔNG ép buộc tab Custom tắt.
  // User phải có khả năng bấm sang tab Custom để cấu hình domain mới.
  const isCustomDomainMode = form.domainType === 'custom';
  const headerDomain = (() => {
    if (isCustomDomainMode && cdInfo?.configured && cdInfo?.hostname) {
      return cdInfo.hostname;
    }
    if (!slug) return null;
    if (isCustomDomainMode) return cdHostnameDraft?.trim() || slug;
    return `${slug}.${BASE_DOMAIN}`;
  })();
  const publicUrl = isCustomDomainMode
    ? (slug ? `https://${slug}` : '')
    : (slug ? `https://${slug}.${BASE_DOMAIN}` : '');

  const overlay = (
    <div
      className="absolute inset-0 z-30 flex flex-col bg-white rounded-2xl overflow-hidden"
      data-testid="landing-page-full-editor"
    >
      <header className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-3">
          <HiOutlineGlobeAlt className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            {editingId ? t('landingPageEditor.editLanding') : t('landingPageEditor.createLanding')}
          </h2>
          {headerDomain && (
            <code className="text-sm bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-mono">
              {headerDomain}
            </code>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {publicUrl && (
            <>
              <button
                type="button"
                onClick={() => copyText('URL', publicUrl)}
                className="p-2 rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                title="Copy URL"
              >
                <HiOutlineClipboard className="w-4 h-4" />
              </button>
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded text-gray-500 hover:bg-gray-100 hover:text-blue-600 transition-colors"
                title="Mở trong tab mới"
              >
                <HiOutlineExternalLink className="w-4 h-4" />
              </a>
            </>
          )}
          <button
            type="button"
            className="btn btn-secondary text-sm flex items-center gap-1.5"
            onClick={() => setVisualEditorOpen(true)}
            title={t('landingPageEditor.visualEditor')}
          >
            <HiOutlineViewGrid className="w-4 h-4" />
            {t('landingPageEditor.visualEditor')}
          </button>
          <button
            type="button"
            onClick={handleSaveAsTemplate}
            className="btn btn-secondary text-sm flex items-center gap-1.5"
            title="Lưu thành template"
          >
            <HiOutlineTemplate className="w-4 h-4" />
            Lưu template
          </button>
          <button
            type="button"
            onClick={() => setTemplateGalleryOpen(true)}
            className="btn btn-secondary text-sm flex items-center gap-1.5"
            title={t('landingPageEditor.selectTemplate')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            Template
          </button>
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            className="btn btn-secondary text-sm flex items-center gap-1.5"
            title={t('landingPageEditor.generateWithAI')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>{t('landingPageEditor.aiGenerate')}</span>
          </button>
          <button type="button" className="btn btn-secondary text-sm" onClick={onClose}>
            {t('common.close')}
          </button>
          <button type="button" className="btn btn-primary text-sm" onClick={onSave} disabled={saving}>
            {saving ? t('landingPageEditor.saving') : t('landingPageEditor.save')}
          </button>
        </div>
      </header>

      <div ref={editorContainerRef} className="flex flex-1 min-h-0 flex-col lg:flex-row">
        <section
          className="flex flex-col min-h-[40vh] lg:min-h-0 lg:min-w-[280px] lg:border-r border-gray-200 overflow-hidden"
          style={isDesktop ? { width: `${editorSplit}%` } : undefined}
        >
          <div className="shrink-0 p-4 space-y-3 border-b border-gray-100 bg-white overflow-y-auto max-h-[55vh] lg:max-h-[55%]">

            {/* Basic Info - Title. Slug (subdomain miễn phí) sẽ hiển thị và chỉnh được ngay trong card Custom Domain. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('landingPageEditor.pageTitle')}</label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder={t('landingPageEditor.pageTitlePlaceholder')}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={Boolean(form.isPublished)}
                onChange={(e) => setForm((p) => ({ ...p, isPublished: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600"
              />
              {t('landingPageEditor.publish')}
            </label>

            <SectionCard title={t('leadFormConfig.title')} icon={HiOutlinePencilAlt} defaultOpen={false}>
              <LeadFormConfigPanel form={form} setForm={setForm} t={t} />
            </SectionCard>

            {/* Custom Domain Section */}
            <SectionCard title="Custom Domain" icon={HiOutlineGlobeAlt} defaultOpen={true}>
              <div className="space-y-4">
                {cdLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
                  </div>
                ) : (
                  <>
                    {/* Tab chuyển đổi nhanh: Subdomain miễn phí ↔ Tên miền riêng */}
                    <DomainSourceSwitch
                      value={isCustomDomainMode ? 'custom' : 'system'}
                      disabled={cdBusy}
                      onChange={(next) => {
                        if (next === 'custom' && !isCustomDomainMode) {
                          setCdHostnameDraft('');
                          setCdIsApexDomain(false);
                          setForm((p) => ({ ...p, domainType: 'custom', domainSubtype: 'subdomain' }));
                        } else if (next === 'system' && isCustomDomainMode) {
                          setCdHostnameDraft('');
                          setForm((p) => ({ ...p, domainType: 'system', domainSubtype: 'subdomain' }));
                        }
                      }}
                    />

                    {/* === SUBDOMAIN MIỄN PHÍ (chế độ system) === */}
                    {!isCustomDomainMode && (
                      <SubdomainCard
                        slug={form.slug || ''}
                        originalSlug={form.slug || ''}
                        activeHostname={cdInfo?.hostname}
                        isActive={Boolean(cdInfo?.configured && cdInfo?.status === 'active' && isCfManagedDomain)}
                        isPending={isAutoSubdomainPending}
                        isLoading={false}
                        busy={cdBusy}
                        onChangeSlug={(v) => setForm((p) => ({ ...p, slug: v }))}
                        onApply={applySystemSubdomain}
                        onRetry={verifyCustomDomain}
                      />
                    )}

                    {/* === TÊN MIỀN RIÊNG (chế độ custom) === */}
                    {isCustomDomainMode && (
                      <CustomDomainCard
                        cdInfo={cdInfo}
                        hostnameDraft={cdHostnameDraft}
                        onChangeHostnameDraft={setCdHostnameDraft}
                        isApexDomain={cdIsApexDomain}
                        onToggleApex={setCdIsApexDomain}
                        busy={cdBusy}
                        onSave={editingId ? saveCustomDomainHostname : createPageWithCustomDomain}
                        onVerify={verifyCustomDomain}
                        onProvisionSsl={provisionSsl}
                        onRemove={removeCustomDomain}
                        pendingCreate={!editingId}
                        onUseSystem={() => {
                          setCdHostnameDraft('');
                          setForm((p) => ({ ...p, domainType: 'system', domainSubtype: 'subdomain' }));
                        }}
                      />
                    )}
                  </>
                )}
              </div>
            </SectionCard>

            {/* LP Track Snippets */}
            <SectionCard title="Mã nhúng & Tracking" icon={HiOutlineCode} defaultOpen={false}>
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  {t('landingPageEditor.whenSave')}: {t('landingPageEditor.saveDescription')}
                </p>

                {!snippetContext.combined ? (
                  <div className="flex items-center justify-center py-8 text-sm text-gray-400">
                    <HiOutlineCode className="w-5 h-5 mr-2" />
                    {t('landingPageEditor.enterSlugToSeeCode')}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* URL Preview */}
                    <div className="p-3 bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg border border-orange-100">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-xs font-medium text-orange-700">{t('landingPageEditor.landingUrl')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs font-mono text-gray-700 truncate">
                          {snippetContext.publicUrl}
                        </code>
                        <button
                          type="button"
                          className="flex-shrink-0 px-2 py-1 text-xs bg-white hover:bg-orange-100 text-orange-600 rounded border border-orange-200 transition-colors"
                          onClick={() => copyText('URL', snippetContext.publicUrl)}
                        >
                          Copy URL
                        </button>
                      </div>
                    </div>

                    {/* Embed Code Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Iframe Form */}
                      <div className="rounded-lg border border-gray-200 overflow-hidden">
                        <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
                              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                              </svg>
                            </div>
                            <div>
                              <span className="text-sm font-medium text-gray-800">{t('landingPageEditor.iframeFormLabel')}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="px-2.5 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center gap-1"
                            onClick={() => copyText('iframe form', snippetContext.iframeBlock)}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Copy
                          </button>
                        </div>
                        <div className="p-3 bg-[#1e1e1e]">
                          <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap break-all leading-relaxed">
                            {snippetContext.iframeBlock}
                          </pre>
                        </div>
                      </div>

                      {/* Tracking Script */}
                      <div className="rounded-lg border border-gray-200 overflow-hidden">
                        <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-purple-100 rounded-lg flex items-center justify-center">
                              <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                              </svg>
                            </div>
                            <div>
                              <span className="text-sm font-medium text-gray-800">{t('landingPageEditor.trackingScriptLabel')}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="px-2.5 py-1 text-xs font-medium bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors flex items-center gap-1"
                            onClick={() => copyText('script tracking', snippetContext.scriptBlock)}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Copy
                          </button>
                        </div>
                        <div className="p-3 bg-[#1e1e1e]">
                          <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap break-all leading-relaxed">
                            {snippetContext.scriptBlock}
                          </pre>
                        </div>
                      </div>
                    </div>

                    {/* Copy Both Button */}
                    <button
                      type="button"
                      className="w-full py-2.5 px-4 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm"
                      onClick={() => copyText('cả hai khối', snippetContext.combined)}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      {t('landingPageEditor.copyBothBlocks')}
                    </button>
                  </div>
                )}
              </div>
            </SectionCard>
          </div>

          {/* HTML Editor */}
          <div className="flex-1 flex flex-col min-h-0 p-4 bg-white">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <label className="block text-sm font-medium text-gray-700">
                HTML Content
              </label>
            </div>
            <textarea
              className="flex-1 w-full min-h-[200px] rounded-lg border border-gray-300 px-3 py-2 text-xs font-mono resize-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              value={form.htmlContent}
              onChange={(e) => setForm((p) => ({ ...p, htmlContent: e.target.value }))}
              placeholder={t('landingPageEditor.htmlPlaceholder')}
              spellCheck={false}
            />
          </div>
        </section>

        <div
          onMouseDown={startResize}
          className="hidden lg:block w-2 cursor-col-resize bg-gray-100 hover:bg-gray-200 border-l border-r border-gray-200"
        />

        <section
          className="flex flex-col min-h-[40vh] lg:min-h-0 lg:min-w-[280px] bg-gray-50 border-t lg:border-t-0 border-gray-200"
          style={isDesktop ? { width: `${100 - editorSplit}%` } : undefined}
        >
          <div className="shrink-0 px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-200 bg-gray-100 flex items-center justify-between">
            <span>{t('landingPageEditor.preview')}</span>
            <div className="flex items-center gap-2">
              {slug && (
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-blue-600 hover:underline"
                >
                  <HiOutlineExternalLink className="w-3 h-3" />
                  Mở trong tab mới
                </a>
              )}

            </div>
          </div>
          <iframe
            title={t('landingPageEditor.landingPreview')}
            className="flex-1 w-full min-h-0 border-0 bg-white"
            sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
            srcDoc={
              previewSrcDoc ||
              `<!DOCTYPE html><html><body><p class="p-4 text-gray-500 text-sm text-center">${t('landingPageEditor.enterSlugHtmlToPreview')}</p></body></html>`
            }
          />
        </section>
      </div>
    </div>
  );

  // AI Modal Overlay
  const aiOverlay =
    aiOpen &&
    createPortal(
      <div
        className="fixed inset-0 z-[45] flex items-center justify-center p-4 bg-black/40"
        role="dialog"
        aria-modal="true"
        onClick={() => !aiBusy && setAiOpen(false)}
      >
        <div
          className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Tạo landing page với AI</h3>
                <p className="text-sm text-gray-500">Chọn loại hoặc nhập mô tả tùy chỉnh</p>
              </div>
            </div>
            <button
              onClick={() => !aiBusy && setAiOpen(false)}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <HiOutlineX className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Modal Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Mode Tabs */}
            <div className="flex items-center gap-1 mb-6 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setAiMode('select')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  aiMode === 'select'
                    ? 'bg-white shadow text-orange-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <HiOutlineTemplate className="w-4 h-4" />
                Chọn mẫu có sẵn
              </button>
              <button
                onClick={() => setAiMode('custom')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  aiMode === 'custom'
                    ? 'bg-white shadow text-orange-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Mô tả tùy chỉnh
              </button>
            </div>

            {aiMode === 'select' ? (
              <>
                {/* Template Selection */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Chọn loại sản phẩm/dịch vụ
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.entries(AI_TEMPLATES).map(([key, template]) => (
                      <button
                        key={key}
                        onClick={() => setAiTemplate(key)}
                        className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                          aiTemplate === key
                            ? 'border-orange-500 bg-orange-50 shadow-md'
                            : 'border-gray-200 bg-white hover:border-orange-300 hover:bg-orange-50/50'
                        }`}
                      >
                        <span className="text-2xl">{template.icon}</span>
                        <span className="text-sm font-medium text-gray-700 text-left">{template.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Template Preview */}
                <div className="bg-orange-50 rounded-xl p-4 border border-orange-100">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    <h4 className="text-sm font-medium text-orange-700">AI sẽ tạo:</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center text-orange-600">1</span>
                      Hero Section với headline
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center text-orange-600">2</span>
                      Tính năng 3 cột
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center text-orange-600">3</span>
                      Testimonials
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center text-orange-600">4</span>
                      FAQ
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center text-orange-600">5</span>
                      Form đăng ký
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center text-orange-600">6</span>
                      Footer
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Custom Prompt */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mô tả landing page bạn muốn tạo
                  </label>
                  <textarea
                    className="w-full min-h-[160px] rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none"
                    placeholder={`Ví dụ: Tạo landing page cho một ứng dụng học tiếng Anh online với tone trẻ trung, năng động. Bao gồm section giới thiệu ứng dụng, các tính năng nổi bật, đánh giá từ người dùng, và form đăng ký dùng thử miễn phí.`}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    disabled={aiBusy}
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    Mô tả càng chi tiết, kết quả càng chính xác
                  </p>
                </div>

                {/* Quick Templates */}
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Hoặc chọn nhanh:</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(AI_TEMPLATES).map(([key, template]) => (
                      <button
                        key={key}
                        onClick={() => setAiPrompt(template.prompt)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-orange-50 text-gray-600 hover:text-orange-600 rounded-lg text-xs font-medium border border-gray-200 hover:border-orange-200 transition-colors"
                      >
                        <span>{template.icon}</span>
                        {template.name}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Modal Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
            <button
              type="button"
              className="btn btn-secondary text-sm"
              onClick={() => !aiBusy && setAiOpen(false)}
              disabled={aiBusy}
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={aiMode === 'select' ? runQuickAiGenerate : runAiGenerate}
              disabled={aiBusy || (aiMode === 'custom' && !aiPrompt.trim())}
              className="btn btn-primary text-sm flex items-center gap-2"
            >
              {aiBusy ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Đang tạo...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  {aiMode === 'select' ? 'Tạo nhanh' : 'Tạo với AI'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>,
      document.body
    );

  return (
    <>
      {overlay}
      {aiOverlay}

      {/* Template Gallery Modal */}
      <TemplateGallery
        isOpen={templateGalleryOpen}
        onClose={() => setTemplateGalleryOpen(false)}
        onSelect={handleTemplateSelect}
        onGenerateWithAi={() => {
          setTemplateGalleryOpen(false);
          setAiOpen(true);
        }}
      />

      {/* Visual Block Editor Modal */}
      <VisualBlockEditor
        isOpen={visualEditorOpen}
        initialHtml={form.htmlContent}
        initialData={{}}
        onSave={handleVisualEditorSave}
        onClose={() => setVisualEditorOpen(false)}
        onSaveAsTemplate={handleSaveAsTemplate}
      />

      {/* Save Template Modal */}
      <SaveTemplateModal
        isOpen={saveTemplateModalOpen}
        onClose={() => setSaveTemplateModalOpen(false)}
        htmlContent={form.htmlContent}
        landingPageTitle={form.title}
        onSuccess={() => {
          // Refresh template list if template gallery is open
        }}
      />
    </>
  );
}
