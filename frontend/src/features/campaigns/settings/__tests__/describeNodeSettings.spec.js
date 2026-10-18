import { describe, expect, it } from 'vitest';
import vi from '../../../../i18n/vi';
import en from '../../../../i18n/en';
import { getAllNodeConfigs } from '../../components/CampaignBuilderFlowNodes';
import describeNodeSettings, { DESCRIBED_NODE_SUBTYPES } from '../describeNodeSettings';

/** `t` thật: tra khoá lồng nhau trong từ điển, thay `{tham_số}` như i18n/index.jsx. */
const makeT = (dictionary, usedKeys = null) => (key, params = {}) => {
  usedKeys?.add(key);
  const raw = key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), dictionary);
  if (typeof raw !== 'string') return key;
  return raw.replace(/\{(\w+)\}/g, (_, name) => (params[name] === undefined ? `{${name}}` : String(params[name])));
};
const t = makeT(vi);

const node = (nodeType, config = {}, extra = {}) => ({
  id: extra.id || `${nodeType}-1`,
  type: 'task',
  data: { label: extra.label ?? '', nodeType, config },
});

const SHEET = node('read_sheet', { sheetUrl: 'https://docs.google.com/spreadsheets/d/abc', sheetName: 'Tháng 10' }, { id: 'sheet1', label: 'Danh sách khách' });
const SELECT_ZALO = node('select_zalo_account', { zaloAccountId: '5' }, { id: 'acc1', label: 'Chọn tài khoản' });
const GROUPS_NODE = node('get_all_groups', { zaloSelectedGroupIds: ['g1', 'g2', 'g3'], zaloGroupAccountNodeId: 'acc1' }, { id: 'grp1', label: 'Lấy nhóm' });

const lookups = {
  emailTemplates: [
    { id: 7, templateName: 'Chào mừng' },
    { id: 8, templateName: 'Nhắc lại' },
    { id: 9, templateName: 'Ưu đãi cuối' },
  ],
  zaloTemplates: [
    { id: 21, templateName: 'Mời tham gia nhóm' },
    { id: 22, templateName: 'Nhắc lịch học' },
  ],
  emailSettings: [{ id: 3, name: 'CSKH', email: 'cskh@abc.vn' }],
  zaloAccounts: [{ id: '5', displayName: 'Shop Hoa' }, { id: '6', displayName: 'Shop Lan' }],
  telegramAccounts: [{ id: 4, name: 'Bot A', username: 'bota' }],
  whatsappAccounts: [{ sessionKey: '40-default', display: '+84 912 345 678' }],
  nodes: [SHEET, SELECT_ZALO, GROUPS_NODE],
};

/** ["Nhãn: giá trị", …] để so thẳng chữ người dùng nhìn thấy. */
const text = (target, overrides = lookups) => describeNodeSettings(target, overrides, t).map((line) => `${line.label}: ${line.value}`);
const tones = (target) => describeNodeSettings(target, lookups, t).map((line) => line.tone);

describe('describeNodeSettings — bảng subtype', () => {
  it('ghim TỪNG subtype có nhánh tóm tắt (đổi bảng này là cố ý)', () => {
    expect([...DESCRIBED_NODE_SUBTYPES]).toEqual([
      'manual_trigger',
      'send_email',
      'send_zalo_personal',
      'send_zalo_friend_request',
      'send_zalo_group',
      'send_telegram',
      'send_whatsapp',
      'condition',
      'tag_contact',
      'update_attribute',
      'read_sheet',
      'read_courses_db',
      'read_products_db',
      'read_interested_customers',
      'read_landing_leads',
      'read_form_submissions',
      'save_customer',
      'select_zalo_account',
      'get_all_friends',
      'get_all_groups',
    ]);
  });

  it('mọi subtype trong registry nodeConfigs đều có nhánh tóm tắt (thêm khối mới mà quên tóm tắt thì đỏ ở đây)', () => {
    const registryTypes = getAllNodeConfigs().map((item) => item.type);
    expect(registryTypes.filter((type) => !DESCRIBED_NODE_SUBTYPES.includes(type))).toEqual([]);
    expect(DESCRIBED_NODE_SUBTYPES.filter((type) => !registryTypes.includes(type))).toEqual([]);
  });

  it('subtype lạ → một dòng chung, không ném lỗi', () => {
    const lines = describeNodeSettings(node('mystery_block'), lookups, t);
    expect(lines).toEqual([{ label: 'Cài đặt', value: 'Bấm Sửa để xem cài đặt', tone: 'normal', role: 'other' }]);
    expect(describeNodeSettings(null, lookups, t)).toHaveLength(1);
    // Tên trùng thuộc tính của Object.prototype không được trúng nhánh nào.
    expect(describeNodeSettings(node('constructor'), lookups, t)[0].value).toBe('Bấm Sửa để xem cài đặt');
  });
});

