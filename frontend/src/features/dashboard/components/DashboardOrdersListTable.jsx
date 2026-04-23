import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import customerApiService from '../../customers/services/customerApi.service';
import {
  decodeHtmlEntities,
  formatDateOnly,
  formatDateTime,
  getCustomerDisplayName,
} from '../../customers/utils/customerDisplay.helpers';
import { formatEventType, normalizeJourneyDescription } from '../../customers/utils/customerJourney.helpers';

// ─── Formatters ───────────────────────────────────────────────────────────────

const formatNumber = (value) => Number(value || 0).toLocaleString('vi-VN');

const formatCurrency = (amount, currency = 'VND') => {
  const num = Number(amount || 0);
  if (currency === 'VND') return `${num.toLocaleString('vi-VN')}đ`;
  return `${num.toLocaleString('vi-VN')} ${currency}`;
};

// ─── Config maps ──────────────────────────────────────────────────────────────

const ORDER_STATUS_CONFIG = {
  pending: { cls: 'bg-orange-100 text-orange-700', label: 'Đơn chờ' },
  completed: { cls: 'bg-green-100 text-green-700', label: 'Đã hoàn thành' },
  other: { cls: 'bg-gray-100 text-gray-500', label: 'Khác' },
};

const CHANNEL_CONFIG = {
  email: { cls: 'bg-sky-100 text-sky-700', label: 'Email' },
  zalo: { cls: 'bg-blue-100 text-blue-700', label: 'Zalo' },
  zalo_group: { cls: 'bg-purple-100 text-purple-700', label: 'Zalo Group' },
};

const getOrderStatusCfg = (group) =>
  ORDER_STATUS_CONFIG[group] || ORDER_STATUS_CONFIG.other;

/**
 * Chuẩn hóa key kênh để dùng chung cho hiển thị và bộ lọc.
 * Hỗ trợ các biến thể chuỗi thường gặp để tránh lệch dữ liệu.
 *
 * @param {string|null|undefined} value
 * @returns {'email'|'zalo'|'zalo_group'|''}
 */
const normalizeChannelKey = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'zalo_group' || raw === 'zalo-group' || raw === 'zalo group') return 'zalo_group';
  if (raw.includes('zalo_group') || raw.includes('zalo-group')) return 'zalo_group';
  if (raw.includes('email')) return 'email';
  if (raw.includes('zalo')) return 'zalo';
  return raw;
};

const getChannelCfg = (type) =>
  CHANNEL_CONFIG[normalizeChannelKey(type)] || { cls: 'bg-gray-100 text-gray-700', label: type || '—' };

// ─── Journey event icon ───────────────────────────────────────────────────────

