import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchLandingCustomDomain } from '../../landing-pages/services/landingPagesAdminApi.service.js';
import { getCustomHostname, isSystemHostname } from '../utils/landingDomain.js';

/**
 * Tình trạng tên miền của trang, đọc từ SERVER (GET /admin/landing-pages/:id/custom-domain).
 *
 * Vì sao không đọc từ `form`: modal Cài đặt trang KHÔNG được đổi `form.domainType` (chốt PR-1 — đổi domainType làm
 * backend gỡ hàng `landing_page_domains`). Tên miền đổi qua API riêng (kết nối / gỡ) nên sau mỗi thao tác phải nạp lại
 * từ server; `form` chỉ còn là dữ liệu dự phòng lúc server chưa trả lời (hoặc lỗi mạng).
 *
 * `kind`:
 *  - 'none'           : chưa có hàng tên miền nào (trang mới chưa lưu, hoặc trang hỏng domain_type='custom' mất hàng).
 *  - 'free'           : link miễn phí `<slug>.founderai.biz` (`status` 'active', hoặc 'pending_verification' khi Cloudflare
 *                       chưa cấp xong — kèm `canRetryAutoProvision`).
 *  - 'custom-active'  : tên miền riêng đang chạy.
 *  - 'custom-pending' : tên miền riêng chưa xác minh (hàng cũ) — kèm `dnsRecords` để hiện bảng DNS.
 *
 * @param {{ open: boolean, editingId: number|null|undefined, form: object|null|undefined }} params
 * @returns {{ domain: object, reload: () => Promise<void>, loaded: boolean }}
 */
export default function useLandingDomainInfo({ open, editingId, form }) {
  const [server, setServer] = useState(null);
  const [loaded, setLoaded] = useState(false);
  // Chỉ nhận kết quả của lần nạp GỌI SAU CÙNG (đóng/mở nhanh, hoặc nạp lại sau thao tác trong khi lần trước còn bay).
  const seqRef = useRef(0);
  const idRef = useRef(editingId);
  idRef.current = editingId;

  const reload = useCallback(async () => {
    const id = idRef.current;
    if (!id) return;
    const seq = ++seqRef.current;
    try {
      const data = await fetchLandingCustomDomain(id);
      if (seq !== seqRef.current) return;
      setServer(data || null);
      setLoaded(true);
    } catch {
      // Lỗi mạng / quyền: giữ dữ liệu cũ (hoặc dự phòng từ form) — modal vẫn dùng được, chỉ không có bảng DNS mới.
    }
  }, []);

  useEffect(() => {
    // Đổi sang trang khác → bỏ dữ liệu của trang trước.
    seqRef.current += 1;
    setServer(null);
    setLoaded(false);
  }, [editingId]);

  useEffect(() => {
    if (open && editingId) reload();
  }, [open, editingId, reload]);

  const formHostname = form?.customDomainHostname || '';
  const formStatus = form?.customDomainStatus || null;
  const formCustomHostname = getCustomHostname(form);
  const formIsApex = Boolean(form?.customDomainIsApex);

  const domain = useMemo(() => {
    if (loaded && server) {
      if (!server.configured) return { kind: 'none', hostname: '', status: null, dnsRecords: [] };
      const common = {
        hostname: String(server.hostname || ''),
        status: server.status || null,
        dnsRecords: Array.isArray(server.dnsRecords) ? server.dnsRecords : [],
        cnameTarget: server.cnameTarget || '',
        apexFixedIp: server.apexFixedIp || null,
        isApex: Boolean(server.isApexDomain),
        instructions: server.instructions || '',
        // Link miễn phí kẹt `pending_verification` (Cloudflare lỗi lúc cấp): backend báo `canRetryAutoProvision` — nút
        // "Thử lại" ở modal Cài đặt dựa vào đây (xem RetryFreeLinkPanel). Hai cờ chỉ có ở dữ liệu SERVER, không có ở dự phòng form.
        cfManaged: Boolean(server.cfManaged),
        canRetryAutoProvision: Boolean(server.canRetryAutoProvision),
      };
      if (server.cfManaged || isSystemHostname(server.hostname)) return { kind: 'free', ...common };
      return { kind: server.status === 'active' ? 'custom-active' : 'custom-pending', ...common };
    }
    // Dự phòng từ form (server chưa trả lời): giống cách modal từng đọc `customDomainHostname`.
    if (formCustomHostname) {
      return {
        kind: formStatus === 'active' ? 'custom-active' : 'custom-pending',
        hostname: formCustomHostname,
        status: formStatus || 'pending_verification',
        dnsRecords: [],
        cnameTarget: '',
        apexFixedIp: null,
        isApex: formIsApex,
        instructions: '',
      };
    }
    if (formHostname) {
      return { kind: 'free', hostname: formHostname, status: formStatus, dnsRecords: [] };
    }
    return { kind: 'none', hostname: '', status: null, dnsRecords: [] };
  }, [loaded, server, formCustomHostname, formHostname, formStatus, formIsApex]);

  return { domain, reload, loaded };
}
