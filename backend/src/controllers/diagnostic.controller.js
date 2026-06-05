import diagnosticRunnerService from '../services/diagnostic/runner.service.js';
import diagnosticRepository from '../repositories/diagnostic.repository.js';

const MAX_RECIPIENTS = 20;
const MIN_DELAY_MS = 1000;
const MAX_DELAY_MS = 60000;

class DiagnosticController {
  async createRun(req, res) {
    try {
      const { channel, accountId, messageText, interMessageDelayMs, recipients } = req.body;
      const userId = req.user.id;

      if (!channel || !messageText || !Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ success: false, message: 'Thiếu channel, messageText hoặc recipients' });
      }

      const cleanRecipients = recipients
        .map((r) => String(r || '').trim())
        .filter(Boolean);

      if (cleanRecipients.length === 0) {
        return res.status(400).json({ success: false, message: 'Danh sách recipients rỗng' });
      }
      if (cleanRecipients.length > MAX_RECIPIENTS) {
        return res.status(400).json({ success: false, message: `Tối đa ${MAX_RECIPIENTS} recipients mỗi lần test` });
      }

      const delay = Math.min(Math.max(Number(interMessageDelayMs) || 5000, MIN_DELAY_MS), MAX_DELAY_MS);

      const run = await diagnosticRunnerService.createAndStart({
        channel,
        accountId: accountId ? Number(accountId) : null,
        messageText: String(messageText).trim(),
        interMessageDelayMs: delay,
        recipients: cleanRecipients,
        createdBy: userId,
        userId,
      });

      return res.status(201).json({ success: true, data: { runId: run.id } });
    } catch (err) {
      console.error('[Diagnostic] createRun error:', err.message);
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  async getRun(req, res) {
    try {
      const runId = Number(req.params.id);
      const [run, messages] = await Promise.all([
        diagnosticRepository.findRun(runId),
        diagnosticRepository.findRunMessages(runId),
      ]);
      if (!run) return res.status(404).json({ success: false, message: 'Không tìm thấy run' });

      return res.json({ success: true, data: { run, messages } });
    } catch (err) {
      console.error('[Diagnostic] getRun error:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  async listRuns(req, res) {
    try {
      const runs = await diagnosticRepository.listRecentRuns(20);
      return res.json({ success: true, data: runs });
    } catch (err) {
      console.error('[Diagnostic] listRuns error:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  async getSupportedChannels(req, res) {
    return res.json({ success: true, data: diagnosticRunnerService.getSupportedChannels() });
  }
}

export default new DiagnosticController();