describe('describeNodeSettings — email', () => {
  const base = {
    fromEmailId: 3,
    recipientSource: 'node',
    recipientNodeId: 'sheet1',
    recipientField: 'email',
  };

  it('chuỗi 3 tin: tài khoản theo TÊN, người nhận, từng mẫu theo TÊN + nhịp chờ', () => {
    const lines = text(node('send_email', {
      ...base,
      sendMode: 'schedule',
      emailSteps: [
        { templateId: 7, delayValue: 0, delayUnit: 'minutes', delayFrom: 'start' },
        { templateId: 8, delayValue: 2, delayUnit: 'days', delayFrom: 'prev' },
        { templateId: 9, delayValue: 5, delayUnit: 'days', delayFrom: 'start' },
      ],
    }));
    expect(lines).toEqual([
      'Gửi từ: CSKH (cskh@abc.vn)',
      'Gửi cho: Từ khối “Danh sách khách”, cột “email”',
      'Tin 1: Chào mừng · gửi ngay',
      'Tin 2: Nhắc lại · 2 ngày sau tin trước',
      'Tin 3: Ưu đãi cuối · 5 ngày sau tin đầu',
    ]);
  });

  it('tin đầu có chờ → "sau khi chạy"; đơn vị phút/giờ', () => {
    const lines = text(node('send_email', {
      ...base,
      sendMode: 'schedule',
      emailSteps: [
        { templateId: 7, delayValue: 30, delayUnit: 'minutes', delayFrom: 'start' },
        { templateId: 8, delayValue: 3, delayUnit: 'hours', delayFrom: 'prev' },
      ],
    }));
    expect(lines.slice(2)).toEqual([
      'Tin 1: Chào mừng · 30 phút sau khi chạy',
      'Tin 2: Nhắc lại · 3 giờ sau tin trước',
    ]);
  });

  it('chế độ "gửi tất cả" (không hẹn giờ): mọi tin đều gửi ngay dù có số chờ cũ', () => {
    const lines = text(node('send_email', {
      ...base,
      sendMode: 'all',
      emailSteps: [{ templateId: 7 }, { templateId: 8, delayValue: 9, delayUnit: 'days', delayFrom: 'prev' }],
    }));
    expect(lines.slice(2)).toEqual(['Tin 1: Chào mừng · gửi ngay', 'Tin 2: Nhắc lại · gửi ngay']);
  });

  it('tương thích khối cũ chỉ có emailTemplateId (một tin)', () => {
    expect(text(node('send_email', { ...base, emailTemplateId: 7 })).slice(2)).toEqual(['Tin 1: Chào mừng · gửi ngay']);
  });

  it('người nhận nhập tay: đếm số email', () => {
    const lines = text(node('send_email', { fromEmailId: 3, recipientSource: 'manual', recipientEmails: 'a@x.vn, b@x.vn\nc@x.vn', emailSteps: [{ templateId: 7 }] }));
    expect(lines[1]).toBe('Gửi cho: 3 email nhập tay');
  });

  it('thiếu bắt buộc → dòng đỏ "Chưa chọn …" cho nguồn người nhận và mẫu; tài khoản gửi trống nhưng có tài khoản đang hoạt động → "mặc định" (runtime tự dùng)', () => {
    const empty = node('send_email', {});
    expect(text(empty)).toEqual([
      'Gửi từ: Tài khoản mặc định: CSKH (cskh@abc.vn)',
      'Gửi cho: Chưa chọn nguồn người nhận',
      'Tin 1: Chưa chọn mẫu email',
    ]);
    expect(tones(empty)).toEqual(['normal', 'missing', 'missing']);
  });

  it('fromEmailId trống: lấy tài khoản có id SỐ nhỏ nhất (như findDefaultEmailSettings), không theo thứ tự mảng', () => {
    const accounts = [{ id: 10, name: 'Mười', email: 'm@x.vn' }, { id: 2, name: 'Hai', email: 'h@x.vn' }, { id: 7, name: 'Bảy', email: 'b@x.vn' }];
    const lines = describeNodeSettings(node('send_email', {}), { ...lookups, emailSettings: accounts }, t);
    expect(lines[0]).toMatchObject({ value: 'Tài khoản mặc định: Hai (h@x.vn)', tone: 'normal', role: 'sender' });
  });

  it('fromEmailId trống và KHÔNG có tài khoản đang hoạt động nào → vẫn là dòng thiếu', () => {
    const lines = describeNodeSettings(node('send_email', {}), { ...lookups, emailSettings: [] }, t);
    expect(lines[0]).toMatchObject({ value: 'Chưa chọn tài khoản gửi email', tone: 'missing', role: 'sender' });
    expect(describeNodeSettings(node('send_email', {}), { ...lookups, emailSettings: undefined }, t)[0].tone).toBe('missing');
  });

  it('một tin thiếu mẫu → chỉ dòng của tin đó đỏ; khối nguồn bị xoá → đỏ', () => {
    const target = node('send_email', { ...base, recipientNodeId: 'da-xoa', emailSteps: [{ templateId: 7 }, { templateId: '' }] });
    expect(text(target).slice(1)).toEqual([
      'Gửi cho: Khối dữ liệu đã bị xoá — hãy chọn lại',
      'Tin 1: Chào mừng · gửi ngay',
      'Tin 2: Chưa chọn mẫu',
    ]);
    expect(tones(target)).toEqual(['normal', 'missing', 'normal', 'missing']);
  });

  it('chưa có cột email → đỏ; tài khoản/mẫu không còn trong danh sách đã tải → hiện mã, không vỡ', () => {
    const lines = text(node('send_email', { fromEmailId: 99, recipientSource: 'node', recipientNodeId: 'sheet1', recipientField: '', emailSteps: [{ templateId: 555 }] }));
    expect(lines).toEqual([
      'Gửi từ: Tài khoản #99',
      'Gửi cho: Chưa chọn cột dữ liệu',
      'Tin 1: Mẫu #555 · gửi ngay',
    ]);
  });
});

