/**
 * Shared zca-js listener options for every Zalo session create/restore path.
 * selfListen must stay true so owner messages from the Zalo app reach the inbox.
 */
export const ZALO_LISTENER_OPTIONS = {
  selfListen: true,
  checkUpdate: true,
};
