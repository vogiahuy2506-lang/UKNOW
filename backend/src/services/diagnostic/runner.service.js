import diagnosticRepository from '../../repositories/diagnostic.repository.js';
import { classifyZaloSendError } from '../../utils/zaloSendErrorClassifier.util.js';
import { buildZaloRateLimiterFromEnv } from '../campaign/buildZaloRateLimiterFromEnv.js';
import zaloPersonalChannel from './channels/zaloPersonal.channel.js';

const CHANNEL_ADAPTERS = {
  zalo_personal: zaloPersonalChannel,
};

const SUPPORTED_CHANNELS = Object.keys(CHANNEL_ADAPTERS);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPolicySnapshot(limiter, channel, accountHint = null) {
  const policy = limiter.resolveOutboundPolicy(channel);
  return {
    ...policy,
    ...(accountHint && typeof accountHint === 'object' ? { accountHint } : {}),
    quietHoursStart: limiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE,
    quietHoursEnd: limiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE,
    phoneLookupCooldownMs: limiter.ZALO_PERSONAL_PHONE_LOOKUP_COOLDOWN_MS,
  };
}

function readMaxPolicyWaitMs() {
  const raw = Number.parseInt(process.env.DIAGNOSTIC_MAX_WAIT_MS, 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 120_000;
}

function mapPolicyWaitReasonToErrorCategory(waitReason) {
  if (waitReason === 'quiet_hours') return 'QUIET_HOURS';
  if (waitReason === 'rate_limited') return 'RATE_LIMITED';
  if (waitReason === 'phone_lookup_cooldown') return 'PHONE_LOOKUP_RATE_LIMIT';
  return 'UNKNOWN';
}

class DiagnosticRunnerService {
  constructor() {
    // Isolated limiter instance: policy parity with production, but no shared state with campaign runs.
    this.zaloRateLimiter = buildZaloRateLimiterFromEnv();
    this.DIAGNOSTIC_MAX_WAIT_MS = readMaxPolicyWaitMs();
  }

  getSupportedChannels() {
    return SUPPORTED_CHANNELS;
  }

  async createAndStart({
    channel,
    accountId,
    messageText,
    interMessageDelayMs,
    recipients,
    createdBy,
    userId,
    mode = 'fast',
  }) {
    const adapter = CHANNEL_ADAPTERS[channel];
    if (!adapter) {
      throw new Error(`Channel '${channel}' chưa được hỗ trợ. Các channel hợp lệ: ${SUPPORTED_CHANNELS.join(', ')}`);
    }

    await adapter.validate({ accountId, userId });

    const policySnapshot = mode === 'production'
      ? buildPolicySnapshot(this.zaloRateLimiter, channel)
      : null;

    const run = await diagnosticRepository.createRun({
      channel,
      accountId: accountId || null,
      messageText,
      interMessageDelayMs,
      recipients,
      createdBy,
      mode,
      policySnapshot,
    });
    await diagnosticRepository.bulkCreateMessages(run.id, recipients);

    setImmediate(() =>
      this._executeRun({
        runId: run.id,
        adapter,
        accountId,
        userId,
        messageText,
        delayMs: interMessageDelayMs,
        mode,
      }).catch(() => diagnosticRepository.completeRun(run.id, 'failed'))
    );

    return run;
  }

  async enforceProductionPolicy({ runId, accountId, channel }) {
    const safeAccountId = String(accountId || '').trim();
    if (!safeAccountId) {
      return { waitMs: null, waitReason: null };
    }

    let lastWaitReason = null;
    let totalWaitMs = 0;

    const throwIfWaitExceedsBudget = (waitMs, reason) => {
      if (waitMs <= this.DIAGNOSTIC_MAX_WAIT_MS) return;
      const error = new Error(`Diagnostic wait exceeds budget (${waitMs}ms > ${this.DIAGNOSTIC_MAX_WAIT_MS}ms)`);
      error.code = 'DIAGNOSTIC_POLICY_WAIT_TOO_LONG';
      error.waitMs = waitMs;
      error.waitReason = reason;
      error.resumeAt = new Date(Date.now() + waitMs).toISOString();
      throw error;
    };

    try {
      await this.zaloRateLimiter.enforceOutboundPolicyBeforeSend({
        accountId: safeAccountId,
        channel,
        yieldOrSleep: async (waitMs, reason) => {
          const normalizedWait = Math.max(0, Number(waitMs) || 0);
          lastWaitReason = reason || null;
          totalWaitMs += normalizedWait;
          throwIfWaitExceedsBudget(normalizedWait, reason);
          if (normalizedWait > 0) {
            await sleep(normalizedWait);
          }
        },
        sleepWithRunCheck: async (waitMs) => {
          const normalizedWait = Math.max(0, Number(waitMs) || 0);
          lastWaitReason = 'inter_message_delay';
          totalWaitMs += normalizedWait;
          throwIfWaitExceedsBudget(normalizedWait, 'inter_message_delay');
          if (normalizedWait > 0) {
            await sleep(normalizedWait);
          }
        },
        ensureRunStillRunning: async () => {},
        runId,
      });
      return {
        waitMs: totalWaitMs > 0 ? totalWaitMs : null,
        waitReason: lastWaitReason,
      };
    } catch (error) {
      if (error?.code !== 'DIAGNOSTIC_POLICY_WAIT_TOO_LONG') {
        throw error;
      }
      return {
        skip: true,
        waitMs: Number(error.waitMs) || null,
        waitReason: error.waitReason || null,
        resumeAt: error.resumeAt || null,
      };
    }
  }

  async _executeRun({ runId, adapter, accountId, userId, messageText, delayMs, mode }) {
    let api;
    try {
      api = await adapter.getApi({ accountId, userId });
    } catch (err) {
      const classified = classifyZaloSendError(err);
      await diagnosticRepository.updateMessage(runId, 1, {
        status: 'failed',
        sentAt: new Date(),
        errorCode: err.code || 'API_UNAVAILABLE',
        errorMessage: err.message,
        errorCategory: classified.category,
      });
      await diagnosticRepository.incrementFailedCount(runId);
      await diagnosticRepository.completeRun(runId, 'failed');
      return;
    }

    const messages = await diagnosticRepository.findRunMessages(runId);
    let prevProcessedAt = null;
    const channelKey = adapter.getChannelKey();

    for (const msg of messages) {
      let preSendWaitMs = null;
      let preSendWaitReason = null;

      if (mode === 'fast' && prevProcessedAt !== null) {
        const elapsed = Date.now() - prevProcessedAt;
        const remaining = delayMs - elapsed;
        if (remaining > 0) {
          preSendWaitMs = remaining;
          preSendWaitReason = 'inter_message_delay';
          await sleep(remaining);
        }
      }

      if (mode === 'production') {
        const policyOutcome = await this.enforceProductionPolicy({
          runId,
          accountId,
          channel: channelKey,
        });
        preSendWaitMs = policyOutcome.waitMs ?? null;
        preSendWaitReason = policyOutcome.waitReason ?? null;
        if (policyOutcome.skip) {
          const category = mapPolicyWaitReasonToErrorCategory(policyOutcome.waitReason);
          const resumeAtText = policyOutcome.resumeAt
            ? ` · dự kiến tiếp tục lúc ${policyOutcome.resumeAt}`
            : '';
          await diagnosticRepository.updateMessage(runId, msg.seq, {
            status: 'skipped',
            delayMs: prevProcessedAt !== null ? Date.now() - prevProcessedAt : null,
            waitMs: policyOutcome.waitMs ?? null,
            waitReason: policyOutcome.waitReason ?? null,
            errorCategory: category,
            errorCode: 'POLICY_WAIT_TOO_LONG',
            errorMessage: `Policy wait vượt ngưỡng ${this.DIAGNOSTIC_MAX_WAIT_MS}ms${resumeAtText}`,
          });
          await diagnosticRepository.incrementSkippedCount(runId);
          prevProcessedAt = Date.now();
          continue;
        }
      }

      await diagnosticRepository.updateMessage(runId, msg.seq, {
        status: 'sending',
        waitMs: preSendWaitMs,
        waitReason: preSendWaitReason,
      });

      const sentAt = Date.now();
      const actualDelayMs = prevProcessedAt !== null ? sentAt - prevProcessedAt : null;

      try {
        const staged = await adapter.sendStaged?.({ api, recipient: msg.recipient, message: messageText })
          ?? { lookupMs: null, sendMs: null, ...(await adapter.send({ api, recipient: msg.recipient, message: messageText })) };

        if (mode === 'production') {
          this.zaloRateLimiter.markOutboundSuccess({
            accountId,
            channel: channelKey,
          });
        }

        await diagnosticRepository.updateMessage(runId, msg.seq, {
          status: 'sent',
          sentAt: new Date(sentAt),
          delayMs: actualDelayMs,
          waitMs: preSendWaitMs,
          waitReason: preSendWaitReason,
          lookupMs: staged.lookupMs ?? null,
          sendMs: staged.sendMs ?? null,
          resolvedUid: staged.uid ?? null,
          zaloName: staged.zaloName ?? null,
          attempts: staged.attempts ?? null,
        });
        await diagnosticRepository.incrementSentCount(runId);
      } catch (err) {
        const classified = classifyZaloSendError(err, { stage: err.stage || 'send' });
        await diagnosticRepository.updateMessage(runId, msg.seq, {
          status: 'failed',
          sentAt: new Date(sentAt),
          delayMs: actualDelayMs,
          errorCode: err.code || 'SEND_ERROR',
          errorMessage: err.message,
          errorCategory: classified.category,
          waitMs: preSendWaitMs,
          waitReason: preSendWaitReason,
          lookupMs: err.lookupMs ?? null,
          sendMs: err.sendMs ?? null,
          attempts: err.zaloRetry?.attempt ?? err.attempts ?? null,
        });
        await diagnosticRepository.incrementFailedCount(runId);
      }

      prevProcessedAt = sentAt;
    }

    await diagnosticRepository.completeRun(runId, 'completed');
  }
}

export default new DiagnosticRunnerService();
