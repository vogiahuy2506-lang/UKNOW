import { describe, expect, it } from 'vitest';
import vi from '../../../../i18n/vi.js';
import en from '../../../../i18n/en.js';
import {
  AUDIENCE_TYPES_BY_CHANNEL,
  EMPTY_AUDIENCE,
  SIMPLE_CHANNELS,
  SIMPLE_STEP_IDS,
  WHEN_OPTION_IDS,
  applyChannelChange,
  applySenderChange,
  buildSimpleCampaignBody,
  createInitialWizardState,
  describeIssue,
  isStepComplete,
  mapEmailAccounts,
  mapZaloAccounts,
  normalizePreview,
  parseManualRecipients,
  unwrapResponseData,
} from '../simpleCampaign.helpers';

const stateWith = (patch = {}) => {
  const base = createInitialWizardState();
  return {
    ...base,
    ...patch,
    audience: { ...base.audience, ...(patch.audience || {}) },
    content: { ...base.content, ...(patch.content || {}) },
  };
};

describe('applyChannelChange — đổi kênh xoá lựa chọn không còn hợp lệ', () => {
  it('Zalo cá nhân → Email: bỏ "Bạn bè Zalo" và tài khoản Zalo, nguồn dùng chung (biểu mẫu) được giữ', () => {
    const zalo = stateWith({
      channel: 'zalo',
      sender: { id: 21, label: 'Nick A' },
      audience: { type: 'zalo_friends', uids: ['u1'] },
    });
    const toEmail = applyChannelChange(zalo, 'email');
    expect(toEmail.channel).toBe('email');
    expect(toEmail.sender).toBeNull();
    expect(toEmail.audience.type).toBeNull();
    expect(toEmail.audience.uids).toEqual([]);

    const withForm = applyChannelChange(
      stateWith({ channel: 'email', sender: { id: 11, label: 'shop@abc.vn' }, audience: { type: 'form', formIds: [7], formTitles: ['A'] } }),
      'zalo'
    );
    expect(withForm.audience.type).toBe('form');
    expect(withForm.audience.formIds).toEqual([7]);
    expect(withForm.sender).toBeNull(); // email ↔ Zalo: khác loại tài khoản
  });

  it('sang Zalo nhóm: chọn sẵn nguồn "Chọn nhóm" và dọn nguồn cũ; rời Zalo nhóm thì bỏ danh sách nhóm', () => {
    const email = stateWith({ channel: 'email', audience: { type: 'form', formIds: [7], formTitles: ['A'] } });
    const group = applyChannelChange(email, 'zalo_group');
    expect(group.audience.type).toBe('zalo_groups');
    expect(group.audience.formIds).toEqual([]);

    const picked = { ...group, sender: { id: 21, label: 'Nick A' }, audience: { ...group.audience, groupIds: ['g1'], groupNames: ['VIP'] } };
    const back = applyChannelChange(picked, 'zalo');
    expect(back.audience.type).toBeNull();
    expect(back.audience.groupIds).toEqual([]);
    expect(back.sender).toEqual({ id: 21, label: 'Nick A' }); // Zalo cá nhân ↔ nhóm dùng chung tài khoản
  });

  it('"Tự nhập" đổi giữa email ↔ số điện thoại thì xoá chữ đã gõ; Zalo cá nhân ↔ nhóm giữ nguyên mẫu tin', () => {
    const email = stateWith({ channel: 'email', audience: { type: 'manual', manualText: 'a@b.com' } });
    expect(applyChannelChange(email, 'zalo').audience.manualText).toBe('');

    const tpl = stateWith({ channel: 'zalo', content: { mode: 'template', templateId: 5, templateName: 'X' } });
    expect(applyChannelChange(tpl, 'zalo_group').content.templateId).toBe(5);
    expect(applyChannelChange(tpl, 'email').content.templateId).toBeNull();
    expect(applyChannelChange(stateWith({ channel: 'email', content: { mode: 'custom', body: 'xin chào' } }), 'zalo').content.body).toBe('xin chào');
  });

  it('cùng kênh thì không đổi gì', () => {
    const state = stateWith({ channel: 'email' });
    expect(applyChannelChange(state, 'email')).toBe(state);
  });
});