describe('describeNodeSettings — Zalo', () => {
  it('select_zalo_account: tên tài khoản; pool nhiều tài khoản; chưa chọn → đỏ', () => {
    expect(text(node('select_zalo_account', { zaloAccountId: '5' }))).toEqual(['Tài khoản Zalo: Shop Hoa']);
    expect(text(node('select_zalo_account', { zaloPoolMultiAccountEnabled: true, zaloPoolAccountIds: ['5', '6'] })))
      .toEqual(['Tài khoản Zalo: 2 tài khoản luân phiên: Shop Hoa, Shop Lan']);
    expect(text(node('select_zalo_account', {}))).toEqual(['Tài khoản Zalo: Chưa chọn tài khoản Zalo']);
    expect(tones(node('select_zalo_account', {}))).toEqual(['missing']);
    expect(text(node('select_zalo_account', { zaloPoolMultiAccountEnabled: true }))).toEqual(['Tài khoản Zalo: Chưa chọn tài khoản Zalo nào cho nhóm tài khoản luân phiên']);
  });

  it('get_all_groups: tài khoản theo khối chọn tài khoản + số nhóm đã chọn', () => {
    expect(text(GROUPS_NODE)).toEqual(['Tài khoản Zalo: Shop Hoa', 'Nhóm: 3 nhóm đã chọn']);
  });

  it('get_all_groups: rỗng và chưa khoá = TẤT CẢ nhóm (đúng như lúc chạy); khoá mà rỗng = chưa chọn (đỏ)', () => {
    expect(text(node('get_all_groups', {}))).toEqual(['Nhóm: Tất cả nhóm của tài khoản']);
    const locked = node('get_all_groups', { zaloGroupSelectionSnapshotLocked: true });
    expect(text(locked)).toEqual(['Nhóm: Chưa chọn nhóm nào']);
    expect(tones(locked)).toEqual(['missing']);
  });

  it('get_all_friends: chế độ chọn bạn bè', () => {
    expect(text(node('get_all_friends', {}))).toEqual(['Bạn bè: Tất cả bạn bè']);
    expect(text(node('get_all_friends', { zaloFriendSelectionMode: 'fixed', zaloSelectedFriendIds: ['a', 'b'] }))).toEqual(['Bạn bè: 2 bạn bè đã chọn']);
    expect(text(node('get_all_friends', { zaloFriendSelectionMode: 'all_exclude', zaloExcludedFriendIds: ['a'] }))).toEqual(['Bạn bè: Tất cả bạn bè trừ 1 người']);
    expect(tones(node('get_all_friends', { zaloFriendSelectionMode: 'fixed' }))).toEqual(['missing']);
  });

  it('send_zalo_group: nhóm lấy từ khối «Lấy nhóm» (kèm số nhóm) + mẫu từng tin', () => {
    const lines = text(node('send_zalo_group', {
      zaloGroupSource: 'node',
      zaloGroupNodeId: 'grp1',
      zaloGroupField: 'groupId',
      zaloGroupSendMode: 'schedule',
      zaloGroupTemplateSteps: [
        { templateId: 21, delayValue: 0, delayFrom: 'start' },
        { templateId: 22, delayValue: 1, delayUnit: 'days', delayFrom: 'prev' },
      ],
    }));
    expect(lines).toEqual([
      'Nhóm: Từ khối “Lấy nhóm” — 3 nhóm đã chọn',
      'Tin 1: Mời tham gia nhóm · gửi ngay',
      'Tin 2: Nhắc lịch học · 1 ngày sau tin trước',
    ]);
  });

  it('send_zalo_group: nhập tay id nhóm; thiếu nội dung/nhóm → đỏ', () => {
    expect(text(node('send_zalo_group', { zaloGroupSource: 'manual', zaloGroupIds: 'g1,g2', zaloGroupMessage: 'Xin chào cả nhà' })))
      .toEqual(['Nhóm: 2 nhóm đã chọn', 'Nội dung: Nội dung nhập tay: “Xin chào cả nhà”']);
    const empty = node('send_zalo_group', {});
    expect(text(empty)).toEqual(['Nhóm: Chưa nhập danh sách nhóm', 'Tin 1: Chưa chọn mẫu tin hoặc nhập nội dung tin nhóm']);
    expect(tones(empty)).toEqual(['missing', 'missing']);
  });

  it('send_zalo_personal: số điện thoại nhập tay / cột từ khối + mẫu; UID', () => {
    expect(text(node('send_zalo_personal', {
      zaloRecipientSource: 'node', zaloRecipientNodeId: 'sheet1', zaloRecipientField: 'phone', zaloPersonalSendMode: 'all',
      zaloPersonalTemplateSteps: [{ templateId: 22 }],
    }))).toEqual(['Gửi cho: Từ khối “Danh sách khách”, cột “phone”', 'Tin 1: Nhắc lịch học · gửi ngay']);
    expect(text(node('send_zalo_personal', { zaloRecipientSource: 'manual', zaloRecipientType: 'uid', zaloRecipientPhones: '1\n2', zaloMessage: 'Chào' })))
      .toEqual(['Gửi cho: 2 UID nhập tay', 'Nội dung: Nội dung nhập tay: “Chào”']);
    const empty = node('send_zalo_personal', {});
    expect(text(empty)).toEqual(['Gửi cho: Chưa nhập danh sách số điện thoại', 'Tin 1: Chưa chọn mẫu tin hoặc nhập nội dung']);
    expect(tones(empty)).toEqual(['missing', 'missing']);
  });

  it('send_zalo_personal có tài khoản riêng trong khối → hiện TÊN', () => {
    expect(text(node('send_zalo_personal', { zaloAccountId: '6', zaloRecipientSource: 'manual', zaloRecipientPhones: '0901', zaloMessage: 'x' }))[0])
      .toBe('Tài khoản Zalo: Shop Lan');
  });

  it('send_zalo_friend_request: người nhận + lời mời theo mẫu hoặc nhập tay', () => {
    expect(text(node('send_zalo_friend_request', { zaloFriendSource: 'manual', zaloFriendPhones: '0901,0902,0903', zaloFriendContentMode: 'template', zaloFriendTemplateId: 21 })))
      .toEqual(['Gửi cho: 3 số điện thoại nhập tay', 'Lời mời: Mời tham gia nhóm']);
    expect(text(node('send_zalo_friend_request', { zaloFriendSource: 'manual', zaloFriendPhones: '0901', zaloFriendRequestMessage: 'Chào bạn' }))[1])
      .toBe('Lời mời: Nội dung nhập tay: “Chào bạn”');
    const empty = node('send_zalo_friend_request', { zaloFriendContentMode: 'template' });
    expect(text(empty)).toEqual(['Gửi cho: Chưa nhập danh sách số điện thoại', 'Lời mời: Chưa chọn mẫu lời mời']);
    expect(tones(empty)).toEqual(['missing', 'missing']);
  });
});

