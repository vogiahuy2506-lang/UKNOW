/**
 * Tests for `chatbotController.getPersonalAccountStatus` +
 * `chatbotController.getPersonalAccountsHealth`. Mocks the in-process
 * gateway so the controller's env-driven branches are exercised
 * without booting the real gateway.
 */

// Both must be ESM so `unstable_mockModule` can intercept them.
const gatewayPath = '../../services/chatbot/inProcChannelGateway/index.js';
const controllerPath = '../../controllers/chatbot.controller.js';

// Hoisting trick: jest.mock factory runs before any require/import.
jest.unstable_mockModule(gatewayPath, () => {
  const realEnvReads = {
    isStubOnly: ({ channel }) => {
      const envVar =
        channel === 'telegram' ? 'TELEGRAM_GATEWAY_TRANSPORT' : null;
      if (!envVar) return true;
      const v = process.env[envVar];
      return !v || v === 'stub' || v === 'default';
    },
  };
  return {
    __esModule: true,
    getState: jest.fn(() => ({})),
    isStubOnly: jest.fn(realEnvReads.isStubOnly),
    // The controller imports more than we exercise here; stub the
    // rest so a stray code path doesn't blow up the import.
    ensureGateway: jest.fn(async () => ({ ok: true })),
    getSecret: jest.fn(() => ''),
    getNodeJsCallbackUrl: jest.fn(() => ''),
    getChannelGateway: jest.fn(),
    configureChannel: jest.fn(),
    shutdownGateway: jest.fn(async () => {}),
    installLifecycleHooks: jest.fn(),
  };
});

let mockedGateway;
let chatbotController;

beforeEach(async () => {
  jest.resetModules();
  const gw = await import(gatewayPath);
  mockedGateway = gw;
  chatbotController = (await import(controllerPath)).default;
  // Re-install fresh jest.fn() per test (resetModules wiped them).
  gw.getState.mockImplementation(() => ({}));
  gw.isStubOnly.mockImplementation(({ channel }) => {
    const envVar = channel === 'telegram' ? 'TELEGRAM_GATEWAY_TRANSPORT' : null;
    if (!envVar) return true;
    const v = process.env[envVar];
    return !v || v === 'stub' || v === 'default';
  });
});

afterEach(() => {
  delete process.env.TELEGRAM_GATEWAY_TRANSPORT;
});

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe('chatbotController.getPersonalAccountStatus', () => {
  it('returns 400 for unknown channel', async () => {
    const req = { params: { channel: 'facebook' } };
    const res = mockRes();
    await chatbotController.getPersonalAccountStatus(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_CHANNEL');
  });

  it('reports stubOnly + STUB_TRANSPORT reason for Telegram with stub env', async () => {
    delete process.env.TELEGRAM_GATEWAY_TRANSPORT;
    mockedGateway.getState.mockReturnValue({
      telegram: { started: true, hasSecret: true, stubOnly: true },
    });
    const req = { params: { channel: 'telegram' } };
    const res = mockRes();
    await chatbotController.getPersonalAccountStatus(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.reason).toBe('TELEGRAM_STUB_TRANSPORT');
    expect(res.body.data.canStartLogin).toBe(false);
  });

  it('reports canStartLogin=true when secret is set and transport is real', async () => {
    process.env.TELEGRAM_GATEWAY_TRANSPORT = '/abs/path/RealTelegram.mjs';
    mockedGateway.getState.mockReturnValue({
      telegram: { started: true, hasSecret: true, stubOnly: false },
    });
    const req = { params: { channel: 'telegram' } };
    const res = mockRes();
    await chatbotController.getPersonalAccountStatus(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toMatchObject({
      channel: 'telegram',
      stubOnly: false,
      hasSecret: true,
      canStartLogin: true,
      reason: null,
    });
  });

  it('falls back to a safe default when channel is not in getState()', async () => {
    delete process.env.TELEGRAM_GATEWAY_TRANSPORT;
    mockedGateway.getState.mockReturnValue({});
    const req = { params: { channel: 'telegram' } };
    const res = mockRes();
    await chatbotController.getPersonalAccountStatus(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toMatchObject({
      channel: 'telegram',
      hasSecret: false,
      stubOnly: true,
      canStartLogin: false,
      reason: 'TELEGRAM_STUB_TRANSPORT',
    });
  });

  it('returns 500 when getState throws (defensive)', async () => {
    mockedGateway.getState.mockImplementation(() => {
      throw new Error('boot broken');
    });
    const req = { params: { channel: 'telegram' } };
    const res = mockRes();
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await chatbotController.getPersonalAccountStatus(req, res);
    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('gateway status unavailable');
    errSpy.mockRestore();
  });
});

describe('chatbotController.getPersonalAccountsHealth', () => {
  beforeEach(() => {
    jest.spyOn(mockedGateway, 'getState');
    jest.spyOn(mockedGateway, 'isStubOnly');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.TELEGRAM_GATEWAY_TRANSPORT;
  });

  it('returns allHealthy=true when Telegram is healthy', async () => {
    mockedGateway.getState.mockReturnValue({
      telegram: { started: true, hasSecret: true, stubOnly: false },
    });
    const req = {};
    const res = mockRes();
    await chatbotController.getPersonalAccountsHealth(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.allHealthy).toBe(true);
    expect(res.body.data.channels.telegram.canStartLogin).toBe(true);
    expect(res.body.data.checkedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('returns allHealthy=false when Telegram is missing secret', async () => {
    mockedGateway.getState.mockReturnValue({
      telegram: { started: true, hasSecret: false, stubOnly: false },
    });
    const req = {};
    const res = mockRes();
    await chatbotController.getPersonalAccountsHealth(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.allHealthy).toBe(false);
    expect(res.body.data.channels.telegram.reason).toBe('TELEGRAM_NOT_CONFIGURED');
  });

  it('reports CHANNEL_UNAVAILABLE when getState throws', async () => {
    // The current helper catches getState()'s throw per-channel
    // and returns null, which the multi-channel endpoint turns
    // into a CHANNEL_UNAVAILABLE hint. The FE can still render
    // something useful instead of silently dropping the channel.
    mockedGateway.getState.mockImplementation(() => {
      throw new Error('transient');
    });
    const req = {};
    const res = mockRes();
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await chatbotController.getPersonalAccountsHealth(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.allHealthy).toBe(false);
    expect(res.body.data.channels.telegram.reason).toBe('CHANNEL_UNAVAILABLE');
    errSpy.mockRestore();
  });
});