describe('applySenderChange', () => {
  it('đổi tài khoản thì bỏ nhóm/bạn bè của nick cũ; chọn lại đúng tài khoản đó thì giữ', () => {
    const state = stateWith({
      channel: 'zalo_group',
      sender: { id: 21, label: 'A' },
      audience: { type: 'zalo_groups', groupIds: ['g1'], groupNames: ['VIP'], uids: ['u1'] },
    });
    expect(applySenderChange(state, { id: 21, label: 'A' }).audience.groupIds).toEqual(['g1']);
    const changed = applySenderChange(state, { id: 22, label: 'B' });
    expect(changed.audience.groupIds).toEqual([]);
    expect(changed.audience.groupNames).toEqual([]);
    expect(changed.audience.uids).toEqual([]);
  });
});

describe('parseManualRecipients', () => {
  it('email: tách theo xuống dòng/phẩy/khoảng trắng, viết thường, bỏ trùng, báo mục sai', () => {
    const { valid, invalid } = parseManualRecipients('A@Gmail.com, b@x.vn\nA@gmail.com; khong-phai-email', 'email');
    expect(valid).toEqual(['a@gmail.com', 'b@x.vn']);
    expect(invalid).toEqual(['khong-phai-email']);
  });

  it('số điện thoại: chuẩn hoá +84/84/9 số về 0xxxxxxxxx, bỏ trùng, báo mục sai', () => {
    const { valid, invalid } = parseManualRecipients('0901 234 567\n+84912345678\n912345678\n12345', 'phone');
    expect(valid).toEqual(['0901234567', '0912345678']);
    expect(invalid).toEqual(['12345']);
  });

  it('số điện thoại: khoảng trắng TRONG số không làm vỡ số, hai số cách nhau bằng khoảng trắng vẫn tách được, dòng gõ thiếu số báo sai nguyên dòng', () => {
    expect(parseManualRecipients('0901 234 567', 'phone')).toEqual({ valid: ['0901234567'], invalid: [] });
    expect(parseManualRecipients('0901234567 0912345678', 'phone')).toEqual({ valid: ['0901234567', '0912345678'], invalid: [] });
    expect(parseManualRecipients('0901 234 56', 'phone')).toEqual({ valid: [], invalid: ['0901 234 56'] });
  });
});

