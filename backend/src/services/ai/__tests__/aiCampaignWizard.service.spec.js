import { describe, expect, it } from '@jest/globals';
import {
  applyWizardStateAction,
  buildCampaignBriefQuestion,
  buildCampaignPromptWithWizardState,
  createEmptyWizardState,
  evaluateNextGate,
  extractWizardState,
  isContentPlanRevisionText,
  mergeWizardState,
  normalizeWizardState,
} from '../aiCampaignWizard.service.js';

const readyBrief = {
  version: 1,
  source: 'assistant_campaign_wizard',
  flowMode: 'standard',
  contentMode: 'custom_topic',
  productMode: 'context',
  productIds: [],
  productName: null,
  productDescription: null,
  topicText: 'Chăm sóc khách',
  contentLocale: 'vi',
};

describe('aiCampaignWizard.service', () => {
  it('extracts only gate answers after the latest channel marker', () => {
    const state = extractWizardState([
      { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo"}\nZalo cá nhân' },
      { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"zalo","accountId":1,"accountName":"A"}\nChọn A' },
      { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nĐổi qua email' },
    ]);

    expect(state.channel).toBe('email');
    expect(state.senderAccountId).toBeNull();
  });

  it('asks sender account before datasource even when only one account exists', () => {
    const state = extractWizardState([
      { role: 'user', content: 'Tạo chiến dịch email chăm sóc khách hàng từ DB' },
      { role: 'assistant', type: 'confirm_create', content: 'ok', data: { campaignType: 'email' } },
    ]);

    const gate = evaluateNextGate(state, {
      emailSenders: [{ id: 7, name: 'Sales', email: 'sales@example.com', status: 'active' }],
    });

    expect(gate.gate).toBe('senderAccount');
    expect(gate.response.type).toBe('ask_sender_account');
    expect(gate.response.data.accounts).toHaveLength(1);
  });

  it('returns onboarding card when email sender setup is requested', () => {
    const state = extractWizardState([
      { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' },
      { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","other":true}\nTài khoản khác' },
    ]);

    const gate = evaluateNextGate(state, { emailSenders: [] });

    expect(gate.gate).toBe('senderAccount');
    expect(gate.response.type).toBe('email_setup_guide');
  });

  it('asks group picker for zalo_group after sender account', () => {
    const state = extractWizardState([
      { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo_group"}\nZalo nhóm' },
      { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"zalo_group","accountId":12}\nTK 12' },
    ]);

    const gate = evaluateNextGate(state, {});

    expect(gate.gate).toBe('zaloGroups');
    expect(gate.response).toMatchObject({
      type: 'zalo_group_picker',
      data: { accountId: 12 },
    });
  });

  it('asks campaignBrief before schedule after datasource', () => {
    const state = extractWizardState([
      { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo"}\nZalo' },
      { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"zalo","accountId":12}\nTK 12' },
      { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nDB' },
    ]);

    const gate = evaluateNextGate(state, {
      courses: [{ id: 1, name: 'Khóa A' }, { id: 2, name: 'Khóa B' }],
    });

    expect(gate.gate).toBe('campaignBrief');
    expect(gate.response.data.questions[0].inputType).toBe('campaign_brief');
    expect(gate.response.data.questions[0].options.map((o) => o.value))
      .toEqual(['single_product', 'multiple_products', 'attached_file', 'custom_topic']);
  });

  it('quick-send sets once schedule + email channel from prompt', () => {
    const state = extractWizardState([
      { role: 'user', content: 'Gửi nhanh 1 email cảm ơn đơn hàng' },
    ]);
    expect(state.isCampaignFlow).toBe(true);
    expect(state.channel).toBe('email');
    expect(state.schedule).toEqual({ mode: 'once' });
  });

  it('"tin nhắn đến email X" không được rơi vào nhánh Zalo', () => {
    // Câu thật của người dùng ngày 24/08/2026 — trợ lý từng hỏi chọn tài khoản Zalo.
    const state = extractWizardState([
      { role: 'user', content: 'gửi nhanh cho tôi tin nhắn đến email mtruong909@gmail.com' },
    ]);
    expect(state.channel).toBe('email');
  });

  it('quick-send restores once schedule after channel switch clears it', () => {
    const state = extractWizardState([
      { role: 'user', content: 'Gửi nhanh 1 email cảm ơn đơn hàng' },
      { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' },
    ]);
    expect(state.schedule).toEqual({ mode: 'once' });
    expect(state.markerGates).toEqual(['channel']);
  });

  it('multi-day drip is not forced to once by quick-send wording', () => {
    const state = extractWizardState([
      { role: 'user', content: 'Gửi nhanh 5 email trong 5 ngày chăm sóc khách' },
    ]);
    expect(state.isCampaignFlow).toBe(true);
    expect(state.schedule?.mode).toBe('drip');
    expect(state.schedule?.days).toBe(5);
  });

  it('latest drip intent overrides earlier quick-send once', () => {
    const state = extractWizardState([
      { role: 'user', content: 'Gửi nhanh 1 email cảm ơn đơn hàng' },
      { role: 'user', content: 'Thay đổi: gửi 5 email trong 5 ngày chăm sóc khách' },
    ]);
    expect(state.latestIntentIsQuickSend).toBe(false);
    expect(state.schedule).toMatchObject({ mode: 'drip', days: 5 });
  });

  it('mergeWizardState lets latest drip beat persisted once', () => {
    const derived = extractWizardState([
      { role: 'user', content: 'Gửi nhanh 1 email cảm ơn' },
      { role: 'user', content: 'Gửi 5 email trong 5 ngày' },
    ]);
    const merged = mergeWizardState(
      { isCampaignFlow: true, channel: 'email', schedule: { mode: 'once' } },
      derived,
      { lastUserText: 'Gửi 5 email trong 5 ngày' }
    );
    expect(merged.schedule).toMatchObject({ mode: 'drip', days: 5 });
  });

  it('marker-only history leaves latestIntentIsQuickSend null', () => {
    const state = extractWizardState([
      { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' },
      { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nDB' },
    ]);
    expect(state.latestIntentIsQuickSend).toBeNull();
  });

  it('quick-send with ready context brief skips brief+schedule gates', () => {
    const state = {
      ...extractWizardState([
        { role: 'user', content: 'Gửi nhanh 1 email cảm ơn đơn hàng' },
        { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' },
        { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":7}\nSales' },
        { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nDB' },
      ]),
      brief: {
        ...readyBrief,
        flowMode: 'quick_send',
        contentMode: 'context',
        productMode: 'context',
        topicText: null,
      },
    };
    const gate = evaluateNextGate(state, {
      emailSenders: [{ id: 7, name: 'Sales', email: 'sales@example.com', status: 'active' }],
      courses: [],
    });
    expect(gate).toBeNull();
  });

  it('quick-send without purpose still asks campaignBrief (not schedule)', () => {
    const state = extractWizardState([
      { role: 'user', content: 'Gửi nhanh 1 email' },
      { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' },
      { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":7}\nSales' },
      { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nDB' },
    ]);
    expect(state.schedule).toEqual({ mode: 'once' });
    const gate = evaluateNextGate(state, {
      emailSenders: [{ id: 7, name: 'Sales', email: 'sales@example.com', status: 'active' }],
      courses: [{ id: 1, name: 'Khóa A' }],
    });
    expect(gate.gate).toBe('campaignBrief');
  });

  it('re-asks schedule when drip is missing day count (after brief ready)', () => {
    const state = {
      ...extractWizardState([
        { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' },
        { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":7}\nSales' },
        { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nDB' },
        { role: 'user', content: '[wizard]{"gate":"schedule","value":"drip","mode":"drip"}\nLịch gửi Chuỗi nhiều ngày' },
      ]),
      brief: readyBrief,
    };

    const gate = evaluateNextGate(state, {});

    expect(gate.gate).toBe('schedule');
    expect(gate.response.data.questions[0].options.map((opt) => opt.value)).toEqual(['once', 'drip']);
  });

  it('accepts drip schedule when day count is provided and brief is ready', () => {
    const state = {
      ...extractWizardState([
        { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' },
        { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":7}\nSales' },
        { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nDB' },
        { role: 'user', content: '[wizard]{"gate":"schedule","value":"drip","mode":"drip","days":5,"slotsPerDay":2}\nLịch gửi: 5 ngày, mỗi ngày 2 tin' },
      ]),
      brief: readyBrief,
    };

    const gate = evaluateNextGate(state, {});

    expect(gate).toBeNull();
  });

  it('asks schedule after brief for personal channels', () => {
    const state = {
      ...extractWizardState([
        { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo"}\nZalo' },
        { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"zalo","accountId":12}\nTK 12' },
        { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nDB' },
      ]),
      brief: readyBrief,
    };

    const gate = evaluateNextGate(state, {});

    expect(gate.gate).toBe('schedule');
    expect(gate.response.type).toBe('ask_campaign_details');
  });

  it('shows Zalo QR reconnect when all accounts are disconnected', () => {
    const state = extractWizardState([
      { role: 'user', content: 'Tạo chiến dịch Zalo cá nhân chăm sóc lead landing page' },
    ]);

    const gate = evaluateNextGate(state, {
      zaloAccounts: [
        { id: 1, displayName: 'SIM1', status: 'disconnected', isActive: true },
        { id: 2, displayName: 'Account 2', status: 'disconnected', isActive: true },
      ],
    });

    expect(gate.gate).toBe('senderAccount');
    expect(gate.response.type).toBe('zalo_qr_login');
    expect(gate.response.content).toMatch(/mất kết nối|disconnected/i);
  });

  it('still asks sender picker when at least one Zalo account is connected', () => {
    const state = extractWizardState([
      { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo"}\nZalo' },
    ]);

    const gate = evaluateNextGate(state, {
      zaloAccounts: [
        { id: 1, displayName: 'Offline', status: 'disconnected', isActive: true },
        { id: 2, displayName: 'Online', status: 'connected', isActive: true },
      ],
    });

    expect(gate.gate).toBe('senderAccount');
    expect(gate.response.type).toBe('ask_sender_account');
    expect(gate.response.data.accounts).toHaveLength(2);
    expect(gate.response.data.accounts.filter((account) => account.usable)).toHaveLength(1);
  });

  it('clears stale content plan state when user sends revision feedback', () => {
    const state = {
      ...extractWizardState([
        { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo"}\nZalo' },
        { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"zalo","accountId":12}\nTK 12' },
        { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nDB' },
        { role: 'user', content: '[wizard]{"gate":"schedule","value":"drip","mode":"drip","days":5,"slotsPerDay":1}\n5 ngày' },
        {
          role: 'assistant',
          type: 'content_plan',
          content: 'Kế hoạch 5 ngày',
          data: { totalDays: 5, days: [{ day: 1, channel: 'zalo', slots: [{ channel: 'zalo', summary: 'Chào' }] }] },
        },
        { role: 'user', content: 'Góp ý chỉnh kế hoạch: chỉ 4 ngày thôi' },
      ]),
      brief: readyBrief,
    };

    expect(isContentPlanRevisionText('Góp ý chỉnh kế hoạch: chỉ 4 ngày')).toBe(true);
    expect(state.hasContentPlan).toBe(false);
    expect(state.planApproved).toBe(false);
    expect(evaluateNextGate(state, {})).toBeNull();
  });

  it('infers plan approval from drafted templates when the marker is missing', () => {
    const state = {
      ...extractWizardState([
        { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' },
        { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":7}\nSales' },
        { role: 'user', content: '[wizard]{"gate":"dataSource","value":"sheet"}\nGoogle Sheet' },
        { role: 'user', content: '[wizard]{"gate":"schedule","value":"drip","mode":"drip","days":3,"slotsPerDay":1}\n3 ngày' },
        {
          role: 'assistant',
          type: 'content_plan',
          content: 'Kế hoạch 3 ngày',
          data: { totalDays: 3, days: [{ day: 1, channel: 'email', slots: [{ channel: 'email', summary: 'Ra mắt' }] }] },
        },
        // Không có marker planApproved (mất do session reload) nhưng template đã được soạn
        { role: 'assistant', type: 'template_draft', content: 'Email 1', data: { channel: 'email', templateName: 'Email 1' } },
      ]),
      brief: readyBrief,
    };

    expect(state.planApproved).toBe(true);
    expect(evaluateNextGate(state, {
      emailSenders: [{ id: 7, name: 'Sales', email: 'sales@example.com', status: 'active' }],
    })).toBeNull();
  });

  it('does not infer plan approval from templates drafted without a content plan', () => {
    const state = extractWizardState([
      { role: 'user', content: 'Tạo chiến dịch email ra mắt sản phẩm trong 3 ngày' },
      { role: 'assistant', type: 'template_draft', content: 'Email 1', data: { channel: 'email', templateName: 'Email 1' } },
    ]);

    expect(state.planApproved).toBe(false);
  });

  it('re-asks schedule when free-text infers recurring (not yet supported)', () => {
    const state = {
      ...extractWizardState([
        { role: 'user', content: 'Tạo chiến dịch email gửi mỗi 7 ngày cho khách trong DB' },
        { role: 'assistant', type: 'confirm_create', content: 'ok', data: { campaignType: 'email' } },
        { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":7}\nSales' },
        { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nDB' },
      ]),
      brief: readyBrief,
    };

    const gate = evaluateNextGate(state, {
      emailSenders: [{ id: 7, name: 'Sales', email: 'sales@example.com', status: 'active' }],
    });

    expect(gate.gate).toBe('schedule');
    expect(gate.response.content).toMatch(/lặp định kỳ|recurring/i);
    expect(gate.response.data.questions[0].options.map((o) => o.value)).toEqual(['once', 'drip']);
  });

  it('normalizeWizardState preserves brief and defaults missing brief on v1', () => {
    const withBrief = normalizeWizardState({
      v: 1,
      gates: { channel: 'email' },
      brief: readyBrief,
    });
    expect(withBrief.brief.contentMode).toBe('custom_topic');
    expect(withBrief.brief.topicText).toBe('Chăm sóc khách');

    const legacy = normalizeWizardState({ v: 1, gates: { channel: 'zalo' } });
    expect(legacy.brief).toMatchObject({ contentMode: null, productIds: [] });
    expect(legacy.gates.channel).toBe('zalo');
  });

  it('applyWizardStateAction preserves brief on every PATCH action', () => {
    const base = createEmptyWizardState();
    base.brief = readyBrief;
    base.gates.hasContentPlan = true;
    base.plan.snapshot = { totalDays: 1, days: [] };

    const approved = applyWizardStateAction(base, 'approve_plan');
    expect(approved.state.brief.topicText).toBe('Chăm sóc khách');

    const reset = applyWizardStateAction(approved.state, 'reset_plan');
    expect(reset.state.brief.topicText).toBe('Chăm sóc khách');
    expect(reset.state.gates.hasContentPlan).toBe(false);
  });

  it('buildCampaignBriefQuestion hides multiple_products when <2 courses and supports stale copy', () => {
    const one = buildCampaignBriefQuestion([{ id: 1, name: 'A' }], 'vi');
    expect(one.data.questions[0].options.map((o) => o.value))
      .toEqual(['single_product', 'attached_file', 'custom_topic']);
    expect(one.data.questions[0].courseOptions.at(-1)).toEqual({ value: 'other', label: 'Khác' });

    const stale = buildCampaignBriefQuestion([], 'en', {
      stale: true,
      preferredContentMode: 'single_product',
    });
    expect(stale.content).toMatch(/no longer available/i);
    expect(stale.data.preferredContentMode).toBe('single_product');
  });

  it('buildCampaignPromptWithWizardState appends briefContext after schedule', () => {
    const prompt = buildCampaignPromptWithWizardState(
      { schedule: { mode: 'once' } },
      'Tạo chiến dịch',
      'vi',
      '=== CAMPAIGN_BRIEF DATA ==='
    );
    expect(prompt).toContain('Lịch gửi: gửi một lần.');
    expect(prompt.endsWith('=== CAMPAIGN_BRIEF DATA ===')).toBe(true);
  });

  it('buildDataSourceQuestion includes zalo_contacts only for zalo channel (PR-B)', () => {
    const zaloQuestion = buildCampaignBriefQuestion; // check imports
    const stateZalo = { channel: 'zalo' };
    const stateEmail = { channel: 'email' };

    const gateZalo = evaluateNextGate(
      { isCampaignFlow: true, channel: 'zalo', senderAccountId: 1, dataSource: null },
      {}
    );
    const optionsZalo = gateZalo.response.data.questions[0].options.map((o) => o.value);
    expect(optionsZalo).toContain('zalo_contacts');

    const gateEmail = evaluateNextGate(
      { isCampaignFlow: true, channel: 'email', senderAccountId: 1, dataSource: null },
      {}
    );
    const optionsEmail = gateEmail.response.data.questions[0].options.map((o) => o.value);
    expect(optionsEmail).not.toContain('zalo_contacts');
  });

  it('asks friend picker for zalo channel when dataSource is zalo_contacts and no friends selected (PR-B)', () => {
    const state = extractWizardState([
      { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo"}\nZalo' },
      { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"zalo","accountId":15}\nTK 15' },
      { role: 'user', content: '[wizard]{"gate":"dataSource","value":"zalo_contacts"}\nDanh bạ Zalo' },
    ]);

    const gate = evaluateNextGate(state, {});

    expect(gate.gate).toBe('zaloFriends');
    expect(gate.response).toMatchObject({
      type: 'zalo_friend_picker',
      data: { accountId: 15 },
    });
  });

  describe('PR-1: abandon_campaign_flow & watermark merge', () => {
    it('applyWizardStateAction resets all gates and records abandonedAtMessageCount', () => {
      const initial = normalizeWizardState({
        v: 1,
        gates: {
          isCampaignFlow: true,
          channel: 'email',
          senderAccountId: 10,
          dataSource: 'db',
          hasContentPlan: true,
          planApproved: true,
        },
        plan: {
          snapshot: { days: [{ day: 1 }] },
          savedTemplates: [{ slotId: 'd1-s1', templateId: 99 }],
        },
        meta: { lastGate: 'senderAccount', lastGateCount: 2 },
      });

      const { state, changed } = applyWizardStateAction(initial, 'abandon_campaign_flow', { messageCount: 5 });
      expect(changed).toBe(true);
      expect(state.gates.isCampaignFlow).toBe(false);
      expect(state.gates.channel).toBeNull();
      expect(state.gates.senderAccountId).toBeNull();
      expect(state.gates.dataSource).toBeNull();
      expect(state.gates.abandonedAtMessageCount).toBe(5);
      expect(state.plan.snapshot).toBeNull();
      expect(state.plan.savedTemplates).toEqual([]);
      expect(state.meta.lastGate).toBeNull();
      expect(state.meta.lastGateCount).toBe(0);
    });

    it('mergeWizardState blocks reactivation from historical turns prior to abandon watermark', () => {
      const persistedGates = {
        isCampaignFlow: false,
        channel: 'email',
        senderAccountId: 10,
        abandonedAtMessageCount: 3,
      };

      // History has 3 messages (index 0, 1, 2) where index 0 had a campaign request
      const history = [
        { role: 'user', content: 'tạo chiến dịch' }, // index 0
        { role: 'assistant', content: 'Chọn tài khoản' }, // index 1
        { role: 'user', content: 'thôi' }, // index 2
      ];
      const derived = extractWizardState(history);
      expect(derived.latestCampaignMessageIndex).toBe(0);

      const merged = mergeWizardState(persistedGates, derived, { lastUserText: 'thôi' });
      expect(merged.isCampaignFlow).toBe(false);
      expect(merged.channel).toBeNull();
      expect(merged.senderAccountId).toBeNull();
      expect(merged.abandonedAtMessageCount).toBe(3);
    });

    it('mergeWizardState allows reactivation when new campaign intent arrives after abandon watermark', () => {
      const persistedGates = {
        isCampaignFlow: false,
        channel: 'email',
        senderAccountId: 10,
        abandonedAtMessageCount: 3,
      };

      // History now has 5 messages (indexes 0, 1, 2, 3, 4) where index 4 has a new campaign request
      const history = [
        { role: 'user', content: 'tạo chiến dịch' }, // index 0
        { role: 'assistant', content: 'Chọn tài khoản' }, // index 1
        { role: 'user', content: 'thôi' }, // index 2
        { role: 'assistant', content: 'Đã dừng.' }, // index 3
        { role: 'user', content: 'tôi muốn tạo chiến dịch Zalo mới' }, // index 4
      ];
      const derived = extractWizardState(history);
      expect(derived.latestCampaignMessageIndex).toBe(4);

      const merged = mergeWizardState(persistedGates, derived, { lastUserText: 'tôi muốn tạo chiến dịch Zalo mới' });
      expect(merged.isCampaignFlow).toBe(true);
      expect(merged.channel).toBeNull();
      expect(merged.abandonedAtMessageCount).toBeNull();
    });

    it('extractWizardState ignores pre-abandon markers and starts fresh on new generic campaign intent', () => {
      // History has old campaign turns at 0, 1, 2, 3: channel email, sender 7, dataSource db
      const history = [
        { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' }, // 0
        { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":7}\nTK 7' }, // 1
        { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nDB' }, // 2
        { role: 'user', content: 'thôi' }, // 3
        { role: 'assistant', content: 'Đã dừng.' }, // 4 (abandonedAtMessageCount = 4)
        { role: 'user', content: 'tạo chiến dịch quảng cáo khoá học mới' }, // 5 (new generic intent)
      ];

      const derived = extractWizardState(history, { abandonedAtMessageCount: 4 });
      expect(derived.isCampaignFlow).toBe(true);
      expect(derived.latestCampaignMessageIndex).toBe(5);
      expect(derived.channel).toBeNull();
      expect(derived.senderAccountId).toBeNull();
      expect(derived.dataSource).toBeNull();

      const persistedGates = {
        isCampaignFlow: false,
        channel: null,
        senderAccountId: null,
        dataSource: null,
        abandonedAtMessageCount: 4,
      };
      const merged = mergeWizardState(persistedGates, derived, { lastUserText: 'tạo chiến dịch quảng cáo khoá học mới' });
      expect(merged.isCampaignFlow).toBe(true);
      expect(merged.channel).toBeNull();
      expect(merged.senderAccountId).toBeNull();
      expect(merged.dataSource).toBeNull();
      expect(merged.abandonedAtMessageCount).toBeNull();
    });
  });

  describe('PR-3: routeSaysActionRequest router integration', () => {
    it('activates isCampaignFlow and infers channel when routeSaysActionRequest is true', () => {
      const history = [
        { role: 'user', content: 'gửi giúp tôi tin nhắn tới số 0908800216' },
      ];
      // Regex might not match standard campaign patterns, but router classifies as làm_giúp
      const stateWithoutRouter = extractWizardState(history);
      const stateWithRouter = extractWizardState(history, { routeSaysActionRequest: true });

      expect(stateWithRouter.isCampaignFlow).toBe(true);
      expect(stateWithRouter.latestCampaignMessageIndex).toBe(0);
      expect(stateWithRouter.channel).toBeNull(); // Requires disambiguation
    });
  });

  describe('PR-0: schedule inference & machine plan request loop prevention', () => {
    it('infers slotsPerDay from natural language text', () => {
      const state1 = extractWizardState([
        { role: 'user', content: 'gửi 5 email trong 3 ngày, mỗi ngày 2 tin' },
      ]);
      expect(state1.schedule).toEqual({ mode: 'drip', days: 3, slotsPerDay: 2 });

      const state2 = extractWizardState([
        { role: 'user', content: 'tạo chiến dịch 4 ngày 3 tin mỗi ngày' },
      ]);
      expect(state2.schedule).toEqual({ mode: 'drip', days: 4, slotsPerDay: 3 });

      const state3 = extractWizardState([
        { role: 'user', content: 'chiến dịch email trong 5 ngày, 2 tin/ngày' },
      ]);
      expect(state3.schedule).toEqual({ mode: 'drip', days: 5, slotsPerDay: 2 });
    });

    it('retains schedule and slotsPerDay when machine content_plan_request prompt is sent', () => {
      const history = [
        { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' },
        { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":1}\nTK 1' },
        { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nDB' },
        { role: 'user', content: '[wizard]{"gate":"schedule","mode":"drip","days":3,"slotsPerDay":2}\n3 ngày, 2 tin/ngày' },
        { role: 'assistant', type: 'suggest_content_plan', content: 'Gợi ý kế hoạch', data: { userPrompt: 'Kênh gửi: email. Lịch gửi: chuỗi 3 ngày, mỗi ngày 2 tin.' } },
        { role: 'user', content: 'Hãy trả về content_plan JSON (kế hoạch từng ngày, không viết full nội dung tin) cho:\nKênh gửi: email.\nLịch gửi: chuỗi 3 ngày, mỗi ngày 2 tin.' },
      ];

      const state = extractWizardState(history, { intent: 'content_plan_request' });
      expect(state.schedule).toEqual({ mode: 'drip', days: 3, slotsPerDay: 2 });
    });

    it('isolated guard: keeps slotsPerDay from prior marker even when machine prompt text has no slots', () => {
      // Prompt text deliberately lacks any "mỗi ngày N tin" mentions, only says "chuỗi 3 ngày"
      const history = [
        { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' },
        { role: 'user', content: '[wizard]{"gate":"schedule","mode":"drip","days":3,"slotsPerDay":4}\n3 ngày, 4 tin/ngày' },
        { role: 'assistant', type: 'suggest_content_plan', content: 'Gợi ý kế hoạch', data: { userPrompt: 'chuỗi 3 ngày' } },
        { role: 'user', content: 'Hãy trả về content_plan JSON (kế hoạch từng ngày, không viết full nội dung tin) cho: chuỗi 3 ngày' },
      ];

      const state = extractWizardState(history, { intent: 'content_plan_request' });
      expect(state.schedule).toEqual({ mode: 'drip', days: 3, slotsPerDay: 4 });
    });
  });

  describe('attached_file brief & spreadsheet dataSource gates', () => {
    it('asks campaignBrief with reminder to attach file when attached_file chosen without file (auto-infers preferredMode from brief)', () => {
      const state = {
        isCampaignFlow: true,
        channel: 'email',
        senderAccountId: 1,
        dataSource: 'db',
        brief: {
          contentMode: 'attached_file',
          productMode: 'attached_file',
        },
        hasAttachedFile: false,
      };

      // Even without passing briefPreferredContentMode in resources, evaluateNextGate infers from state.brief
      const gate = evaluateNextGate(state, {});

      expect(gate.gate).toBe('campaignBrief');
      expect(gate.response.content).toBe('Bạn đính kèm file (Excel, Word, PDF...) rồi bấm Tiếp tục nhé.');
      expect(gate.response.data.preferredContentMode).toBe('attached_file');
    });

    it('advances to schedule when attached_file chosen and file is attached', () => {
      const state = {
        isCampaignFlow: true,
        channel: 'email',
        senderAccountId: 1,
        dataSource: 'db',
        brief: {
          contentMode: 'attached_file',
          productMode: 'attached_file',
          hasAttachedFile: true,
        },
        hasAttachedFile: true,
      };

      const gate = evaluateNextGate(state, {});
      expect(gate.gate).toBe('schedule');
    });

    it('dataSource sheet stops when no sheetUrl and no file attached', () => {
      const state = {
        isCampaignFlow: true,
        channel: 'email',
        senderAccountId: 1,
        dataSource: 'sheet',
        sheetUrl: null,
        hasAttachedSpreadsheet: false,
        hasAttachedFile: false,
      };

      const gate = evaluateNextGate(state, {});
      expect(gate).toBeNull();
    });

    it('dataSource sheet advances to campaignBrief when spreadsheet file is attached', () => {
      const state = {
        isCampaignFlow: true,
        channel: 'email',
        senderAccountId: 1,
        dataSource: 'sheet',
        sheetUrl: null,
        hasAttachedSpreadsheet: true,
        hasAttachedFile: true,
      };

      const gate = evaluateNextGate(state, {
        courses: [{ id: 1, name: 'Khóa A' }, { id: 2, name: 'Khóa B' }],
      });
      expect(gate.gate).toBe('campaignBrief');
    });

    it('extractWizardState detects spreadsheet files from message history or options during campaign flow', () => {
      const state = extractWizardState([
        {
          role: 'user',
          content: 'Gửi danh sách từ file',
          files: [{ originalName: 'recipients.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }],
        },
      ]);
      expect(state.hasAttachedFile).toBe(true);
      expect(state.hasAttachedSpreadsheet).toBe(true);
    });

    it('extractWizardState ignores files uploaded before the campaign flow started', () => {
      const history = [
        {
          role: 'user',
          content: 'Đọc giúp tôi tài liệu này',
          files: [{ originalName: 'doc.pdf', contentType: 'application/pdf' }],
        },
        {
          role: 'assistant',
          content: 'Tôi đã đọc tài liệu.',
        },
        {
          role: 'user',
          content: 'Tạo chiến dịch email',
        },
      ];

      const state = extractWizardState(history);
      expect(state.isCampaignFlow).toBe(true);
      // File attached at index 0 (before campaign started at index 2) must NOT leak into campaign state
      expect(state.hasAttachedFile).toBe(false);
      expect(state.hasAttachedSpreadsheet).toBe(false);
    });
  });
});

