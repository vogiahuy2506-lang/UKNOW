import diagnosticRunnerService from '../services/diagnostic/runner.service.js';
import diagnosticRepository from '../repositories/diagnostic.repository.js';
import { buildZaloRateLimiterFromEnv } from '../services/campaign/buildZaloRateLimiterFromEnv.js';
import campaignRunService from '../services/campaign/campaignRun.service.js';

const MIN_DELAY_MS = 1000;
const MAX_DELAY_MS = 60000;

function readMaxRecipients() {
  const raw = Number.parseInt(process.env.DIAGNOSTIC_MAX_RECIPIENTS, 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 20;
}

function readProductionMaxRecipients() {
  const raw = Number.parseInt(process.env.DIAGNOSTIC_PRODUCTION_MAX_RECIPIENTS, 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 5;
}

function normalizeMode(raw) {
  const mode = String(raw || 'fast').trim().toLowerCase();
  return mode === 'production' ? 'production' : 'fast';
}

class DiagnosticController {
  async getConfig(req, res) {
    return res.json({
      success: true,
      data: {
        maxRecipients: readMaxRecipients(),
        productionMaxRecipients: readProductionMaxRecipients(),
        minDelayMs: MIN_DELAY_MS,
        maxDelayMs: MAX_DELAY_MS,
        modes: ['fast', 'production'],
      },
    });
  }

  async getPolicy(req, res) {
    try {
      const channel = String(req.query.channel || 'zalo_personal').trim();
      const accountId = req.query.accountId ? Number(req.query.accountId) : null;

      const limiter = buildZaloRateLimiterFromEnv();
      const policy = limiter.resolveOutboundPolicy(channel);

      return res.json({
        success: true,
        data: {
          channel,
          accountId,
          policy,
          quietHours: {
            start: limiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE,
            end: limiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE,
          },
          phoneLookupCooldownMs: limiter.ZALO_PERSONAL_PHONE_LOOKUP_COOLDOWN_MS,
        },
      });
    } catch (err) {
      console.error('[Diagnostic] getPolicy error:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  async getAccountStatus(req, res) {
    try {
      const accountId = req.query.accountId ? Number(req.query.accountId) : null;
      const channel = String(req.query.channel || 'zalo_personal').trim() || 'zalo_personal';
      if (!Number.isFinite(accountId) || accountId <= 0) {
        return res.status(400).json({ success: false, message: 'accountId không hợp lệ' });
      }
      const status = await campaignRunService.getOutboundAccountStatus({
        accountId,
        channel,
        userId: req.user?.id || null,
        roleCode: req.user?.role || null,
      });
      return res.json({ success: true, data: status });
    } catch (err) {
      console.error('[Diagnostic] getAccountStatus error:', err.message);
      return res.status(400).json({ success: false, message: err.message || 'Không đọc được trạng thái account' });
    }
  }

  async createRun(req, res) {
    try {
      const {
        channel,
        accountId,
        messageText,
        interMessageDelayMs,
        recipients,
        mode: rawMode,
        dryRun: rawDryRun,
      } = req.body;
      const userId = req.user.id;
      const mode = normalizeMode(rawMode);
      const dryRun = rawDryRun === true;
      const normalizedChannel = String(channel || '').trim();
      const maxRecipients = mode === 'production'
        ? readProductionMaxRecipients()
        : readMaxRecipients();

      if (!normalizedChannel || !messageText || !Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ success: false, message: 'Thiếu channel, messageText hoặc recipients' });
      }
      if (mode === 'production' && normalizedChannel === 'email') {
        return res.status(400).json({
          success: false,
          message: 'Kênh Email chỉ hỗ trợ Fast mode trong diagnostic hiện tại.',
        });
      }
      if (dryRun && normalizedChannel !== 'zalo_personal') {
        return res.status(400).json({
          success: false,
          message: 'Dry-run chỉ hỗ trợ kênh Zalo cá nhân.',
        });
      }

      const cleanRecipients = recipients
        .map((r) => String(r || '').trim())
        .filter(Boolean);

      if (cleanRecipients.length === 0) {
        return res.status(400).json({ success: false, message: 'Danh sách recipients rỗng' });
      }
      if (cleanRecipients.length > maxRecipients) {
        return res.status(400).json({
          success: false,
          message: `Tối đa ${maxRecipients} recipients mỗi lần test${mode === 'production' ? ' production' : ''}`,
        });
      }

      const delay = mode === 'production'
        ? 0
        : Math.min(Math.max(Number(interMessageDelayMs) || 5000, MIN_DELAY_MS), MAX_DELAY_MS);

      const run = await diagnosticRunnerService.createAndStart({
        channel: normalizedChannel,
        accountId: accountId ? Number(accountId) : null,
        messageText: String(messageText).trim(),
        interMessageDelayMs: delay,
        recipients: cleanRecipients,
        createdBy: userId,
        userId,
        roleCode: req.user?.role || null,
        mode,
        dryRun,
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

  async listCampaigns(req, res) {
    try {
      const campaigns = await diagnosticRepository.listZaloCampaigns(100);
      return res.json({ success: true, data: campaigns });
    } catch (err) {
      console.error('[Diagnostic] listCampaigns error:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  async getCampaignPrefill(req, res) {
    try {
      const campaignId = Number(req.params.id);
      if (!Number.isFinite(campaignId)) {
        return res.status(400).json({ success: false, message: 'campaignId không hợp lệ' });
      }
      const { node, phones, messageText } = await diagnosticRepository.getCampaignPrefill(campaignId);
      return res.json({
        success: true,
        data: {
          accountId: node?.zalo_account_id ? Number(node.zalo_account_id) : null,
          messageText,
          phones,
        },
      });
    } catch (err) {
      console.error('[Diagnostic] getCampaignPrefill error:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }
}

export default new DiagnosticController();