describe('describeNodeSettings — Telegram / WhatsApp', () => {
  it('send_telegram: tài khoản theo TÊN, nguồn hội thoại, các bước + nhịp chờ', () => {
    expect(text(node('send_telegram', {
      telegramAccountId: 4,
      recipientSource: 'telegram_conversations',
      steps: [{ message: 'Chào bạn' }, { message: 'Nhắc lại sau', delayValue: 2, delayUnit: 'hours' }, { templateId: 21, delayValue: 0 }],
    }))).toEqual([
      'Tài khoản Telegram: Bot A (@bota)',
      'Gửi cho: Các cuộc trò chuyện Telegram đang mở',
      'Tin 1: Nội dung nhập tay: “Chào bạn” · gửi ngay',
      'Tin 2: Nội dung nhập tay: “Nhắc lại sau” · 2 giờ sau tin trước',
      'Tin 3: Mời tham gia nhóm · gửi liền sau tin trước',
    ]);
  });

  it('send_telegram: nhóm đã chọn / nhập tay; thiếu → đỏ', () => {
    expect(text(node('send_telegram', { telegramAccountId: 4, recipientSource: 'telegram_groups', recipientKeys: [{ recipientKey: '1' }, { recipientKey: '2' }], steps: [{ message: 'a' }] }))[1])
      .toBe('Gửi cho: 2 nhóm đã chọn');
    expect(text(node('send_telegram', { telegramAccountId: 4, recipientSource: 'manual', recipientKeys: '111\n222\n333', steps: [{ message: 'a' }] }))[1])
      .toBe('Gửi cho: 3 chat id nhập tay');
    const empty = node('send_telegram', { recipientSource: 'manual' });
    expect(text(empty)).toEqual(['Tài khoản Telegram: Chưa chọn tài khoản Telegram', 'Gửi cho: Chưa nhập danh sách chat', 'Tin 1: Chưa soạn nội dung tin']);
    expect(tones(empty)).toEqual(['missing', 'missing', 'missing']);
  });

  it('send_whatsapp: tên phiên + hội thoại + tin', () => {
    expect(text(node('send_whatsapp', { whatsappSessionKey: '40-default', recipientSource: 'whatsapp_conversations', steps: [{ message: 'Xin chào' }] })))
      .toEqual(['Tài khoản WhatsApp: +84 912 345 678', 'Gửi cho: Các cuộc trò chuyện WhatsApp đang mở', 'Tin 1: Nội dung nhập tay: “Xin chào” · gửi ngay']);
    const empty = node('send_whatsapp', {});
    expect(tones(empty)).toEqual(['missing', 'normal', 'missing']);
  });
});

