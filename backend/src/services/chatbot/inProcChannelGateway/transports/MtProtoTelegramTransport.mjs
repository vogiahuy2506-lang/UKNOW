/**
 * MtProtoTelegramTransport.mjs
 *
 * Thin `.mjs` shim that the gateway's transport loader
 * dynamically imports when `TELEGRAM_GATEWAY_TRANSPORT`
 * points here. Re-exports the production class as the
 * module's `default` so `loadTransportClass()` picks it up.
 *
 * Why a shim?
 * -----------
 * `transportLoader.js` does:
 *     const mod = await import(envPath);
 *     return mod.default;
 * So the file pointed at by the env var MUST be ESM and MUST
 * `export default` a class. Keeping the class itself in
 * `mtProtoTelegramClient.js` lets us colocate tests, mocks
 * and the .mjs hint in separate files.
 */

import MtProtoTelegramClient from '../mtProtoTelegramClient.js';

export default MtProtoTelegramClient;
