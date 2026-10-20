import { describe, it, expect } from '@jest/globals';
import {
  SELLER_BOUND_KEY_RULES,
  ZALO_ACCOUNT_KEY_RULES,
  stripSellerBoundFlowJson,
  stripSellerBoundNodeConfig,
  stripSellerBoundSnapshotNodes,
} from '../marketplaceCampaignSnapshot.util.js';

/**
 * Marketplace chiến dịch — dữ liệu GẮN NGƯỜI BÁN (tài khoản gửi, người nhận nhúng, nguồn dữ liệu) phải được gỡ khỏi config trước
 * khi bán / khi mua, mỗi khoá đặt về đúng giá trị "chưa chọn" mà giao diện hiểu. Mỗi khoá một ca.
 */
describe('stripSellerBoundNodeConfig — từng khoá gắn người bán', () => {
  describe('tài khoản Zalo (mọi khối Zalo)', () => {
    const SUBTYPES = [
      'send_zalo',
      'send_zalo_personal',
      'send_zalo_group',
      'send_zalo_friend_request',
      'select_zalo_account',
      'get_all_friends',
      'get_all_groups',
    ];
    it.each(SUBTYPES)('%s: bỏ zaloAccountId + accountId, đưa 3 danh sách tài khoản về []', (subtype) => {
      const next = stripSellerBoundNodeConfig(subtype, {
        zaloAccountId: 12,
        accountId: '12',
        zaloPoolAccountIds: ['12', '13'],
        zaloPersonalAccountIds: [12],
        zaloFriendAccountIds: [14],
        zaloPoolMultiAccountEnabled: true,
        giuLai: 'x',
      });
      expect(next.zaloAccountId).toBeUndefined();
      expect('zaloAccountId' in next).toBe(false);
      expect('accountId' in next).toBe(false);
      expect(next.zaloPoolAccountIds).toEqual([]);
      expect(next.zaloPersonalAccountIds).toEqual([]);
      expect(next.zaloFriendAccountIds).toEqual([]);
      // cờ và khoá khác giữ nguyên
      expect(next.zaloPoolMultiAccountEnabled).toBe(true);
      expect(next.giuLai).toBe('x');
    });

    it('khối KHÔNG phải Zalo giữ nguyên khoá trùng tên (không đoán mò theo tên khoá)', () => {
      const config = { zaloAccountId: 5, accountId: 6 };
      expect(stripSellerBoundNodeConfig('send_email', config)).toEqual({ zaloAccountId: 5, accountId: 6 });
    });

    it('bảng luật tài khoản Zalo đúng 5 khoá (thêm khoá mới phải thêm ca ở đây)', () => {
      expect(ZALO_ACCOUNT_KEY_RULES.map(([key]) => key)).toEqual([
        'zaloAccountId', 'accountId', 'zaloPoolAccountIds', 'zaloPersonalAccountIds', 'zaloFriendAccountIds',
      ]);
    });
  });

  describe('send_email', () => {
    it('fromEmailId bị bỏ (trống = tài khoản email mặc định của người mua)', () => {
      const next = stripSellerBoundNodeConfig('send_email', { fromEmailId: 9, emailSteps: [{ templateId: 1 }] });
      expect('fromEmailId' in next).toBe(false);
      expect(next.emailSteps).toEqual([{ templateId: 1 }]);
    });
    it('recipientEmails: mảng → [], chuỗi → ""', () => {
      expect(stripSellerBoundNodeConfig('send_email', { recipientEmails: ['a@x.vn', 'b@x.vn'] }).recipientEmails).toEqual([]);
      expect(stripSellerBoundNodeConfig('send_email', { recipientEmails: 'a@x.vn, b@x.vn' }).recipientEmails).toBe('');
    });
    it('recipientSource, recipientField, recipientNodeId giữ nguyên (tham chiếu khối đổi ở bước clone)', () => {
      const config = { recipientSource: 'node', recipientNodeId: '7', recipientField: 'email' };
      expect(stripSellerBoundNodeConfig('send_email', config)).toBe(config);
    });
  });

  describe('Zalo — người nhận / nhóm nhập tay', () => {
    it('send_zalo_personal: zaloRecipientPhones + recipientPhones', () => {
      const next = stripSellerBoundNodeConfig('send_zalo_personal', { zaloRecipientPhones: '0901', recipientPhones: ['0902'], zaloRecipientType: 'phone' });
      expect(next.zaloRecipientPhones).toBe('');
      expect(next.recipientPhones).toEqual([]);
      expect(next.zaloRecipientType).toBe('phone');
    });
    it('send_zalo_friend_request: zaloFriendPhones', () => {
      expect(stripSellerBoundNodeConfig('send_zalo_friend_request', { zaloFriendPhones: '0901\n0902' }).zaloFriendPhones).toBe('');
    });
    it('send_zalo_group: zaloGroupIds (chuỗi nhập tay) và dạng mảng', () => {
      expect(stripSellerBoundNodeConfig('send_zalo_group', { zaloGroupIds: 'g1,g2' }).zaloGroupIds).toBe('');
      expect(stripSellerBoundNodeConfig('send_zalo_group', { zaloGroupIds: ['g1'] }).zaloGroupIds).toEqual([]);
    });
  });

  describe('get_all_groups / get_all_friends — về trạng thái "chưa chọn ai" mà bộ chạy hiểu', () => {
    it('get_all_groups: danh sách nhóm [] + khoá snapshot bật (chọn rỗng KHÔNG thành "mọi nhóm")', () => {
      const next = stripSellerBoundNodeConfig('get_all_groups', {
        zaloGroupAccountNodeId: '3',
        zaloSelectedGroupIds: ['g1', 'g2'],
        zaloGroupSelectionSnapshotLocked: false,
      });
      expect(next).toEqual({ zaloGroupAccountNodeId: '3', zaloSelectedGroupIds: [], zaloGroupSelectionSnapshotLocked: true });
    });
    it('get_all_groups: id nhóm của người bán còn sót ở zaloGroupIds (mảng, như listing #9 production) cũng bị gỡ', () => {
      const next = stripSellerBoundNodeConfig('get_all_groups', {
        zaloGroupIds: ['6704258567851745496', '4543730624985843420'],
        zaloSelectedGroupIds: [],
        zaloGroupSelectionSnapshotLocked: true,
      });
      expect(next.zaloGroupIds).toEqual([]);
      expect(next.zaloSelectedGroupIds).toEqual([]);
      expect(next.zaloGroupSelectionSnapshotLocked).toBe(true);
    });
    it('get_all_groups: config trống cũng được đặt về trạng thái chưa chọn (không để mặc định "mọi nhóm")', () => {
      expect(stripSellerBoundNodeConfig('get_all_groups', {})).toEqual({ zaloSelectedGroupIds: [], zaloGroupSelectionSnapshotLocked: true });
    });
    it('get_all_friends: chế độ fixed + hai danh sách []', () => {
      const next = stripSellerBoundNodeConfig('get_all_friends', {
        zaloFriendSelectionMode: 'all_exclude',
        zaloSelectedFriendIds: ['u1'],
        zaloExcludedFriendIds: ['u2'],
        zaloFriendsCount: 50,
      });
      expect(next).toEqual({ zaloFriendSelectionMode: 'fixed', zaloSelectedFriendIds: [], zaloExcludedFriendIds: [], zaloFriendsCount: 50 });
    });
    it('đã ở trạng thái chưa chọn → giữ nguyên tham chiếu', () => {
      const config = { zaloSelectedGroupIds: [], zaloGroupSelectionSnapshotLocked: true };
      expect(stripSellerBoundNodeConfig('get_all_groups', config)).toBe(config);
    });
  });

  describe('nguồn dữ liệu', () => {
    it('read_sheet: sheetUrl, sheetName → "", sheetNameSource bỏ, dataSelectedColumns []; tiêu đề/dòng bắt đầu giữ nguyên', () => {
      const next = stripSellerBoundNodeConfig('read_sheet', {
        sheetUrl: 'https://docs.google.com/spreadsheets/d/abc/edit',
        sheetName: 'Khach',
        sheetNameSource: 'auto',
        dataSelectedColumns: ['ten', 'sdt'],
        headerRow: 1,
        dataStartRow: 2,
      });
      expect(next).toEqual({ sheetUrl: '', sheetName: '', dataSelectedColumns: [], headerRow: 1, dataStartRow: 2 });
    });
    it('google_sheet (tên cũ) được xử lý như read_sheet', () => {
      expect(stripSellerBoundNodeConfig('google_sheet', { sheetUrl: 'https://x' }).sheetUrl).toBe('');
    });
    it('read_interested_customers: id khách chọn/loại trừ + id tag → []; loại khách, trần, chế độ chọn giữ nguyên', () => {
      const next = stripSellerBoundNodeConfig('read_interested_customers', {
        interestedSelectedCustomerIds: [1, 2],
        interestedExcludedCustomerIds: [3],
        interestedTagIds: [4],
        interestedCustomerType: 'all',
        interestedLimit: 500,
        interestedSelectionMode: 'fixed',
        interestedCourseIds: [10],
      });
      expect(next).toEqual({
        interestedSelectedCustomerIds: [],
        interestedExcludedCustomerIds: [],
        interestedTagIds: [],
        interestedCustomerType: 'all',
        interestedLimit: 500,
        interestedSelectionMode: 'fixed',
        interestedCourseIds: [10], // khoá học là danh mục dùng chung toàn nền tảng, không gắn người bán
      });
    });
    it('interested_customers (tên cũ) được xử lý như read_interested_customers', () => {
      expect(stripSellerBoundNodeConfig('interested_customers', { interestedTagIds: [4] }).interestedTagIds).toEqual([]);
    });
    it('read_landing_leads: landingLeadsSlugs → []', () => {
      expect(stripSellerBoundNodeConfig('read_landing_leads', { landingLeadsSlugs: ['trang-a'], landingLeadsLimit: 100 })).toEqual({
        landingLeadsSlugs: [],
        landingLeadsLimit: 100,
      });
    });
    it('read_form_submissions: formIds → [], formId bỏ, fieldMap → {}', () => {
      expect(stripSellerBoundNodeConfig('read_form_submissions', {
        formIds: [5, 6], formId: 5, fieldMap: { emailKey: 'mail' }, formSubmissionsLimit: 100,
      })).toEqual({ formIds: [], fieldMap: {}, formSubmissionsLimit: 100 });
    });
    it('read_products_db: productsDbSelectedIds → []', () => {
      expect(stripSellerBoundNodeConfig('read_products_db', { productsDbSelectedIds: [1, 2], productsDbLimit: 10 })).toEqual({
        productsDbSelectedIds: [],
        productsDbLimit: 10,
      });
    });
    it('read_courses_db: KHÔNG đụng (danh mục khoá học dùng chung toàn nền tảng)', () => {
      const config = { coursesDbSelectedIds: [1, 2] };
      expect(stripSellerBoundNodeConfig('read_courses_db', config)).toBe(config);
    });
  });

  describe('Telegram / WhatsApp', () => {
    it('send_telegram: telegramAccountId → null, recipientKeys → []', () => {
      expect(stripSellerBoundNodeConfig('send_telegram', {
        telegramAccountId: 8, recipientKeys: [{ recipientKey: 'u1' }], recipientSource: 'telegram_groups', steps: [{ message: 'x' }],
      })).toEqual({ telegramAccountId: null, recipientKeys: [], recipientSource: 'telegram_groups', steps: [{ message: 'x' }] });
    });
    it('send_whatsapp: whatsappSessionKey → null, recipientKeys (chuỗi nhập tay) → ""', () => {
      expect(stripSellerBoundNodeConfig('send_whatsapp', { whatsappSessionKey: '5-abc', recipientKeys: '0901\n0902' })).toEqual({
        whatsappSessionKey: null,
        recipientKeys: '',
      });
    });
  });

  describe('tính chất chung', () => {
    it('giữ nguyên tham chiếu khi không có gì cần gỡ; chạy lần hai không đổi gì (idempotent)', () => {
      const config = { sheetUrl: 'https://x', zaloAccountId: 1 };
      const once = stripSellerBoundNodeConfig('read_sheet', config);
      expect(stripSellerBoundNodeConfig('read_sheet', once)).toBe(once);
      const clean = { recipientSource: 'node' };
      expect(stripSellerBoundNodeConfig('send_email', clean)).toBe(clean);
    });
    it('không sửa object gốc', () => {
      const config = { fromEmailId: 9, recipientEmails: ['a@x.vn'] };
      stripSellerBoundNodeConfig('send_email', config);
      expect(config).toEqual({ fromEmailId: 9, recipientEmails: ['a@x.vn'] });
    });
    it('config không phải object / subtype lạ → trả nguyên', () => {
      expect(stripSellerBoundNodeConfig('send_email', null)).toBeNull();
      expect(stripSellerBoundNodeConfig('send_email', 'abc')).toBe('abc');
      expect(stripSellerBoundNodeConfig('send_email', [1])).toEqual([1]);
      const config = { zaloAccountId: 1 };
      expect(stripSellerBoundNodeConfig('khoi_la', config)).toBe(config);
      expect(stripSellerBoundNodeConfig(undefined, config)).toBe(config);
    });
    it('giá trị đã rỗng giữ nguyên, không sao chép', () => {
      const config = { sheetUrl: '', dataSelectedColumns: [], zaloAccountId: '' };
      expect(stripSellerBoundNodeConfig('read_sheet', config)).toBe(config);
    });
    it('bảng luật không có khoá nào bị nhân đôi giữa các khối', () => {
      Object.entries(SELLER_BOUND_KEY_RULES).forEach(([, rules]) => {
        const keys = rules.map(([key]) => key);
        expect(new Set(keys).size).toBe(keys.length);
      });
    });
  });
});

