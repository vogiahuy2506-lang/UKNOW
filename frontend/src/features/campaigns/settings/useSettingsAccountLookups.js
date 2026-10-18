import { useEffect, useMemo, useState } from 'react';
import {
  fetchTelegramAccountOptions,
  fetchWhatsAppAccountOptions,
  fetchZaloAccountOptions,
} from '../utils/nodeConfigModal.helpers';
import customerApiService from '../../customers/services/customerApi.service';

const EMPTY = Object.freeze({ zaloAccounts: [], telegramAccounts: [], whatsappAccounts: [], tags: [] });

const hasNodeOfType = (nodes, types) => (
  (Array.isArray(nodes) ? nodes : []).some((node) => types.includes(String(node?.data?.nodeType || node?.type || '')))
);

const INTERESTED_TYPES = ['read_interested_customers', 'interested_customers'];

/** Các id tag mà khối "khách đã lưu" đang lọc, gộp thành MỘT khoá chuỗi (đổi khoá → tải lại tên tag; không có tag → rỗng, khỏi gọi API). */
const interestedTagKey = (nodes) => [...new Set((Array.isArray(nodes) ? nodes : [])
  .filter((node) => INTERESTED_TYPES.includes(String(node?.data?.nodeType || node?.type || '')))
  .flatMap((node) => (Array.isArray(node?.data?.config?.interestedTagIds) ? node.data.config.interestedTagIds : []))
  .map(Number)
  .filter((id) => Number.isInteger(id) && id > 0))].sort((a, b) => a - b).join(',');

const ZALO_TYPES = ['select_zalo_account', 'get_all_groups', 'get_all_friends', 'send_zalo_personal', 'send_zalo_friend_request', 'send_zalo_group'];

/**
 * Tra tên tài khoản Zalo / Telegram / WhatsApp cho tab Thiết lập. Mỗi kênh chỉ tải MỘT lần, và chỉ khi chiến dịch
 * có khối thuộc kênh đó — mở tab Thiết lập của chiến dịch email không gọi API tài khoản Zalo.
 *
 * @param {Array<object>} nodes các khối của chiến dịch
 * @returns {{ zaloAccounts: Array, telegramAccounts: Array, whatsappAccounts: Array }}
 */
export default function useSettingsAccountLookups(nodes) {
  const needZalo = hasNodeOfType(nodes, ZALO_TYPES);
  const needTelegram = hasNodeOfType(nodes, ['send_telegram']);
  const needWhatsApp = hasNodeOfType(nodes, ['send_whatsapp']);
  const tagKey = interestedTagKey(nodes);
  const [lookups, setLookups] = useState(EMPTY);

  useEffect(() => {
    if (!needZalo) return undefined;
    let alive = true;
    fetchZaloAccountOptions()
      .then((items) => alive && setLookups((prev) => ({ ...prev, zaloAccounts: items })))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [needZalo]);

  useEffect(() => {
    if (!needTelegram) return undefined;
    let alive = true;
    fetchTelegramAccountOptions()
      .then((items) => alive && setLookups((prev) => ({ ...prev, telegramAccounts: items })))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [needTelegram]);

  useEffect(() => {
    if (!needWhatsApp) return undefined;
    let alive = true;
    fetchWhatsAppAccountOptions()
      .then((items) => alive && setLookups((prev) => ({ ...prev, whatsappAccounts: items })))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [needWhatsApp]);

  // Tên tag để tóm tắt "Khách đã lưu có tag A, B" (chỉ tải khi có khối lọc theo tag).
  useEffect(() => {
    if (!tagKey) return undefined;
    let alive = true;
    customerApiService.getTags()
      .then((res) => alive && setLookups((prev) => ({ ...prev, tags: Array.isArray(res?.data?.data) ? res.data.data : [] })))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [tagKey]);

  return useMemo(() => lookups, [lookups]);
}
