import api from './api';

/** P9 — quyền dùng kênh Telegram/WhatsApp theo gói của chủ workspace: { telegram, whatsapp, limits }. */
export const getChannelEntitlements = () => api.get('/users/channel-entitlements');

export default { getChannelEntitlements };