describe('isStepComplete', () => {
  it('bước kênh cần kênh VÀ tài khoản gửi', () => {
    expect(isStepComplete('channel', stateWith())).toBe(false);
    expect(isStepComplete('channel', stateWith({ channel: 'email' }))).toBe(false);
    expect(isStepComplete('channel', stateWith({ channel: 'email', sender: { id: 11, label: 'x' } }))).toBe(true);
  });

  it('Zalo nhóm: PHẢI có ít nhất 1 nhóm (nhóm rỗng = server gửi mọi nhóm của nick)', () => {
    const base = { channel: 'zalo_group', sender: { id: 21, label: 'A' } };
    expect(isStepComplete('audience', stateWith({ ...base, audience: { type: 'zalo_groups', groupIds: [] } }))).toBe(false);
    expect(isStepComplete('audience', stateWith({ ...base, audience: { type: 'zalo_groups', groupIds: ['g1'] } }))).toBe(true);
  });

  it('nguồn không thuộc kênh thì không hợp lệ dù có dữ liệu', () => {
    expect(isStepComplete('audience', stateWith({ channel: 'email', audience: { type: 'zalo_friends', uids: ['u1'] } }))).toBe(false);
  });

  it('từng nguồn: landing/biểu mẫu cần ≥1 mục, Google Sheet cần "Kiểm tra" đúng link, nhập tay không được còn mục sai', () => {
    const email = { channel: 'email' };
    expect(isStepComplete('audience', stateWith({ ...email, audience: { type: 'landing', slugs: [] } }))).toBe(false);
    expect(isStepComplete('audience', stateWith({ ...email, audience: { type: 'landing', slugs: ['l'] } }))).toBe(true);
    expect(isStepComplete('audience', stateWith({ ...email, audience: { type: 'form', formIds: [] } }))).toBe(false);
    expect(isStepComplete('audience', stateWith({ ...email, audience: { type: 'form', formIds: [7] } }))).toBe(true);
    expect(isStepComplete('audience', stateWith({ ...email, audience: { type: 'sheet', sheetUrl: 'https://s/1', sheetCheckedUrl: '' } }))).toBe(false);
    expect(isStepComplete('audience', stateWith({ ...email, audience: { type: 'sheet', sheetUrl: 'https://s/1', sheetCheckedUrl: 'https://s/1' } }))).toBe(true);
    expect(isStepComplete('audience', stateWith({ ...email, audience: { type: 'sheet', sheetUrl: 'https://s/2', sheetCheckedUrl: 'https://s/1' } }))).toBe(false);
    expect(isStepComplete('audience', stateWith({ ...email, audience: { type: 'manual', manualText: '' } }))).toBe(false);
    expect(isStepComplete('audience', stateWith({ ...email, audience: { type: 'manual', manualText: 'a@b.com' } }))).toBe(true);
    expect(isStepComplete('audience', stateWith({ ...email, audience: { type: 'manual', manualText: 'a@b.com, sai' } }))).toBe(false);
    expect(isStepComplete('audience', stateWith({ ...email, audience: { type: 'customers' } }))).toBe(true);
    expect(isStepComplete('audience', stateWith({ ...email, audience: { type: 'customers', customerTotal: 0 } }))).toBe(false);
  });

  it('nội dung: mẫu cần templateId; tự soạn cần chữ (email cần thêm tiêu đề)', () => {
    expect(isStepComplete('content', stateWith({ channel: 'email' }))).toBe(false);
    expect(isStepComplete('content', stateWith({ channel: 'email', content: { mode: 'template', templateId: null } }))).toBe(false);
    expect(isStepComplete('content', stateWith({ channel: 'email', content: { mode: 'template', templateId: 5 } }))).toBe(true);
    expect(isStepComplete('content', stateWith({ channel: 'email', content: { mode: 'custom', subject: '', body: 'Xin chào' } }))).toBe(false);
    expect(isStepComplete('content', stateWith({ channel: 'email', content: { mode: 'custom', subject: 'Tiêu đề', body: '  ' } }))).toBe(false);
    expect(isStepComplete('content', stateWith({ channel: 'email', content: { mode: 'custom', subject: 'Tiêu đề', body: 'Xin chào' } }))).toBe(true);
    expect(isStepComplete('content', stateWith({ channel: 'zalo', content: { mode: 'custom', subject: '', body: 'Xin chào' } }))).toBe(true);
  });

  it('bước "Khi nào gửi": chọn sẵn Gửi ngay', () => {
    expect(isStepComplete('when', createInitialWizardState())).toBe(true);
  });
});

