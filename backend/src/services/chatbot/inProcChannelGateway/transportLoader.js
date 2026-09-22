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
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

  // `NodeNext` ESM resolver treats `./foo.mjs` as relative to the CALLER
  // (i.e. this file), NOT to `process.cwd()`. Operators commonly paste
  // a path like `./src/services/chatbot/.../Foo.mjs` thinking it's
  // relative to the repo root — that lookup dies with
  // `Cannot find module`. Normalise such paths here:
  //   - turn `./src/services/...` into `./<just-the-tail>` since
  //     this file lives two levels under `src/`
  //   - turn absolute paths into a `file://` URL on Windows
  //     (Node ESM refuses bare absolute paths on Windows)
  //   - leave `file://...` URLs and package-spec strings (`tg-fork`)
  //     alone
  const normalised = normaliseTransportPath(pathOrUrl);

  let mod;
  try {
    mod = await importer(normalised);
  } catch (err) {
    warnOnce(
      `transport-loader:${channel}:import-fail`,
      `[TransportLoader:${channel}] failed to import ${pathOrUrl} (resolved to ${normalised}): ${err.message}. Falling back to stub.`
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

/**
 * Normalise a transport `meta` value so dynamic `import()` succeeds
 * regardless of the convention the operator used. This file lives at
 *   src/services/chatbot/inProcChannelGateway/transportLoader.js
 * and Node's ESM resolver treats `./foo` as relative to THAT file —
 * not to `process.cwd()`. Operators copying a "looks like it should
 * work" path from their tree (e.g. `./src/services/chatbot/.../X.mjs`)
 * get a `Cannot find module` error that masks the real cause.
 *
 * Heuristics:
 *   1. URL strings (`file://...`, `http://...`) are returned untouched.
 *   2. Package specifiers (`name`, `@scope/name`, `name/sub`) are
 *      returned untouched — `import()` resolves them via node_modules.
 *   3. Bare absolute paths (POSIX or Windows) get a `file://` prefix
 *      on Windows so `import()` accepts them.
 *   4. Relative paths starting with `./src/...` get the `./src/`
 *      prefix stripped so we resolve from this file's directory.
 *   5. Other relative paths (`./...`, `../...`) are returned
 *      untouched — those already resolve from this file.
 *
 * @param {string} meta
 * @returns {string}
 */
export function normaliseTransportPath(meta) {
  if (!meta || typeof meta !== 'string') return meta;
  const value = meta.trim();
  if (!value) return value;
  // 1. URL or package specifier
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  if (value.startsWith('file://')) return value;
  if (/^@?[a-z0-9][a-z0-9._-]*(\/|$)/i.test(value) && !value.startsWith('.') && !value.startsWith('/')) {
    return value;
  }
  // 2. Bare absolute path → file:// (Windows + POSIX)
  if (path.isAbsolute(value)) {
    return pathToFileUrl(value).href;
  }
  // 3. `./src/...` from repo root → trim to `./...` relative to this file.
  //    This file lives 4 levels deep in `src/`:
  //      src/services/chatbot/inProcChannelGateway/transportLoader.js
  //    so `./src/services/chatbot/inProcChannelGateway/transports/X.mjs`
  //    becomes `./transports/X.mjs`.
  const tailMatch = value.match(/^\.\/src\/services\/chatbot\/inProcChannelGateway\/(.+)$/);
  if (tailMatch) {
    return `./${tailMatch[1]}`;
  }
  // 4. Anything else (`./...`, `../...`) is already caller-relative.
  return value;
}

function pathToFileUrl(p) {
  return pathToFileURL(p);
}

export default { loadTransportClass, getTransportPath };
