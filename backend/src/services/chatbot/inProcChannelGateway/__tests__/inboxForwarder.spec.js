/**
 * Tests for `inboxForwarder.js`. Spins up a tiny Express app on a
 * free port, configures the InboxForwarder with a custom
 * `targetResolver` that points at it, and asserts the forwarder
 * POSTs the right URL with the right headers and body.
 */

import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import express from 'express';
import http from 'node:http';

let InboxForwarder;
let _resetInboxForwarders;

beforeEach(async () => {
  const mod = await import('../inboxForwarder.js');
  InboxForwarder = mod.InboxForwarder;
  _resetInboxForwarders = mod._resetInboxForwarders;
  _resetInboxForwarders();
});

async function startServer(handler) {
  const app = express();
  app.use(express.json());
  app.post('/api/internal/:channel-webhook', handler);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { server, port, app };
}

describe('InboxForwarder.forward', () => {
  let server;
  let port;

  afterEach(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      server = null;
    }
  });

  it('POSTs to /api/internal/<channel>-webhook with the shared secret header', async () => {
    let receivedReq;
    let receivedBody;
    ({ server, port } = await startServer((req, res) => {
      receivedReq = req;
      receivedBody = req.body;
      res.status(204).end();
    }));

    const forwarder = new InboxForwarder({
      channel: 'telegram',
      secretResolver: () => 'unit-test-secret',
      targetResolver: () => ({ host: '127.0.0.1', port }),
    });

    const result = await forwarder.forward({
      telegram_user_id: 9,
      chat_id: 'chat:1',
      text: 'hello',
    });
    expect(result.status).toBe(204);
    expect(receivedReq.headers['x-gateway-secret']).toBe('unit-test-secret');
    expect(receivedReq.headers['content-type']).toBe('application/json');
    expect(receivedBody).toEqual({
      telegram_user_id: 9,
      chat_id: 'chat:1',
      text: 'hello',
    });
  });

  it('uses telegram webhook path when channel=telegram', async () => {
    let receivedPath;
    ({ server, port } = await startServer((req, res) => {
      receivedPath = req.path;
      res.status(204).end();
    }));

    const forwarder = new InboxForwarder({
      channel: 'telegram',
      secretResolver: () => 'tg-secret',
      targetResolver: () => ({ host: '127.0.0.1', port }),
    });
    await forwarder.forward({ telegram_user_id: 9, text: 'hi' });
    expect(receivedPath).toBe('/api/internal/telegram-webhook');
  });

  it('skips (no network) when the secret resolver returns empty', async () => {
    ({ server, port } = await startServer((req, res) => {
      res.status(204).end();
    }));

    const forwarder = new InboxForwarder({
      channel: 'telegram',
      secretResolver: () => '',
      targetResolver: () => ({ host: '127.0.0.1', port }),
    });
    const result = await forwarder.forward({ text: 'hi' });
    expect(result.skipped).toBe(true);
    expect(result.status).toBe(0);
  });

  it('swallows network errors so the transport loop keeps running', async () => {
    // No server started → connect refused. Forwarder must not reject.
    const forwarder = new InboxForwarder({
      channel: 'telegram',
      secretResolver: () => 'secret',
      targetResolver: () => ({ host: '127.0.0.1', port: 1 }), // privileged port, almost certainly unbound
      timeoutMs: 500,
    });
    const result = await forwarder.forward({ text: 'hi' });
    expect(result.error).toBeDefined();
    expect(result.status).toBe(0);
  });

  it('re-resolves the secret on every call (lazy)', async () => {
    let receivedSecret;
    ({ server, port } = await startServer((req, res) => {
      receivedSecret = req.headers['x-gateway-secret'];
      res.status(204).end();
    }));

    const secretResolver = jest
      .fn()
      .mockReturnValueOnce('first-secret')
      .mockReturnValueOnce('second-secret');

    const forwarder = new InboxForwarder({
      channel: 'telegram',
      secretResolver,
      targetResolver: () => ({ host: '127.0.0.1', port }),
    });

    await forwarder.forward({ text: 'one' });
    await forwarder.forward({ text: 'two' });
    // The second call's secret was active when its headers were built.
    expect(receivedSecret).toBe('second-secret');
    expect(secretResolver).toHaveBeenCalledTimes(2);
  });
});

describe('InboxForwarder constructor', () => {
  it('rejects missing channel', () => {
    expect(
      () =>
        new InboxForwarder({
          secretResolver: () => 'x',
        })
    ).toThrow(/channel is required/);
  });

  it('rejects non-function secretResolver', () => {
    expect(
      () =>
        new InboxForwarder({
          channel: 'telegram',
          secretResolver: 'not-a-function',
        })
    ).toThrow(/secretResolver must be a function/);
  });
});