describe('buildSimpleCampaignBody — đúng hợp đồng PR-1', () => {
  const sender = { id: 11, label: 'shop@abc.vn' };

  it('email + biểu mẫu + mẫu có sẵn', () => {
    const body = buildSimpleCampaignBody(stateWith({
      channel: 'email',
      sender,
      audience: { type: 'form', formIds: [7, 8], formTitles: ['A', 'B'], slugs: ['bo-qua'] },
      content: { mode: 'template', templateId: 5, templateName: 'Ưu đãi' },
      campaignName: '  Chiến dịch X ',
    }));
    expect(body).toEqual({
      campaignName: 'Chiến dịch X',
      channel: 'email',
      senderId: 11,
      audience: { type: 'form', formIds: [7, 8] },
      content: { mode: 'template', templateId: 5 },
    });
  });

  it('email + tự nhập + tự soạn: emails viết thường, có subject; tên trống thì không gửi campaignName', () => {
    const body = buildSimpleCampaignBody(stateWith({
      channel: 'email',
      sender,
      audience: { type: 'manual', manualText: 'A@x.vn\nb@y.vn' },
      content: { mode: 'custom', subject: ' Tiêu đề ', body: ' Xin chào ' },
    }));
    expect(body).toEqual({
      channel: 'email',
      senderId: 11,
      audience: { type: 'manual', emails: ['a@x.vn', 'b@y.vn'] },
      content: { mode: 'custom', subject: 'Tiêu đề', body: 'Xin chào' },
    });
  });

  it('Zalo cá nhân + khách đã lưu: KHÔNG có subject, KHÔNG dùng nguồn db', () => {
    const body = buildSimpleCampaignBody(stateWith({
      channel: 'zalo',
      sender: { id: 21, label: 'Nick A' },
      audience: { type: 'customers' },
      content: { mode: 'custom', subject: 'bỏ qua', body: 'Chào bạn' },
    }));
    expect(body.audience).toEqual({ type: 'customers' });
    expect(body.content).toEqual({ mode: 'custom', body: 'Chào bạn' });
    expect(body.senderId).toBe(21);
  });

  it('Zalo nhóm + nhóm: groupIds là chuỗi; Zalo cá nhân + tự nhập: phones; Zalo + bạn bè: uids; landing: slugs; sheet: sheetUrl (+ sheetName khi có)', () => {
    const group = buildSimpleCampaignBody(stateWith({
      channel: 'zalo_group',
      sender: { id: 21, label: 'A' },
      audience: { type: 'zalo_groups', groupIds: [123, 'g2'], groupNames: ['a', 'b'] },
      content: { mode: 'template', templateId: 9 },
    }));
    expect(group.audience).toEqual({ type: 'zalo_groups', groupIds: ['123', 'g2'] });

    const phones = buildSimpleCampaignBody(stateWith({
      channel: 'zalo', sender: { id: 21, label: 'A' },
      audience: { type: 'manual', manualText: '0901 234 567' },
      content: { mode: 'custom', body: 'x' },
    }));
    expect(phones.audience).toEqual({ type: 'manual', phones: ['0901234567'] });

    const friends = buildSimpleCampaignBody(stateWith({
      channel: 'zalo', sender: { id: 21, label: 'A' },
      audience: { type: 'zalo_friends', uids: ['111', '222'] },
      content: { mode: 'custom', body: 'x' },
    }));
    expect(friends.audience).toEqual({ type: 'zalo_friends', uids: ['111', '222'] });

    const landing = buildSimpleCampaignBody(stateWith({
      channel: 'email', sender,
      audience: { type: 'landing', slugs: ['l', 'khoa-hoc'] },
      content: { mode: 'custom', subject: 's', body: 'x' },
    }));
    expect(landing.audience).toEqual({ type: 'landing', slugs: ['l', 'khoa-hoc'] });

    const sheet = buildSimpleCampaignBody(stateWith({
      channel: 'email', sender,
      audience: { type: 'sheet', sheetUrl: ' https://docs.google.com/spreadsheets/d/abc ', sheetName: 'Tab 2', sheetCheckedUrl: 'x' },
      content: { mode: 'custom', subject: 's', body: 'x' },
    }));
    expect(sheet.audience).toEqual({ type: 'sheet', sheetUrl: 'https://docs.google.com/spreadsheets/d/abc', sheetName: 'Tab 2' });
  });
});