describe('describeNodeSettings — dữ liệu & logic', () => {
  it('manual_trigger', () => {
    expect(text(node('manual_trigger'))).toEqual(['Chạy khi: Bạn bấm Chạy, hoặc đến giờ theo lịch']);
  });

  it('read_sheet: đường dẫn + tab; thiếu đường dẫn → đỏ', () => {
    expect(text(SHEET)).toEqual(['Google Sheet: https://docs.google.com/spreadsheets/d/abc', 'Tab: Tháng 10']);
    expect(text(node('read_sheet', {}))).toEqual(['Google Sheet: Chưa nhập đường dẫn Google Sheet']);
    expect(tones(node('read_sheet', {}))).toEqual(['missing']);
  });

  it('read_courses_db / read_products_db: số đã chọn, thiếu → đỏ', () => {
    expect(text(node('read_courses_db', { coursesDbSelectedIds: [1, 2] }))).toEqual(['Khóa học: 2 đã chọn']);
    expect(text(node('read_courses_db', {}))).toEqual(['Khóa học: Chưa chọn khóa học']);
    expect(text(node('read_products_db', { productsDbSelectedIds: [9] }))).toEqual(['Sản phẩm: 1 đã chọn']);
    expect(tones(node('read_products_db', {}))).toEqual(['missing']);
  });

  it('read_interested_customers: loại khách, chọn người, giới hạn', () => {
    expect(text(node('read_interested_customers', { interestedCustomerType: 'purchased', interestedLimit: 500 }))).toEqual([
      `Loại khách: ${vi.nodeConfig.purchased}`,
      'Khách hàng: Tất cả khách thuộc loại này',
      'Tối đa: 500 bản ghi',
    ]);
    expect(text(node('read_interested_customers', { interestedSelectionMode: 'fixed', interestedSelectedCustomerIds: [1, 2, 3] }))[1]).toBe('Khách hàng: 3 khách đã chọn');
    expect(tones(node('read_interested_customers', { interestedSelectionMode: 'fixed' }))[1]).toBe('missing');
    expect(text(node('read_interested_customers', { interestedSelectionMode: 'all_exclude', interestedExcludedCustomerIds: [1] }))[1]).toBe('Khách hàng: Tất cả trừ 1 khách');
  });

  it('read_landing_leads: trang, khoảng ngày (thiếu ngày → đỏ), giới hạn', () => {
    expect(text(node('read_landing_leads', { landingLeadsSlugs: ['a', 'b', 'c'], landingLeadsLimit: 200 }))).toEqual(['Trang landing: a, b +1', 'Tối đa: 200 bản ghi']);
    expect(text(node('read_landing_leads', {}))).toEqual(['Trang landing: Tất cả trang landing']);
    const ranged = node('read_landing_leads', { landingLeadsUseDateRange: true, landingLeadsDateFrom: '2026-10-01' });
    expect(text(ranged)).toEqual(['Trang landing: Tất cả trang landing', 'Khoảng ngày: Chọn đủ “Từ ngày” và “Đến ngày”']);
    expect(text(node('read_landing_leads', { landingLeadsUseDateRange: true, landingLeadsDateFrom: '2026-10-01', landingLeadsDateTo: '2026-10-10' }))[1]).toBe('Khoảng ngày: 2026-10-01 → 2026-10-10');
  });

  it('read_form_submissions: số biểu mẫu (đọc cả formId cũ), thiếu → đỏ', () => {
    expect(text(node('read_form_submissions', { formIds: [4, 5], formSubmissionsLimit: 300 }))).toEqual(['Biểu mẫu: 2 đã chọn', 'Tối đa: 300 bản ghi']);
    expect(text(node('read_form_submissions', { formId: 7 }))).toEqual(['Biểu mẫu: 1 đã chọn']);
    expect(text(node('read_form_submissions', {}))).toEqual(['Biểu mẫu: Chưa chọn biểu mẫu']);
  });

  it('save_customer: khối nguồn + trường liên hệ đã ánh xạ; thiếu → đỏ', () => {
    expect(text(node('save_customer', {
      saveCustomerNodeId: 'sheet1',
      saveCustomerFieldMap: { email: { mode: 'node', nodeId: 'sheet1', field: 'email' }, phone: { mode: 'node', nodeId: 'sheet1', field: 'sdt' } },
    }))).toEqual(['Nguồn dữ liệu: Từ khối “Danh sách khách”', 'Trường liên hệ: Email, Số điện thoại']);
    const empty = node('save_customer', {});
    expect(text(empty)).toEqual(['Nguồn dữ liệu: Chưa chọn khối dữ liệu', 'Trường liên hệ: Chưa ánh xạ trường liên hệ (email / số điện thoại / Zalo)']);
    expect(tones(empty)).toEqual(['missing', 'missing']);
  });

  it('condition: kiểu khớp + số điều kiện; chưa đặt → đỏ', () => {
    expect(text(node('condition', { matchMode: 'any', rules: [{ field: 'email', operator: 'not_empty' }, { field: 'tag' }] })))
      .toEqual(['Kiểu khớp: Thoả BẤT KỲ điều kiện nào', 'Điều kiện: 2 điều kiện (đầu tiên: email)']);
    expect(text(node('condition', { rules: [{ field: 'a' }] }))[0]).toBe('Kiểu khớp: Thoả TẤT CẢ điều kiện');
    expect(text(node('condition', {}))).toEqual(['Điều kiện: Chưa đặt điều kiện nào']);
    expect(tones(node('condition', {}))).toEqual(['missing']);
  });

  it('tag_contact: thêm/gỡ tag + khối danh sách liên hệ', () => {
    expect(text(node('tag_contact', { tagAction: 'remove', tagName: 'vip', tagSourceNodeId: 'sheet1' })))
      .toEqual(['Hành động: Gỡ tag', 'Tag: vip', 'Danh sách liên hệ: Từ khối “Danh sách khách”']);
    expect(text(node('tag_contact', {}))).toEqual(['Hành động: Thêm tag', 'Tag: Chưa nhập tên tag', 'Danh sách liên hệ: Chưa chọn khối dữ liệu']);
  });

  it('update_attribute: thuộc tính + giá trị mới + khối nguồn', () => {
    expect(text(node('update_attribute', { attributeField: 'city', attributeValue: 'Hà Nội', attributeSourceNodeId: 'sheet1' })))
      .toEqual(['Thuộc tính: city', 'Giá trị mới: Hà Nội', 'Danh sách liên hệ: Từ khối “Danh sách khách”']);
    expect(text(node('update_attribute', {}))[0]).toBe('Thuộc tính: Chưa chọn thuộc tính');
  });
});