describe('stripSellerBoundFlowJson — cả sơ đồ flow_json', () => {
  const flow = {
    nodes: [
      { id: 'a', type: 'task', data: { nodeType: 'select_zalo_account', config: { zaloAccountId: 3, zaloPoolAccountIds: ['3'] } } },
      { id: 'b', type: 'task', data: { nodeType: 'send_email', config: { fromEmailId: 2, recipientEmails: 'x@y.vn' } } },
      { id: 'c', type: 'start', data: { nodeType: 'manual_trigger', config: {} } },
    ],
    edges: [{ id: 'e', source: 'a', target: 'b' }],
  };

  it('gỡ ở mọi khối; giữ id khối, cạnh và nhãn', () => {
    const next = stripSellerBoundFlowJson(flow);
    expect('zaloAccountId' in next.nodes[0].data.config).toBe(false);
    expect(next.nodes[0].data.config.zaloPoolAccountIds).toEqual([]);
    expect('fromEmailId' in next.nodes[1].data.config).toBe(false);
    expect(next.nodes[1].data.config.recipientEmails).toBe('');
    expect(next.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(next.edges).toBe(flow.edges);
    expect(flow.nodes[0].data.config.zaloAccountId).toBe(3); // bản gốc nguyên vẹn
  });

  it('sạch rồi thì trả đúng object cũ; flow_json lạ trả nguyên', () => {
    const clean = stripSellerBoundFlowJson(flow);
    expect(stripSellerBoundFlowJson(clean)).toBe(clean);
    expect(stripSellerBoundFlowJson(null)).toBeNull();
    expect(stripSellerBoundFlowJson({ nodes: [], connections: [] })).toEqual({ nodes: [], connections: [] });
  });
});

describe('stripSellerBoundSnapshotNodes — danh sách khối của snapshot (camelCase)', () => {
  it('gỡ theo nodeSubtype, khối không đổi giữ nguyên tham chiếu', () => {
    const untouched = { id: 1, nodeSubtype: 'manual_trigger', config: {} };
    const nodes = [
      untouched,
      { id: 2, nodeSubtype: 'send_zalo_group', nodeName: 'Gui', config: { zaloAccountId: 5, zaloGroupIds: 'g1' } },
      { id: 3, nodeSubtype: 'send_telegram', config: JSON.stringify({ telegramAccountId: 7 }) },
    ];
    const next = stripSellerBoundSnapshotNodes(nodes);
    expect(next[0]).toBe(untouched);
    expect(next[1].config).toEqual({ zaloGroupIds: '' });
    expect(next[1].nodeName).toBe('Gui');
    expect(next[2].config).toEqual({ telegramAccountId: null });
    expect(nodes[1].config.zaloAccountId).toBe(5);
  });
  it('không phải mảng → trả nguyên', () => {
    expect(stripSellerBoundSnapshotNodes(undefined)).toBeUndefined();
  });
});
