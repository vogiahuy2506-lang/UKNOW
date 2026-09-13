/**
 * proxyTransport.js
 *
 * Custom `TelegramTransport` implementation that wraps
 * `@mtcute/node`'s default `TcpTransport` with optional
 * SOCKS5 / HTTP CONNECT proxy support. Required because
 * operators behind DPI / national firewalls (Vietnam, Iran,
 * Russia, …) can't reach `149.154.167.50:443` directly even
 * though their public DNS / web HTTPS works fine.
 *
 * Why this file?
 * --------------
 * mtcute ships `TcpTransport` (a thin wrapper over
 * `@fuman/node`'s `connectTcp`) that hard-codes a direct TCP
 * dial. There's no built-in `proxy` option in
 * `MtClientOptions`, so the only clean way to inject a proxy
 * is to hand mtcute a transport class of our own. fuman
 * already ships a `withSocksProxy` / `withHttpProxy` helper
 * that takes a "connect" function and returns a wrapped one
 * — we plug that into a class that satisfies the
 * `TelegramTransport` contract (`connect(dc, signal)` +
 * `packetCodec()`).
 *
 * Env vars:
 *   TELEGRAM_PROXY_URL=socks5://[user:pass@]host:port
 *   TELEGRAM_PROXY_URL=http://[user:pass@]host:port
 *
 * When unset, the file falls back to a direct TCP dial —
 * byte-for-byte equivalent to the upstream `TcpTransport`.
 */

import { connectTcp } from '@fuman/node';
import {
  withSocksProxy,
  withHttpProxy,
  SocksProxyConnectionError,
  HttpProxyConnectionError,
} from '@fuman/net';
import { IntermediatePacketCodec } from '@mtcute/core';
import { warnOnce } from './warnOnce.js';

/**
 * Parse `socks5://[user:pass@]host:port` or
 * `http://[user:pass@]host:port` into a fuman proxy descriptor.
 *
 * Returns `null` for any malformed input — caller treats that
 * as "no proxy" and falls back to direct TCP.
 *
 * @param {string|undefined|null} raw
 * @returns {{ kind: 'socks5'|'http', host: string, port: number, user?: string, password?: string } | null}
 */
export function parseProxyUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const protocol = (url.protocol || '').toLowerCase().replace(':', '');
  let kind = null;
  if (protocol === 'socks5' || protocol === 'socks') kind = 'socks5';
  else if (protocol === 'http' || protocol === 'https') kind = 'http';
  if (!kind) return null;

  const hostRaw = url.hostname;
  // Node's WHATWG URL keeps `[2001:db8::1]` (with brackets) in
  // `.hostname` for IPv6 literals — strip them before handing the
  // address to the TCP connect call.
  const host = hostRaw.replace(/^\[(.*)\]$/, '$1') || hostRaw;
  // `URL.port` is empty string when the default port is implicit;
  // we always want a numeric port for fuman's proxy descriptor.
  const port = url.port
    ? Number(url.port)
    : kind === 'socks5'
    ? 1080
    : 8080;
  if (!host || !Number.isFinite(port) || port <= 0 || port > 65535) {
    return null;
  }

  const user = url.username ? decodeURIComponent(url.username) : undefined;
  const password = url.password ? decodeURIComponent(url.password) : undefined;

  return { kind, host, port, user, password };
}

/**
 * `TelegramTransport` that dials Telegram DCs through a SOCKS5
 * or HTTP CONNECT proxy. Falls back to direct TCP when no proxy
 * env var is set, so behaviour is byte-identical to mtcute's
 * stock `TcpTransport` in the happy path.
 */
export class ProxyTcpTransport {
  constructor() {
    this._cachedProxyUrl = null;
    this._cachedProxyDescriptor = null;
    this._baseConnect = connectTcp;
  }

  /**
   * Read `TELEGRAM_PROXY_URL` from the environment on every
   * call. We re-read (rather than memoising at construction)
   * so tests / hot-reload pick up env changes without a
   * restart. Caching the *parsed* descriptor avoids reparsing
   * on every single TCP dial.
   *
   * @param {{ ipAddress: string, port: number }} dc
   * @param {AbortSignal} [abortSignal]
   */
  async connect(dc, abortSignal) {
    const raw = process.env.TELEGRAM_PROXY_URL;
    const descriptor =
      raw === this._cachedProxyUrl
        ? this._cachedProxyDescriptor
        : parseProxyUrl(raw);
    if (raw !== this._cachedProxyUrl) {
      this._cachedProxyUrl = raw;
      this._cachedProxyDescriptor = descriptor;
      if (descriptor) {
        console.log(
          `[ProxyTcpTransport] routing Telegram DCs via ${descriptor.kind} proxy ${descriptor.host}:${descriptor.port}` +
            (descriptor.user ? ' (with auth)' : '')
        );
      } else if (raw) {
        // Env var was set but didn't parse — warn once.
        warnOnce(
          `proxy-tcp:bad-url:${raw}`,
          `[ProxyTcpTransport] TELEGRAM_PROXY_URL="${raw}" is malformed — falling back to direct TCP. Expected socks5://user:pass@host:port or http://user:pass@host:port.`
        );
      }
    }

    let wrapped;
    if (descriptor?.kind === 'socks5') {
      wrapped = withSocksProxy(this._baseConnect, {
        host: descriptor.host,
        port: descriptor.port,
        user: descriptor.user,
        password: descriptor.password,
      });
    } else if (descriptor?.kind === 'http') {
      wrapped = withHttpProxy(this._baseConnect, {
        host: descriptor.host,
        port: descriptor.port,
        user: descriptor.user,
        password: descriptor.password,
      });
    } else {
      wrapped = this._baseConnect;
    }

    let conn;
    try {
      conn = await wrapped(
        { address: dc.ipAddress, port: dc.port },
        abortSignal
      );
    } catch (err) {
      // Translate proxy-specific errors into a clearer message so
      // operators see "proxy" in the log instead of a generic
      // ECONNREFUSED pointing at Telegram DC.
      if (
        err instanceof SocksProxyConnectionError ||
        err instanceof HttpProxyConnectionError
      ) {
        const wrapped = new Error(
          `Telegram proxy handshake failed (${descriptor.kind}://${descriptor.host}:${descriptor.port}): ${err.message}`
        );
        wrapped.cause = err;
        throw wrapped;
      }
      throw err;
    }

    // mtcute's TCP transport sets these; preserve the same
    // semantics so we don't regress handshake perf.
    if (typeof conn.setNoDelay === 'function') conn.setNoDelay(true);
    if (typeof conn.setKeepAlive === 'function') conn.setKeepAlive(true);
    return conn;
  }

  packetCodec() {
    return new IntermediatePacketCodec();
  }
}

export default ProxyTcpTransport;