/**
 * transportLoader.js
 *
 * Lazy transport factory used by `telegramClient.buildDefaultClient`.
 * Production deployments keep the stub (default). To plug a real
 * transport in, set the env var:
 *
 *   TELEGRAM_GATEWAY_TRANSPORT=/abs/path/to/MyTransportClass.mjs
 *
 * The file must `export default` (or `module.exports`) a class that
 * extends `TelegramClient`. The loader instantiates it with the same
 * arguments `buildDefaultClient` would have passed, so the rest of
 * the gateway code does not change.
 *
 * Why a separate file?
 *   - The transport import is *dynamic* — we resolve the path at
 *     runtime, so the gateway boots even if the transport file is
 *     missing or broken (we fall back to the stub with a one-shot
 *     warning).
 *   - It keeps `telegramClient.js` focused on the contract + stub;
 *     the loader is a thin side-channel.
 */

import { warnOnce } from './warnOnce.js';

const logError = (msg, meta) =>
  meta !== undefined ? console.error(msg, meta) : console.error(msg);

const ENV_VARS = Object.freeze({
  telegram: 'TELEGRAM_GATEWAY_TRANSPORT',
});

function readTransportPath(envVar, env) {
  const source = env || process.env;
  const value = source[envVar];
  if (!value || value === 'stub' || value === 'default') return null;
  return value;
}

/**
 * Resolve a transport class for `channel`.
 *
 * Returns:
 *   - `null` if the env says "use the stub" (or is unset) — caller
 *     should fall back to its built-in stub.
 *   - the loaded class on success.
 *
 * On import failure or missing export, logs a one-shot warning and
 * returns `null` so the gateway keeps booting on the stub. This is
 * intentional: a broken transport must not bring down the entire
 * chatbot service.
 *
 * @param {Object} args
 * @param {'telegram'} args.channel
 * @param {(meta: string) => Promise<any>} [args.importer] - Function
 *   that resolves `meta` (path or URL) to the module's exports.
 *   Defaults to Node's `import()`. Tests pass a stub.
 * @param {NodeJS.ProcessEnv} [args.env] - Override for testing.
 * @returns {Promise<Function|null>}
 */
export async function loadTransportClass({
  channel,
  importer = (meta) => import(meta),
  env,
} = {}) {
  const envVar = ENV_VARS[channel];
  if (!envVar) {
    logError(`[TransportLoader] unknown channel: ${channel}`);
    return null;
  }

  const pathOrUrl = readTransportPath(envVar, env);
  if (!pathOrUrl) return null;

  let mod;
  try {
    mod = await importer(pathOrUrl);
  } catch (err) {
    warnOnce(
      `transport-loader:${channel}:import-fail`,
      `[TransportLoader:${channel}] failed to import ${pathOrUrl}: ${err.message}. Falling back to stub.`
    );
    return null;
  }

  // Accept either `module.exports` shape (`default`) or a default
  // export from ESM (`mod.default`), or a named `Transport` export.
  const candidate =
    (mod && (mod.default || mod.Transport)) || null;
  if (typeof candidate !== 'function') {
    warnOnce(
      `transport-loader:${channel}:no-export`,
      `[TransportLoader:${channel}] ${pathOrUrl} did not export a class. Falling back to stub.`
    );
    return null;
  }
  return candidate;
}

/**
 * Pure helper: resolve the env var name + path for a channel.
 * `env` defaults to `process.env`. Returns `{ envVar, path }`.
 */
export function getTransportPath(channel, env) {
  const envVar = ENV_VARS[channel];
  if (!envVar) {
    logError(`[TransportLoader] unknown channel: ${channel}`);
    return { envVar: null, path: null };
  }
  return { envVar, path: readTransportPath(envVar, env) };
}

export default { loadTransportClass, getTransportPath };
