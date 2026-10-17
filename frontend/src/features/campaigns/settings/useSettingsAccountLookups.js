import { useEffect, useMemo, useState } from 'react';
import {
  fetchTelegramAccountOptions,
  fetchWhatsAppAccountOptions,
  fetchZaloAccountOptions,
} from '../utils/nodeConfigModal.helpers';

const EMPTY = Object.freeze({ zaloAccounts: [], telegramAccounts: [], whatsappAccounts: [] });

const hasNodeOfType = (nodes, types) => (
  (Array.isArray(nodes) ? nodes : []).some((node) => types.includes(String(node?.data?.nodeType || node?.type || '')))
);

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

  return useMemo(() => lookups, [lookups]);
}