describe('describeNodeSettings — nội dung dài và tiếng Anh', () => {
  it('cắt nội dung nhập tay quá dài bằng "…"', () => {
    const long = 'x'.repeat(200);
    const value = describeNodeSettings(node('send_zalo_group', { zaloGroupSource: 'manual', zaloGroupIds: 'g', zaloGroupMessage: long }), lookups, t)[1].value;
    expect(value.length).toBeLessThan(80);
    expect(value).toContain('…');
  });

  it('mọi khoá i18n mà các nhánh dùng đều có ở CẢ vi và en (quét qua toàn bộ ca)', () => {
    const used = new Set();
    const recorder = makeT(vi, used);
    const cases = [
      node('send_email', { fromEmailId: 99, recipientSource: 'node', recipientNodeId: 'x', recipientField: '', sendMode: 'schedule', emailSteps: [{ templateId: 1, delayValue: 1, delayUnit: 'weeks', delayFrom: 'start' }, { templateId: 2, delayValue: 1, delayUnit: 'minutes', delayFrom: 'prev' }, { templateId: 3, delayValue: 1, delayUnit: 'lạ', delayFrom: 'start' }] }),
      node('send_email', {}),
      node('send_email', { recipientSource: 'manual', recipientEmails: '' }),
      node('send_zalo_personal', {}),
      node('send_zalo_personal', { zaloRecipientSource: 'node', zaloRecipientType: 'uid' }),
      node('send_zalo_friend_request', { zaloFriendSource: 'node', zaloFriendContentMode: 'manual' }),
      node('send_zalo_group', { zaloGroupSource: 'node', zaloGroupNodeId: 'sheet1' }),
      node('send_zalo_group', { zaloGroupSource: 'node', zaloGroupNodeId: 'grp1' }),
      node('send_zalo_group', { zaloGroupSource: 'node' }),
      node('send_telegram', { recipientSource: 'telegram_groups' }),
      node('send_telegram', { recipientSource: 'node', recipientNodeId: 'sheet1', recipientColumn: 'chat', telegramAccountId: 77 }),
      node('send_whatsapp', { whatsappSessionKey: 'khac', recipientSource: 'whatsapp_groups' }),
      node('select_zalo_account', {}),
      node('get_all_groups', { zaloAccountId: '6' }),
      node('get_all_friends', { zaloFriendAccountNodeId: 'acc1' }),
      ...DESCRIBED_NODE_SUBTYPES.map((type) => node(type, {})),
      node('mystery'),
    ];
    cases.forEach((target) => describeNodeSettings(target, lookups, recorder));
    // Khoá lắp động (nhịp chờ theo đơn vị...) đã được phủ bởi các ca trên; ngoài ra thêm khoá lắp động còn lại:
    ['minutes', 'hours', 'days', 'weeks'].forEach((unit) => used.add(`campaignSettings.wait.${unit}`));
    const missingEverywhere = [];
    used.forEach((key) => {
      [['vi', vi], ['en', en]].forEach(([lang, dict]) => {
        const resolved = key.split('.').reduce((cur, part) => (cur && typeof cur === 'object' ? cur[part] : undefined), dict);
        if (typeof resolved !== 'string') missingEverywhere.push(`${lang}:${key}`);
      });
    });
    expect(missingEverywhere).toEqual([]);
    expect(used.size).toBeGreaterThan(40);
  });

  it('bản tiếng Anh: cùng cấu trúc dòng', () => {
    const tEn = makeT(en);
    const lines = describeNodeSettings(node('send_email', {
      fromEmailId: 3, recipientSource: 'node', recipientNodeId: 'sheet1', recipientField: 'email', sendMode: 'schedule',
      emailSteps: [{ templateId: 7 }, { templateId: 8, delayValue: 2, delayUnit: 'days', delayFrom: 'prev' }],
    }), lookups, tEn).map((line) => `${line.label}: ${line.value}`);
    expect(lines).toEqual([
      'Send from: CSKH (cskh@abc.vn)',
      'Send to: From block “Danh sách khách”, column “email”',
      'Message 1: Chào mừng · send now',
      'Message 2: Nhắc lại · 2 days after the previous message',
    ]);
  });
});