describe('phản hồi server', () => {
  it('unwrapResponseData mở lớp { data } và chấp nhận thân phẳng', () => {
    expect(unwrapResponseData({ data: { success: true, data: { campaignId: 5 } } })).toEqual({ campaignId: 5 });
    expect(unwrapResponseData({ data: { readyToCreate: true } })).toEqual({ readyToCreate: true });
    expect(unwrapResponseData(undefined)).toEqual({});
  });

  it('normalizePreview: readyToCreate chỉ true khi server nói đúng true; recipientCount lạ → null', () => {
    expect(normalizePreview({}).readyToCreate).toBe(false);
    expect(normalizePreview({ readyToCreate: 'true' }).readyToCreate).toBe(false);
    expect(normalizePreview({ readyToCreate: true, recipientCount: '12', issues: ['a'] })).toMatchObject({ readyToCreate: true, recipientCount: 12, issues: ['a'] });
    expect(normalizePreview({ readyToCreate: true, recipientCount: null }).recipientCount).toBeNull();
    expect(normalizePreview({ readyToCreate: true, recipientCount: 0 }).recipientCount).toBe(0);
  });

  it('describeIssue: chuỗi, { message }, { code } có bản dịch, còn lại câu chung', () => {
    const t = (key) => (key === 'simpleCampaign.issues.known' ? 'Câu đã dịch' : key === 'simpleCampaign.issues.unknown' ? 'Câu chung' : key);
    expect(describeIssue('Nick Zalo mất kết nối', t)).toBe('Nick Zalo mất kết nối');
    expect(describeIssue({ message: 'Sheet không đọc được' }, t)).toBe('Sheet không đọc được');
    expect(describeIssue({ code: 'known' }, t)).toBe('Câu đã dịch');
    expect(describeIssue({ code: 'khong-co' }, t)).toBe('Câu chung');
    expect(describeIssue(null, t)).toBe('Câu chung');
  });

  it('mapZaloAccounts: chỉ tài khoản đang kết nối, bật, không bị khoá mới chọn được; mapEmailAccounts dùng địa chỉ email làm nhãn', () => {
    const accounts = mapZaloAccounts([
      { id: 21, displayName: 'Nick A', status: 'connected', isActive: true, isLocked: false },
      { id: 22, displayName: 'Nick B', status: 'disconnected', isActive: true },
      { id: 23, displayName: '0901234567890', zaloName: 'Tên thật', status: 'connected', isActive: true, isLocked: true },
      { id: 24, displayName: 'Nick D', status: 'connected', isActive: false },
    ]);
    expect(accounts.map((a) => [a.id, a.usable, a.problem])).toEqual([
      [21, true, null],
      [22, false, 'disconnected'],
      [23, false, 'locked'],
      [24, false, 'disconnected'],
    ]);
    expect(accounts[2].label).toBe('Tên thật'); // không hiện id Zalo trần
    expect(mapEmailAccounts([{ id: 11, name: 'Shop', email: 'shop@abc.vn' }])).toEqual([
      expect.objectContaining({ id: 11, label: 'shop@abc.vn', sublabel: 'Shop', usable: true }),
    ]);
  });
});

describe('bảng nguồn người nhận theo kênh', () => {
  it('Bạn bè Zalo chỉ có ở Zalo cá nhân; Zalo nhóm chỉ có "Chọn nhóm"', () => {
    expect(AUDIENCE_TYPES_BY_CHANNEL.email).not.toContain('zalo_friends');
    expect(AUDIENCE_TYPES_BY_CHANNEL.zalo).toContain('zalo_friends');
    expect(AUDIENCE_TYPES_BY_CHANNEL.zalo_group).toEqual(['zalo_groups']);
    expect(Object.keys(AUDIENCE_TYPES_BY_CHANNEL).sort()).toEqual([...SIMPLE_CHANNELS].sort());
    expect(EMPTY_AUDIENCE.groupIds).toEqual([]);
  });
});

describe('i18n simpleCampaign — mọi khoá dựng động có đủ ở vi và en', () => {
  const resolve = (dict, key) => key.split('.').reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), dict);

  const keys = [
    ...SIMPLE_STEP_IDS.map((id) => `steps.${id}`),
    ...SIMPLE_CHANNELS.flatMap((id) => [`channel.${id}.title`, `channel.${id}.desc`, `review.channelName.${id}`]),
    ...Object.values(AUDIENCE_TYPES_BY_CHANNEL).flat().flatMap((type) => [
      `audience.types.${type}.title`,
      `review.audience.${type}`,
      ...(type === 'customers' || type === 'manual'
        ? [`audience.types.${type}.descEmail`, `audience.types.${type}.descPhone`]
        : [`audience.types.${type}.desc`]),
    ]),
    ...WHEN_OPTION_IDS.flatMap((id) => [`when.${id}.title`, `when.${id}.desc`, `review.when.${id}`]),
    'needs.channel', 'needs.audience', 'needs.audienceGroups', 'needs.content', 'needs.when',
    'audience.manual.labelEmail', 'audience.manual.labelPhone', 'audience.manual.placeholderEmail', 'audience.manual.placeholderPhone',
    'issues.unknown',
  ].map((key) => `simpleCampaign.${key}`);

  it.each([['vi', vi], ['en', en]])('%s', (_locale, dict) => {
    const missing = keys.filter((key) => typeof resolve(dict, key) !== 'string');
    expect(missing).toEqual([]);
  });
});
