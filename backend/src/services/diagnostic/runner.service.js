import diagnosticRepository from '../../repositories/diagnostic.repository.js';
import zaloPersonalChannel from './channels/zaloPersonal.channel.js';

// Registry — thêm channel mới vào đây khi mở rộng
const CHANNEL_ADAPTERS = {
  zalo_personal: zaloPersonalChannel,
  // zalo_group: zaloGroupChannel,   // TODO
  // email: emailChannel,            // TODO
};

const SUPPORTED_CHANNELS = Object.keys(CHANNEL_ADAPTERS);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class DiagnosticRunnerService {
  getSupportedChannels() {
    return SUPPORTED_CHANNELS;
  }

  async createAndStart({ channel, accountId, messageText, interMessageDelayMs, recipients, createdBy, userId }) {
    const adapter = CHANNEL_ADAPTERS[channel];
    if (!adapter) {
      throw new Error(`Channel '${channel}' chưa được hỗ trợ. Các channel hợp lệ: ${SUPPORTED_CHANNELS.join(', ')}`);
    }

    await adapter.validate({ accountId, userId });

    const run = await diagnosticRepository.createRun({
      channel,
      accountId: accountId || null,
      messageText,
      interMessageDelayMs,
      recipients,
      createdBy,
    });
    await diagnosticRepository.bulkCreateMessages(run.id, recipients);

    // Chạy async — không block HTTP response
    setImmediate(() =>
      this._executeRun({ runId: run.id, adapter, accountId, userId, messageText, delayMs: interMessageDelayMs })
        .catch(() => diagnosticRepository.completeRun(run.id, 'failed'))
    );

    return run;
  }

  async _executeRun({ runId, adapter, accountId, userId, messageText, delayMs }) {
    let api;
    try {
      api = await adapter.getApi({ accountId, userId });
    } catch (err) {
      await diagnosticRepository.updateMessage(runId, 1, {
        status: 'failed',
        sentAt: new Date(),
        errorCode: 'API_UNAVAILABLE',
        errorMessage: err.message,
      });
      await diagnosticRepository.incrementFailedCount(runId);
      await diagnosticRepository.completeRun(runId, 'failed');
      return;
    }

    const messages = await diagnosticRepository.findRunMessages(runId);
    let prevSentAt = null;

    for (const msg of messages) {
      if (prevSentAt !== null) {
        const elapsed = Date.now() - prevSentAt;
        const remaining = delayMs - elapsed;
        if (remaining > 0) await sleep(remaining);
      }

      const sentAt = Date.now();
      const actualDelayMs = prevSentAt !== null ? sentAt - prevSentAt : null;

      try {
        await adapter.send({ api, recipient: msg.recipient, message: messageText });
        await diagnosticRepository.updateMessage(runId, msg.seq, {
          status: 'sent',
          sentAt: new Date(sentAt),
          delayMs: actualDelayMs,
        });
        await diagnosticRepository.incrementSentCount(runId);
      } catch (err) {
        await diagnosticRepository.updateMessage(runId, msg.seq, {
          status: 'failed',
          sentAt: new Date(sentAt),
          delayMs: actualDelayMs,
          errorCode: err.code || 'SEND_ERROR',
          errorMessage: err.message,
        });
        await diagnosticRepository.incrementFailedCount(runId);
      }

      prevSentAt = sentAt;
    }

    await diagnosticRepository.completeRun(runId, 'completed');
  }
}

export default new DiagnosticRunnerService();