/**
 * Vai (`role`) của TỪNG dòng, theo thứ tự dòng, với config rỗng — checklist "Trước khi chạy" gộp dòng theo vai này,
 * nên đổi vai một dòng là đổi nghĩa của checklist. Ghim từng phần tử của DESCRIBED_NODE_SUBTYPES.
 */
describe('describeNodeSettings — vai (role) của từng dòng', () => {
  const EXPECTED_ROLES = {
    manual_trigger: ['timing'],
    send_email: ['sender', 'audience', 'content'],
    send_zalo_personal: ['audience', 'content'],
    send_zalo_friend_request: ['audience', 'content'],
    send_zalo_group: ['audience', 'content'],
    send_telegram: ['sender', 'audience', 'content'],
    send_whatsapp: ['sender', 'audience', 'content'],
    condition: ['other'],
    tag_contact: ['other', 'other', 'other'],
    update_attribute: ['other', 'other'],
    read_sheet: ['audience'],
    read_courses_db: ['audience'],
    read_products_db: ['audience'],
    read_interested_customers: ['audience', 'audience'],
    read_landing_leads: ['audience'],
    read_form_submissions: ['audience'],
    save_customer: ['other', 'other'],
    select_zalo_account: ['sender'],
    get_all_friends: ['audience'],
    get_all_groups: ['audience'],
  };

  it('bảng vai phủ đúng mọi subtype đã mô tả', () => {
    expect(Object.keys(EXPECTED_ROLES).sort()).toEqual([...DESCRIBED_NODE_SUBTYPES].sort());
  });

  it.each(DESCRIBED_NODE_SUBTYPES)('%s → vai từng dòng khớp bảng', (subtype) => {
    const roles = describeNodeSettings(node(subtype), lookups, t).map((item) => item.role);
    expect(roles).toEqual(EXPECTED_ROLES[subtype]);
  });

  it('dòng nguồn người nhận của Telegram / WhatsApp là audience, tin là content, tài khoản là sender', () => {
    const tg = describeNodeSettings(node('send_telegram', { telegramAccountId: 4, recipientSource: 'telegram_groups', recipientKeys: ['a'], steps: [{ message: 'xin chào' }] }), lookups, t);
    expect(tg.map((item) => [item.label, item.role])).toEqual([
      [expect.stringContaining('Telegram'), 'sender'],
      ['Gửi cho', 'audience'],
      ['Tin 1', 'content'],
    ]);
  });

  it('mọi dòng của mọi subtype đều có role hợp lệ', () => {
    DESCRIBED_NODE_SUBTYPES.forEach((subtype) => {
      describeNodeSettings(node(subtype), lookups, t).forEach((item) => {
        expect(['sender', 'audience', 'content', 'timing', 'other']).toContain(item.role);
      });
    });
  });
});