const JourneyEventIcon = ({ eventType }) => {
  const type = String(eventType || '').toLowerCase();
  if (type === 'email_opened' || type === 'email_sent')
    return (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    );
  if (type === 'email_clicked' || type === 'zalo_clicked')
    return (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
      </svg>
    );
  if (type === 'attachment_downloaded')
    return (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
  if (type === 'course_purchase' || type === 'order_completed')
    return (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  if (type === 'course_interest' || type === 'order_pending')
    return (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
};

const journeyEventColor = (eventType) => {
  const type = String(eventType || '').toLowerCase();
  if (type === 'email_sent' || type === 'zalo_sent') return 'bg-sky-100 text-sky-600';
  if (type === 'email_opened') return 'bg-blue-100 text-blue-600';
  if (type === 'email_clicked' || type === 'zalo_clicked') return 'bg-indigo-100 text-indigo-600';
  if (type === 'attachment_downloaded') return 'bg-yellow-100 text-yellow-600';
  if (type === 'course_interest' || type === 'order_pending') return 'bg-orange-100 text-orange-600';
  if (type === 'course_purchase' || type === 'order_completed') return 'bg-green-100 text-green-600';
  return 'bg-gray-100 text-gray-500';
};

const normalizeTextForMatch = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const normalizeOrderReference = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  return raw.replace(/^#/, '');
};

const extractOrderReferenceFromEventData = (eventData) => {
  if (!eventData || typeof eventData !== 'object') return '';
  return normalizeOrderReference(
    eventData.orderId
    || eventData.order_id
    || eventData.orderRef
    || eventData.order_ref
    || eventData.orderNumber
    || eventData.order_number
  );
};

/**
 * Chuẩn hóa label nguồn của sự kiện hành trình để người dùng biết
 * hành động xuất phát từ email nào hoặc tin nhắn Zalo nào.
 *
 * Luồng hoạt động:
 * 1. Ưu tiên nhận diện theo eventType (email_* hoặc zalo_*).
 * 2. Tìm thông tin chi tiết từ map email/zalo theo message ID.
 * 3. Fallback về ID khi thiếu subject/template/recipient.
 *
 * @param {object} params
 * @param {string} params.eventType
 * @param {number|string|null|undefined} params.idEmailMessage
 * @param {number|string|null|undefined} params.idZaloMessage
 * @param {object} params.eventData
 * @param {string|null|undefined} params.eventAt
 * @param {Map<number, object>} params.emailById
 * @param {Array<object>} params.emailList
 * @param {Map<number, object>} params.zaloById
 * @returns {string|null}
 */
const buildJourneySourceLabel = ({
  eventType,
  idEmailMessage,
  idZaloMessage,
  eventData,
  eventAt,
  emailById,
  emailList,
  zaloById,
}) => {
  const emailMessageId = Number.parseInt(idEmailMessage, 10);
  const zaloMessageId = Number.parseInt(idZaloMessage, 10);
  const hasEmailId = Number.isFinite(emailMessageId);
  const hasZaloId = Number.isFinite(zaloMessageId);
  const loweredType = String(eventType || '').toLowerCase();
  const data = eventData && typeof eventData === 'object' ? eventData : {};

  const parseIntSafe = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const candidateZaloMessageId = parseIntSafe(
    data.idZaloMessage
    || data.zaloMessageId
    || data.id_zalo_message
    || data.zalo_message_id
    || idZaloMessage
  );

  /**
   * Suy luận email nguồn cho sự kiện theo thứ tự:
   * 1) ID email trong root/eventData.
   * 2) subject/template trong eventData.
   * 3) Email được gửi gần nhất trước thời điểm sự kiện.
   */
  const resolveEmail = () => {
    const candidateEmailId = parseIntSafe(
      data.idEmailMessage
      || data.emailMessageId
      || data.id_email_message
      || data.email_message_id
    );
    const selectedEmailById = emailById.get(candidateEmailId || emailMessageId);
    if (selectedEmailById) return selectedEmailById;

    const subjectHint = normalizeTextForMatch(
      data.subject || data.emailSubject || data.email_template_name || data.templateName
    );
    if (subjectHint) {
      const bySubject = (emailList || []).find((emailItem) => {
        const emailSubject = normalizeTextForMatch(emailItem?.subject);
        const emailTemplateName = normalizeTextForMatch(emailItem?.emailTemplateName);
        return (
          (emailSubject && (emailSubject.includes(subjectHint) || subjectHint.includes(emailSubject)))
          || (emailTemplateName
            && (emailTemplateName.includes(subjectHint) || subjectHint.includes(emailTemplateName)))
        );
      });
      if (bySubject) return bySubject;
    }

    if (!eventAt) return null;
    const eventAtTime = new Date(eventAt).getTime();
    if (Number.isNaN(eventAtTime)) return null;
    const candidates = (emailList || [])
      .filter((emailItem) => emailItem?.sentAt)
      .map((emailItem) => ({ emailItem, sentAtTime: new Date(emailItem.sentAt).getTime() }))
      .filter((item) => Number.isFinite(item.sentAtTime) && item.sentAtTime <= eventAtTime)
      .sort((a, b) => b.sentAtTime - a.sentAtTime);
    return candidates[0]?.emailItem || null;
  };

  const email = resolveEmail();
  const resolvedZaloMessageId = candidateZaloMessageId || (hasZaloId ? zaloMessageId : null);
  const zaloMessage = Number.isFinite(resolvedZaloMessageId)
    ? zaloById.get(resolvedZaloMessageId)
    : null;

  const buildEmailLabel = () => {
    const resolvedEmailId = Number.parseInt(email?.emailMessageId, 10);
    const subject = decodeHtmlEntities(String(email?.subject || '').trim());
    const templateName = decodeHtmlEntities(String(email?.emailTemplateName || '').trim());
    const fallbackTitle = subject || templateName;
    if (fallbackTitle) return `Email: ${fallbackTitle}`;
    if (Number.isFinite(emailMessageId)) return `Email ID #${emailMessageId}`;
    if (Number.isFinite(resolvedEmailId)) return `Email ID #${resolvedEmailId}`;
    return 'Email chưa xác định';
  };

  const buildZaloLabel = () => {
    const channel = String(zaloMessage?.channel || '').toLowerCase();
    const recipient = String(
      channel === 'zalo_group'
        ? (zaloMessage?.groupName || zaloMessage?.groupId || zaloMessage?.recipientValue || '')
        : (zaloMessage?.recipientValue || zaloMessage?.accountName || '')
    ).trim();
    const sentLabel = zaloMessage?.sentAt ? formatDateTime(zaloMessage.sentAt) : null;
    if (channel === 'zalo_group') {
      const groupLabel = recipient || `Nhóm #${zaloMessage?.groupId || '--'}`;
      if (sentLabel && sentLabel !== '—') return `Zalo Group: ${groupLabel} (gửi lúc ${sentLabel})`;
      return `Zalo Group: ${groupLabel}`;
    }
    if (recipient) {
      if (sentLabel && sentLabel !== '—') return `Zalo: ${recipient} (gửi lúc ${sentLabel})`;
      return `Zalo: ${recipient}`;
    }
    if (Number.isFinite(resolvedZaloMessageId)) {
      if (sentLabel && sentLabel !== '—') {
        return `Tin nhắn Zalo ID #${resolvedZaloMessageId} (gửi lúc ${sentLabel})`;
      }
      return `Tin nhắn Zalo ID #${resolvedZaloMessageId}`;
    }
    return null;
  };

  if (loweredType.startsWith('email_')) return buildEmailLabel();
  if (loweredType.startsWith('zalo_') && hasZaloId) return buildZaloLabel();

  if (hasEmailId || email) return buildEmailLabel();
  if (hasZaloId) return buildZaloLabel();
  return null;
};

// ─── Order detail drawer ──────────────────────────────────────────────────────

/**
 * Slide-over panel showing full details of a selected order.
 * Fetches fresh customer info + campaign journey when opened.
 *
 * @param {object} props
 * @param {object|null} props.order - selected order item
 * @param {function} props.onClose
 * @param {function} props.onNavigateCustomer - (campaignId, customerId) => void
 */
const OrderDetailDrawer = ({ order, onClose, onNavigateCustomer }) => {
  const [customer, setCustomer] = useState(null);
  const [journey, setJourney] = useState(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!order) return;

    setCustomer(null);
    setJourney(null);

    if (!order.customerId) return;

    let cancelled = false;
    setIsLoadingDetail(true);

    const fetchAll = async () => {
      try {
        const promises = [customerApiService.getCustomerById(order.customerId)];
        if (order.campaignId) {
          promises.push(
            customerApiService.getCustomerCampaignJourney(order.customerId, order.campaignId)
          );
        }
        const [customerRes, journeyRes] = await Promise.all(promises);
        if (cancelled) return;
        setCustomer(customerRes?.data?.data || null);
        if (journeyRes) setJourney(journeyRes?.data?.data || null);
      } catch {
        // non-critical: silently skip
      } finally {
        if (!cancelled) setIsLoadingDetail(false);
      }
    };

    fetchAll();
    abortRef.current = () => { cancelled = true; };
    return () => { cancelled = true; };
  }, [order?.customerId, order?.campaignId]);

  if (!order) return null;

  const statusCfg = getOrderStatusCfg(order.statusGroup);
  const channelCfg = getChannelCfg(order.campaignType);

  const displayName = customer
    ? (getCustomerDisplayName(customer) || `Khách hàng #${order.customerId}`)
    : (order.customerName || `Khách hàng #${order.customerId || '?'}`);

  const customerEmail = customer?.email || order.customerEmail;
  const customerPhone = customer?.phone || order.customerPhone;
  const customerZaloId = customer?.zaloId || order.customerZaloId;

  // Build journey timeline filtered to only events belonging to order.runId
  const journeyTimeline = useMemo(() => {
    if (!journey) return [];
    const targetRunId = order?.runId ? Number(order.runId) : null;
    const targetOrderKey = normalizeOrderReference(order?.orderRef || order?.orderId);
    const emailById = new Map(
      (journey.emails || [])
        .map((emailItem) => [Number.parseInt(emailItem?.emailMessageId, 10), emailItem])
        .filter(([id]) => Number.isFinite(id))
    );
    const emailList = Array.isArray(journey.emails) ? journey.emails : [];
    const zaloById = new Map(
      (journey.zaloMessages || [])
        .map((zaloItem) => [Number.parseInt(zaloItem?.id, 10), zaloItem])
        .filter(([id]) => Number.isFinite(id))
    );

    const matchesRun = (runId) => {
      if (!targetRunId) return true; // no runId on order → show all
      return Number(runId) === targetRunId;
    };

    const matchesOrder = (value) => {
      const normalized = normalizeOrderReference(value);
      if (!targetOrderKey || !normalized) return false;
      return normalized === targetOrderKey;
    };

    const parseIntSafe = (value) => {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const allRunPurchases = (journey.purchases || []).filter((p) => matchesRun(p.runId));
    const relatedPurchases = allRunPurchases.filter((purchase) => matchesOrder(purchase.orderId));

    /**
     * Chỉ giữ message ID gắn trực tiếp với đơn đang xem:
     * - Từ purchase khớp orderId.
     * - Từ event order_* có cùng orderId (nếu có).
     */
    const relatedEmailMessageIds = new Set(
      relatedPurchases
        .map((purchase) => parseIntSafe(purchase.idEmailMessage))
        .filter((id) => Number.isFinite(id))
    );
    const relatedZaloMessageIds = new Set(
      relatedPurchases
        .map((purchase) => parseIntSafe(purchase.idZaloMessage))
        .filter((id) => Number.isFinite(id))
    );

    const runEvents = (journey.journey || []).filter((eventItem) => matchesRun(eventItem.runId));
    runEvents.forEach((eventItem) => {
      const eventOrderKey = extractOrderReferenceFromEventData(eventItem.eventData);
      if (!matchesOrder(eventOrderKey)) return;
      const emailMessageId = parseIntSafe(eventItem.idEmailMessage);
      const zaloMessageId = parseIntSafe(eventItem.idZaloMessage);
      if (Number.isFinite(emailMessageId)) relatedEmailMessageIds.add(emailMessageId);
      if (Number.isFinite(zaloMessageId)) relatedZaloMessageIds.add(zaloMessageId);
    });

    const relatedEmailList = emailList.filter((emailItem) => {
      const emailId = parseIntSafe(emailItem?.emailMessageId);
      return Number.isFinite(emailId) && relatedEmailMessageIds.has(emailId);
    });

    const events = runEvents
      .filter((e) => {
        const emailMessageId = parseIntSafe(e.idEmailMessage);
        const zaloMessageId = parseIntSafe(e.idZaloMessage);
        const hasRelatedMessage =
          (Number.isFinite(emailMessageId) && relatedEmailMessageIds.has(emailMessageId))
          || (Number.isFinite(zaloMessageId) && relatedZaloMessageIds.has(zaloMessageId));
        const eventOrderKey = extractOrderReferenceFromEventData(e.eventData);
        const hasRelatedOrder = matchesOrder(eventOrderKey);
        return hasRelatedMessage || hasRelatedOrder;
      })
      .map((e) => ({
        id: `evt-${e.id}`,
        eventType: e.eventType,
        label: normalizeJourneyDescription(e),
        sourceLabel: buildJourneySourceLabel({
          eventType: e.eventType,
          idEmailMessage: e.idEmailMessage,
          idZaloMessage: e.idZaloMessage,
          eventData: e.eventData,
          eventAt: e.eventAt,
          emailById,
          emailList: relatedEmailList,
          zaloById,
        }),
        at: e.eventAt,
      }));

    const purchases = relatedPurchases
      .map((p) => ({
        id: `purchase-${p.id}`,
        eventType: p.itemStatus === 'interested' ? 'course_interest' : 'course_purchase',
        label:
          p.itemStatus === 'interested'
            ? `Để lại thông tin: ${p.courseName || p.productName || 'Khóa học'}`
            : `Mua hàng: ${p.courseName || p.productName || 'Khóa học'}`,
        sourceLabel: buildJourneySourceLabel({
          eventType: p.itemStatus === 'interested' ? 'order_pending' : 'order_completed',
          idEmailMessage: p.idEmailMessage,
          idZaloMessage: p.idZaloMessage,
          eventAt: p.purchaseDate,
          emailById,
          emailList: relatedEmailList,
          zaloById,
        }),
        at: p.purchaseDate,
      }));

    return [...events, ...purchases]
      .filter((e) => e.at)
      .sort((a, b) => new Date(a.at) - new Date(b.at));
  }, [journey, order?.runId, order?.orderId, order?.orderRef]);

  const DetailRow = ({ label, value, children }) => (
    <div className="flex flex-col gap-0.5 py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">{label}</span>
      {children ?? <span className="text-sm text-gray-800">{value || '—'}</span>}
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-full sm:w-[440px] bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/60 shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Chi tiết đơn hàng</h3>
            <p className="text-xs text-gray-400 mt-0.5">#{order.orderId}</p>
          </div>
          <button type="button" onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Status badges */}
          <div className="flex items-center gap-2">
            <span className={`badge text-xs px-2.5 py-1 ${statusCfg.cls}`}>{statusCfg.label}</span>
            <span className={`badge text-xs px-2.5 py-1 ${channelCfg.cls}`}>{channelCfg.label}</span>
          </div>

          {/* Sản phẩm */}
          <section>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Sản phẩm</p>
            <div className="bg-gray-50 rounded-xl px-4 divide-y divide-gray-100">
              <DetailRow label="Tên sản phẩm" value={order.productName} />
              {order.orderRef && <DetailRow label="Mã đơn hàng" value={order.orderRef} />}
              <DetailRow label="Số tiền">
                <span className="text-base font-semibold text-gray-900">
                  {formatCurrency(order.amount, order.currency)}
                </span>
              </DetailRow>
              {order.paymentMethod && <DetailRow label="Phương thức thanh toán" value={order.paymentMethod} />}
              <DetailRow label="Ngày đặt" value={formatDateOnly(order.orderDate)} />
            </div>
          </section>

          {/* Khách hàng */}
          <section>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Khách hàng</p>
            {isLoadingDetail && !customer ? (
              <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-2">
                {[60, 80, 50].map((w, i) => (
                  <div key={i} className="h-3 bg-gray-200 rounded animate-pulse" style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : (
              <div className="bg-gray-50 rounded-xl px-4 divide-y divide-gray-100">
                <DetailRow label="Tên" value={displayName} />
                <DetailRow label="Email" value={customerEmail} />
                <DetailRow label="Số điện thoại" value={customerPhone} />
                {customerZaloId && <DetailRow label="Zalo ID" value={customerZaloId} />}
                {customer?.customerSource && (
                  <DetailRow label="Nguồn khách hàng" value={customer.customerSource} />
                )}
              </div>
            )}
          </section>

          {/* Chiến dịch / Lượt chạy */}
          <section>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Nguồn</p>
            <div className="bg-gray-50 rounded-xl px-4 divide-y divide-gray-100">
              <DetailRow label="Chiến dịch" value={order.campaignName} />
              <DetailRow label="Lượt chạy" value={order.runName || 'Không có lượt chạy'} />
            </div>
          </section>

          {/* Hành trình khách hàng */}
          {order.customerId && order.campaignId && (
            <section>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Hành trình trong chiến dịch
              </p>

              {isLoadingDetail && !journey ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-6 h-6 bg-gray-200 rounded-full animate-pulse shrink-0 mt-0.5" />
                      <div className="flex-1 space-y-1.5 pt-0.5">
                        <div className="h-3 bg-gray-200 rounded animate-pulse w-3/4" />
                        <div className="h-2.5 bg-gray-100 rounded animate-pulse w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : journeyTimeline.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-gray-400">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <p className="text-xs">Chưa có sự kiện hành trình</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-[11px] top-2 bottom-2 w-px bg-gray-200" />
                  <div className="space-y-3">
                    {journeyTimeline.map((event) => (
                      <div key={event.id} className="flex items-start gap-3 relative">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 ${journeyEventColor(event.eventType)}`}>
                          <JourneyEventIcon eventType={event.eventType} />
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <p className="text-xs font-medium text-gray-800 leading-snug">{event.label}</p>
                          {event.sourceLabel && (
                            <p className="text-[11px] text-primary-600 mt-0.5">{event.sourceLabel}</p>
                          )}
                          <p className="text-[11px] text-gray-400 mt-0.5">{formatDateTime(event.at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        {/* Footer */}
        {order.customerId && order.campaignId && (
          <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/40 shrink-0">
            <button
              type="button"
              className="btn btn-primary w-full flex items-center justify-center gap-2 text-sm"
              onClick={() => onNavigateCustomer(order.campaignId, order.customerId)}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Xem hồ sơ khách hàng
            </button>
          </div>
        )}
      </div>
    </>
  );
};

// ─── Status filter tabs ───────────────────────────────────────────────────────

const STATUS_TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'pending', label: 'Đơn chờ', color: 'text-orange-600' },
  { key: 'completed', label: 'Đã hoàn thành', color: 'text-green-600' },
];

// ─── Skeleton & Empty ─────────────────────────────────────────────────────────

const SkeletonRow = () => (
  <tr>
    {Array.from({ length: 7 }).map((_, i) => (
      <td key={i} className="px-4 py-3 border-b border-gray-100">
        <div className="h-3.5 bg-gray-100 rounded animate-pulse" style={{ width: i === 0 ? '75%' : '55%' }} />
        {i === 0 && <div className="h-2.5 bg-gray-100 rounded animate-pulse mt-1.5 w-1/2" />}
      </td>
    ))}
  </tr>
);

const EmptyState = ({ hasFilter }) => (
  <tr>
    <td colSpan={7} className="py-16 text-center">
      <div className="flex flex-col items-center gap-3">
        <svg className="w-14 h-14 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
            d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
        <p className="text-sm font-medium text-gray-500">
          {hasFilter ? 'Không có đơn hàng khớp với bộ lọc' : 'Chưa có đơn hàng trong phạm vi đã chọn'}
        </p>
        <p className="text-xs text-gray-400">
          {hasFilter ? 'Thử thay đổi bộ lọc trạng thái hoặc kênh' : 'Điều chỉnh bộ lọc thời gian hoặc chiến dịch'}
        </p>
      </div>
    </td>
  </tr>
);

// ─── Sort icon ────────────────────────────────────────────────────────────────

const SortIcon = ({ column, sortConfig }) => {
  const isActive = sortConfig.key === column;
  return (
    <span className={`ml-1 inline-flex flex-col gap-[1px] ${isActive ? 'opacity-100' : 'opacity-30'}`}>
      <svg className={`w-2.5 h-2.5 ${isActive && sortConfig.direction === 'asc' ? 'text-primary-500' : 'text-gray-400'}`}
        viewBox="0 0 10 6" fill="currentColor"><path d="M5 0L10 6H0L5 0z" /></svg>
      <svg className={`w-2.5 h-2.5 ${isActive && sortConfig.direction === 'desc' ? 'text-primary-500' : 'text-gray-400'}`}
        viewBox="0 0 10 6" fill="currentColor"><path d="M5 6L0 0H10L5 6z" /></svg>
    </span>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * Table listing individual orders (customer_purchases) with run/campaign/channel info.
 *
 * Features:
 * - Status filter tabs: Tất cả / Đơn chờ / Đã hoàn thành
 * - Column filter for Kênh
 * - Text search by product name, campaign, run
 * - Client-side sort by date, amount, status
 * - Pagination (server-side)
 *
 * @param {object} props
 * @param {object} props.ordersData - { items, pagination }
 * @param {boolean} props.isLoadingOrders
 * @param {'all'|'pending'|'completed'} props.ordersStatusFilter
 * @param {function(number, string=): void} props.onChangePage - (page, statusOverride?)
 * @returns {JSX.Element}
 */
const DashboardOrdersListTable = ({
  ordersData,
  isLoadingOrders,
  ordersStatusFilter,
  onChangePage,
}) => {
  const navigate = useNavigate();
  const items = ordersData?.items || [];
  const pagination = ordersData?.pagination || { page: 1, totalPages: 1, total: 0 };

  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilters, setChannelFilters] = useState([]);
  const [statusFilters, setStatusFilters] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: 'orderDate', direction: 'desc' });
  const [channelDropOpen, setChannelDropOpen] = useState(false);
  const [statusDropOpen, setStatusDropOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Close filter dropdowns when clicking outside
  useEffect(() => {
    if (!channelDropOpen && !statusDropOpen) return;
    const handler = () => {
      setChannelDropOpen(false);
      setStatusDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [channelDropOpen, statusDropOpen]);

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const handleStatusTab = (key) => {
    setSearchQuery('');
    setChannelFilters([]);
    setStatusFilters([]);
    onChangePage(1, key);
  };

  const handleNavigateCustomer = (campaignId, customerId) => {
    navigate(`/customers/${campaignId}/${customerId}`);
  };

  const isAnyFilter = Boolean(searchQuery.trim()) || channelFilters.length > 0 || statusFilters.length > 0;

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let result = [...items];

    if (q) {
      result = result.filter(
        (item) =>
          (item.productName || '').toLowerCase().includes(q) ||
          (item.campaignName || '').toLowerCase().includes(q) ||
          (item.runName || '').toLowerCase().includes(q)
      );
    }

    if (channelFilters.length > 0) {
      result = result.filter((item) =>
        channelFilters.includes(normalizeChannelKey(item.campaignType))
      );
    }

    if (statusFilters.length > 0) {
      result = result.filter((item) =>
        statusFilters.includes(String(item.statusGroup || '').toLowerCase())
      );
    }

    return [...result].sort((a, b) => {
      const { key, direction } = sortConfig;
      let valA = a[key];
      let valB = b[key];

      if (key === 'orderDate') {
        valA = valA ? new Date(valA).getTime() : 0;
        valB = valB ? new Date(valB).getTime() : 0;
      } else {
        valA = Number(valA || 0);
        valB = Number(valB || 0);
      }

      return direction === 'asc' ? valA - valB : valB - valA;
    });
  }, [items, searchQuery, channelFilters, statusFilters, sortConfig]);

  // Sortable <th>
  const SortTh = ({ column, children, className = '' }) => (
    <th
      className={`px-4 py-3 text-left font-medium text-gray-500 bg-gray-50 border-b cursor-pointer select-none hover:bg-gray-100 transition-colors whitespace-nowrap ${className}`}
      onClick={() => handleSort(column)}
    >
      <span className="inline-flex items-center gap-0.5">
        {children}
        <SortIcon column={column} sortConfig={sortConfig} />
      </span>
    </th>
  );

  // Channel filter header
  const CHANNEL_OPTIONS = [
    { value: 'email', label: 'Email', badge: 'bg-sky-100 text-sky-700' },
    { value: 'zalo', label: 'Zalo', badge: 'bg-blue-100 text-blue-700' },
    { value: 'zalo_group', label: 'Zalo Group', badge: 'bg-purple-100 text-purple-700' },
  ];
  const isChannelFiltered = channelFilters.length > 0;
  const allChannelSelected = channelFilters.length === 0;

  const toggleChannel = (value) => {
    setChannelFilters((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  // Status filter header
  const STATUS_OPTIONS = [
    { value: 'pending', label: 'Đơn chờ', badge: 'bg-orange-100 text-orange-700' },
    { value: 'completed', label: 'Đã hoàn thành', badge: 'bg-green-100 text-green-700' },
  ];
  const isStatusFiltered = statusFilters.length > 0;

  const toggleStatus = (value) => {
    setStatusFilters((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  return (
    <div className="card">
      {/* Card header */}
      <div className="p-4 md:p-5 border-b border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Bảng đơn hàng</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {formatNumber(pagination.total)} đơn
              {filtered.length !== items.length && (
                <span className="ml-1 text-primary-500 font-medium">
                  · đang hiện {filtered.length} kết quả
                </span>
              )}
            </p>
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-64">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              className="input text-sm"
              style={{ paddingLeft: '2.25rem' }}
              placeholder="Tìm sản phẩm, chiến dịch, run..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setSearchQuery('')}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-gray-100 w-fit">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleStatusTab(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-base ${
                ordersStatusFilter === tab.key
                  ? tab.key === 'pending'
                    ? 'bg-orange-500 text-white'
                    : tab.key === 'completed'
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-700 text-white'
                  : `text-gray-500 hover:text-gray-700 hover:bg-white/70 ${tab.color || ''}`
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="table-container relative">
        <table className="table">
          <thead>
            <tr>
              {/* Sản phẩm */}
              <th className="px-4 py-3 text-left font-medium text-gray-500 bg-gray-50 border-b min-w-[180px]">
                Sản phẩm
              </th>

              {/* Trạng thái — sortable + filterable */}
              <th
                className="px-4 py-3 text-left font-medium text-gray-500 bg-gray-50 border-b whitespace-nowrap relative"
              >
                <div className="flex items-center gap-0.5">
                  <span>Trạng thái</span>
                  <button
                    type="button"
                    className={`p-0.5 rounded transition-colors ${statusDropOpen ? 'bg-primary-50' : 'hover:bg-gray-100'}`}
                    onClick={() => setStatusDropOpen((v) => !v)}
                    title="Lọc theo trạng thái"
                  >
                    <svg
                      className={`w-3 h-3 ml-0.5 shrink-0 ${isStatusFiltered ? 'text-primary-500 fill-primary-500' : 'text-gray-400 fill-none'}`}
                      viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M3 4a1 1 0 011-1h12a1 1 0 011 1v1.586a1 1 0 01-.293.707l-4.414 4.414a1 1 0 00-.293.707V15a1 1 0 01-.553.894l-3 1.5A1 1 0 017 16.5v-5.086a1 1 0 00-.293-.707L2.293 6.293A1 1 0 012 5.586V4z" />
                    </svg>
                  </button>
                  {isStatusFiltered && (
                    <span className="ml-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-primary-500 text-white text-[9px] font-bold">
                      {statusFilters.length}
                    </span>
                  )}
                </div>

                {statusDropOpen && (
                  <div
                    className="absolute mt-1 min-w-[170px] bg-white rounded-xl border border-gray-200 shadow-xl z-30 overflow-hidden"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <div className="px-3 py-2 border-b border-gray-100 bg-gray-50/60">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="w-3.5 h-3.5 rounded accent-orange-500 cursor-pointer"
                          checked={statusFilters.length === 0}
                          onChange={() => setStatusFilters([])}
                        />
                        <span className="text-xs font-medium text-gray-500">Tất cả</span>
                      </label>
                    </div>
                    <div className="py-1">
                      {STATUS_OPTIONS.map((opt) => (
                        <label
                          key={opt.value}
                          className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-50 ${statusFilters.includes(opt.value) ? 'bg-primary-50/60' : ''}`}
                        >
                          <input
                            type="checkbox"
                            className="w-3.5 h-3.5 rounded accent-orange-500 cursor-pointer shrink-0"
                            checked={statusFilters.includes(opt.value)}
                            onChange={() => toggleStatus(opt.value)}
                          />
                          <span className={`badge text-[10px] px-1.5 py-0 ${opt.badge}`}>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                    {isStatusFiltered && (
                      <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/60">
                        <button
                          type="button"
                          className="text-xs text-red-400 hover:text-red-600 transition-colors"
                          onClick={() => { setStatusFilters([]); setStatusDropOpen(false); }}
                        >
                          Xóa bộ lọc
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </th>

              {/* Chiến dịch / Lượt chạy */}
              <th className="px-4 py-3 text-left font-medium text-gray-500 bg-gray-50 border-b min-w-[200px]">
                Chiến dịch / Lượt chạy
              </th>

              {/* Kênh — filterable */}
              <th
                className="px-4 py-3 text-left font-medium text-gray-500 bg-gray-50 border-b whitespace-nowrap relative"
              >
                <div className="flex items-center gap-0.5">
                  <span>Kênh</span>
                  <button
                    type="button"
                    className={`p-0.5 rounded transition-colors ${channelDropOpen ? 'bg-primary-50' : 'hover:bg-gray-100'}`}
                    onClick={() => setChannelDropOpen((v) => !v)}
                    title="Lọc theo kênh"
                  >
                    <svg
                      className={`w-3 h-3 ml-0.5 shrink-0 ${isChannelFiltered ? 'text-primary-500 fill-primary-500' : 'text-gray-400 fill-none'}`}
                      viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M3 4a1 1 0 011-1h12a1 1 0 011 1v1.586a1 1 0 01-.293.707l-4.414 4.414a1 1 0 00-.293.707V15a1 1 0 01-.553.894l-3 1.5A1 1 0 017 16.5v-5.086a1 1 0 00-.293-.707L2.293 6.293A1 1 0 012 5.586V4z" />
                    </svg>
                  </button>
                  {isChannelFiltered && (
                    <span className="ml-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-primary-500 text-white text-[9px] font-bold">
                      {channelFilters.length}
                    </span>
                  )}
                </div>

                {channelDropOpen && (
                  <div
                    className="absolute mt-1 min-w-[160px] bg-white rounded-xl border border-gray-200 shadow-xl z-30 overflow-hidden"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <div className="px-3 py-2 border-b border-gray-100 bg-gray-50/60">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" className="w-3.5 h-3.5 rounded accent-orange-500 cursor-pointer"
                          checked={allChannelSelected}
                          onChange={() => setChannelFilters([])}
                        />
                        <span className="text-xs font-medium text-gray-500">Tất cả</span>
                      </label>
                    </div>
                    <div className="py-1">
                      {CHANNEL_OPTIONS.map((opt) => (
                        <label key={opt.value} className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-50 ${channelFilters.includes(opt.value) ? 'bg-primary-50/60' : ''}`}>
                          <input type="checkbox" className="w-3.5 h-3.5 rounded accent-orange-500 cursor-pointer shrink-0"
                            checked={channelFilters.includes(opt.value)}
                            onChange={() => toggleChannel(opt.value)}
                          />
                          <span className={`badge text-[10px] px-1.5 py-0 ${opt.badge}`}>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                    {isChannelFiltered && (
                      <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/60">
                        <button type="button"
                          className="text-xs text-red-400 hover:text-red-600 transition-colors"
                          onClick={() => { setChannelFilters([]); setChannelDropOpen(false); }}>
                          Xóa bộ lọc
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </th>

              {/* Số tiền */}
              <SortTh column="amount">Số tiền</SortTh>

              {/* Ngày */}
              <SortTh column="orderDate">Ngày</SortTh>
            </tr>
          </thead>
          <tbody>
            {isLoadingOrders
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              : filtered.length === 0
              ? <EmptyState hasFilter={isAnyFilter || ordersStatusFilter !== 'all'} />
              : filtered.map((item) => {
                  const statusCfg = getOrderStatusCfg(item.statusGroup);
                  const channelCfg = getChannelCfg(item.campaignType);

                  return (
                    <tr
                      key={item.orderId}
                      className="hover:bg-primary-50/40 transition-colors cursor-pointer"
                      onClick={() => setSelectedOrder(item)}
                    >
                      {/* Sản phẩm */}
                      <td className="px-4 py-3 border-b border-gray-100">
                        <div className="font-medium text-gray-900 text-sm leading-snug">
                          {item.productName || `Đơn #${item.orderId}`}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">ID: {item.orderId}</div>
                      </td>

                      {/* Trạng thái */}
                      <td className="px-4 py-3 border-b border-gray-100">
                        <span className={`badge text-xs ${statusCfg.cls}`}>{statusCfg.label}</span>
                      </td>

                      {/* Chiến dịch / Lượt chạy */}
                      <td className="px-4 py-3 border-b border-gray-100">
                        <div className="text-sm font-medium text-gray-800 leading-snug truncate max-w-[220px]">
                          {item.campaignName || '—'}
                        </div>
                        {item.runName ? (
                          <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[220px]">
                            {item.runName}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-300 mt-0.5">Không có lượt chạy</div>
                        )}
                      </td>

                      {/* Kênh */}
                      <td className="px-4 py-3 border-b border-gray-100">
                        <span className={`badge ${channelCfg.cls} text-xs`}>{channelCfg.label}</span>
                      </td>

                      {/* Số tiền */}
                      <td className="px-4 py-3 border-b border-gray-100 text-sm text-right tabular-nums font-medium text-gray-700 whitespace-nowrap">
                        {formatCurrency(item.amount, item.currency)}
                      </td>

                      {/* Ngày */}
                      <td className="px-4 py-3 border-b border-gray-100 text-sm text-gray-500 whitespace-nowrap">
                        {formatDateOnly(item.orderDate)}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="p-4 md:p-5 border-t border-gray-100 flex items-center justify-between bg-gray-50/40">
        <button type="button"
          className="btn btn-secondary flex items-center gap-1.5 text-sm"
          disabled={isLoadingOrders || pagination.page <= 1}
          onClick={() => onChangePage(pagination.page - 1)}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Trang trước
        </button>

        <div className="flex items-center gap-1.5">
          <span className="text-sm text-gray-500">Trang</span>
          <span className="text-sm font-semibold text-gray-900">{pagination.page}</span>
          <span className="text-sm text-gray-400">/</span>
          <span className="text-sm text-gray-500">{pagination.totalPages}</span>
        </div>

        <button type="button"
          className="btn btn-secondary flex items-center gap-1.5 text-sm"
          disabled={isLoadingOrders || pagination.page >= pagination.totalPages}
          onClick={() => onChangePage(pagination.page + 1)}>
          Trang sau
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Order detail drawer */}
      {selectedOrder && (
        <OrderDetailDrawer
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onNavigateCustomer={handleNavigateCustomer}
        />
      )}
    </div>
  );
};

export default DashboardOrdersListTable;
