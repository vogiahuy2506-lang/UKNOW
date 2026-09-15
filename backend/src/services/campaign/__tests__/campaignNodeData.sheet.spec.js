import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockAxiosGet = jest.fn();

jest.unstable_mockModule('axios', () => ({
  default: {
    get: mockAxiosGet,
  },
}));

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../../repositories/campaign/campaignNodeData.repository.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../lead/lead.service.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../campaignFlow.service.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../../repositories/campaign/campaignCustomer.repository.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../customer/customerInterested.service.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../customer/customerHelper.service.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../queue/outboundMessageQueue.service.js', () => ({
  default: {
    isQueueFeatureEnabled: () => false,
  },
  OUTBOUND_MESSAGE_JOB_TYPES: {},
}));

// PR-6a: campaignNodeData.service.js nhập formService (case read_form_submissions) — file test
// này không cần nó nên chặn ở mock, tránh phải tải nguyên chuỗi import thật của form.service.js
// (kéo theo formSubmission.util.js -> lead.service.js parseMarketingConsent không khớp mock rỗng
// ở trên).
jest.unstable_mockModule('../../form.service.js', () => ({
  default: {},
}));

const { default: campaignNodeDataService } = await import('../campaignNodeData.service.js');

const VALID_SHEET_URL = 'https://docs.google.com/spreadsheets/d/testSpreadsheetId123/edit';

function htmlviewWithSheetNames(...sheetNames) {
  const pushes = sheetNames.map((n) => `items.push({name: "${n}", gid: "0"});`).join('\n');
  return `<!DOCTYPE html><html><head><script>${pushes}</script></head><body></body></html>`;
}

describe('campaignNodeDataService.fetchGoogleSheetCustomersFromConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('when sheetName is empty -> fetches gviz CSV without &sheet= and skips htmlview validation', async () => {
    mockAxiosGet.mockImplementation(async (url) => {
      expect(url).not.toContain('&sheet=');
      expect(url).toContain('https://docs.google.com/spreadsheets/d/testSpreadsheetId123/gviz/tq?tqx=out:csv');
      return {
        status: 200,
        headers: { 'content-type': 'text/csv' },
        data: 'Email,Full Name,Phone\nuser1@test.com,User One,0901111111\nuser2@test.com,User Two,0902222222',
      };
    });

    const config = {
      sheetUrl: VALID_SHEET_URL,
      sheetName: '',
      headerRow: 1,
      dataStartRow: 2,
    };

    const customers = await campaignNodeDataService.fetchGoogleSheetCustomersFromConfig(config);

    expect(customers).toHaveLength(2);
    expect(customers[0]).toMatchObject({
      row_number: 2,
      Email: 'user1@test.com',
      'Full Name': 'User One',
      Phone: '0901111111',
    });
    expect(customers[1]).toMatchObject({
      row_number: 3,
      Email: 'user2@test.com',
    });
    // htmlview is skipped when sheetName is empty
    expect(mockAxiosGet).toHaveBeenCalledTimes(1);
  });

  it('when sheetName is given -> validates htmlview and fetches with encoded &sheet= parameter', async () => {
    mockAxiosGet.mockImplementation(async (url) => {
      if (url.includes('/htmlview')) {
        return { status: 200, data: htmlviewWithSheetNames('Trang tính1', 'Khách Hàng') };
      }
      expect(url).toContain('&sheet=Kh%C3%A1ch%20H%C3%A0ng');
      return {
        status: 200,
        headers: { 'content-type': 'text/csv' },
        data: 'Email,Name\nkhach@test.com,Khach Hang A',
      };
    });

    const config = {
      sheetUrl: VALID_SHEET_URL,
      sheetName: 'Khách Hàng',
      headerRow: 1,
      dataStartRow: 2,
    };

    const customers = await campaignNodeDataService.fetchGoogleSheetCustomersFromConfig(config);

    expect(customers).toHaveLength(1);
    expect(customers[0]).toMatchObject({
      row_number: 2,
      Email: 'khach@test.com',
      Name: 'Khach Hang A',
    });
    expect(mockAxiosGet).toHaveBeenCalledTimes(2);
  });

  it('when sheetName does not exist in htmlview -> logs warning and returns empty array without silent crash', async () => {
    mockAxiosGet.mockImplementation(async (url) => {
      if (url.includes('/htmlview')) {
        return { status: 200, data: htmlviewWithSheetNames('Sheet1', 'Other') };
      }
      return { status: 200, data: '' };
    });

    const config = {
      sheetUrl: VALID_SHEET_URL,
      sheetName: 'NonExistentTab',
    };

    const customers = await campaignNodeDataService.fetchGoogleSheetCustomersFromConfig(config);
    expect(customers).toEqual([]);
  });

  it('when gviz returns HTTP >= 400 -> logs error and returns empty array', async () => {
    mockAxiosGet.mockImplementation(async () => {
      return { status: 500, data: 'Server Error' };
    });

    const config = {
      sheetUrl: VALID_SHEET_URL,
      sheetName: '',
    };

    const customers = await campaignNodeDataService.fetchGoogleSheetCustomersFromConfig(config);
    expect(customers).toEqual([]);
  });

  describe('sheetNameSource "auto" — tên tự nhận không còn thì lùi về tab đầu tiên (PLAN_TU_NHAN_TEN_SHEET_DAU_TIEN_2026-09-15)', () => {
    it('auto + tab không còn tồn tại -> đọc CSV KHÔNG có &sheet= (tab đầu tiên), không trả rỗng', async () => {
      mockAxiosGet.mockImplementation(async (url) => {
        if (url.includes('/htmlview')) {
          return { status: 200, data: htmlviewWithSheetNames('Khách tháng 10', 'Cũ') };
        }
        expect(url).not.toContain('&sheet=');
        return {
          status: 200,
          headers: { 'content-type': 'text/csv' },
          data: 'Email,Name\nfirsttab@test.com,First Tab',
        };
      });

      const config = {
        sheetUrl: VALID_SHEET_URL,
        sheetName: 'Khách tháng 9', // tab đã bị đổi tên/xoá — không còn trong danh sách trả về
        sheetNameSource: 'auto',
      };

      const customers = await campaignNodeDataService.fetchGoogleSheetCustomersFromConfig(config);

      expect(customers).toHaveLength(1);
      expect(customers[0]).toMatchObject({ Email: 'firsttab@test.com' });
    });

    it('auto + htmlview lỗi 403 -> vẫn đọc CSV tab đầu tiên (không trả rỗng)', async () => {
      mockAxiosGet.mockImplementation(async (url) => {
        if (url.includes('/htmlview')) {
          return { status: 403, data: 'Forbidden' };
        }
        expect(url).not.toContain('&sheet=');
        return {
          status: 200,
          headers: { 'content-type': 'text/csv' },
          data: 'Email,Name\nok@test.com,OK',
        };
      });

      const config = {
        sheetUrl: VALID_SHEET_URL,
        sheetName: 'Khách tháng 9',
        sheetNameSource: 'auto',
      };

      const customers = await campaignNodeDataService.fetchGoogleSheetCustomersFromConfig(config);

      expect(customers).toHaveLength(1);
      expect(customers[0]).toMatchObject({ Email: 'ok@test.com' });
    });

    it('tên tự GÕ TAY (không có sheetNameSource auto) + tab không còn -> [] như hành vi cũ', async () => {
      mockAxiosGet.mockImplementation(async (url) => {
        if (url.includes('/htmlview')) {
          return { status: 200, data: htmlviewWithSheetNames('Khác', 'Cũ') };
        }
        return { status: 200, data: '' };
      });

      const config = {
        sheetUrl: VALID_SHEET_URL,
        sheetName: 'Khách tháng 9',
        // không có sheetNameSource -> coi như người dùng tự gõ
      };

      const customers = await campaignNodeDataService.fetchGoogleSheetCustomersFromConfig(config);

      expect(customers).toEqual([]);
    });

    it('auto + tab VẪN CÒN -> đọc đúng tab đó, có &sheet=<tên>', async () => {
      mockAxiosGet.mockImplementation(async (url) => {
        if (url.includes('/htmlview')) {
          return { status: 200, data: htmlviewWithSheetNames('Khách tháng 9', 'Cũ') };
        }
        expect(url).toContain('&sheet=Kh%C3%A1ch%20th%C3%A1ng%209');
        return {
          status: 200,
          headers: { 'content-type': 'text/csv' },
          data: 'Email,Name\ncorrecttab@test.com,Correct',
        };
      });

      const config = {
        sheetUrl: VALID_SHEET_URL,
        sheetName: 'Khách tháng 9',
        sheetNameSource: 'auto',
      };

      const customers = await campaignNodeDataService.fetchGoogleSheetCustomersFromConfig(config);

      expect(customers).toHaveLength(1);
      expect(customers[0]).toMatchObject({ Email: 'correcttab@test.com' });
    });
  });

  describe('getCustomersFromDataNode read_sheet contactRowCount metadata', () => {
    it('returns contactRowCount === 0 when sheet has 7 job management columns without email or phone', async () => {
      mockAxiosGet.mockImplementation(async () => ({
        status: 200,
        headers: { 'content-type': 'text/csv' },
        data: 'STT,Task,Kết quả cần đạt,Thời hạn,Nhân sự,Trạng thái,Đánh giá\n1,Làm slide,Đạt,2026-08-30,Nguyễn Văn A,Đang làm,Tốt\n2,Code backend,Xong,2026-08-31,Trần B,Đang làm,Tốt',
      }));

      const node = {
        id: 'node_1',
        node_subtype: 'read_sheet',
        config: {
          sheetUrl: VALID_SHEET_URL,
        },
      };

      const result = await campaignNodeDataService.getCustomersFromDataNode(node, 1);
      expect(result.items).toHaveLength(2);
      expect(result.dataLoadMeta.contactRowCount).toBe(0);
      expect(result.dataLoadMeta.emailColumns).toEqual([]);
      expect(result.dataLoadMeta.phoneColumns).toEqual([]);
    });

    it('calculates contactRowCount correctly when sheet has Phone and Email columns', async () => {
      mockAxiosGet.mockImplementation(async () => ({
        status: 200,
        headers: { 'content-type': 'text/csv' },
        data: 'Tên,Số điện thoại,Email\nNguyễn Văn A,0901234567,a@test.com\nTrần Văn B,,b@test.com\nLê Văn C,,\nPhạm Văn D,0987654321,',
      }));

      const node = {
        id: 'node_2',
        node_subtype: 'google_sheet',
        config: {
          sheetUrl: VALID_SHEET_URL,
        },
      };

      const result = await campaignNodeDataService.getCustomersFromDataNode(node, 1);
      expect(result.items).toHaveLength(4);
      // Row 1 (A): phone + email -> has contact
      // Row 2 (B): email -> has contact
      // Row 3 (C): no phone, no email -> no contact
      // Row 4 (D): phone -> has contact
      expect(result.dataLoadMeta.contactRowCount).toBe(3);
      expect(result.dataLoadMeta.emailColumns).toEqual(['Email']);
      expect(result.dataLoadMeta.phoneColumns).toEqual(['Số điện thoại']);
    });
  });
});


describe('fetchGoogleSheetCustomersFromConfig — lỗi mạng khi mở htmlview (axios ném, không phải HTTP >= 400)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('tên tab tự nhận (sheetNameSource auto) + htmlview timeout → vẫn đọc tab đầu tiên', async () => {
    mockAxiosGet.mockImplementation(async (url) => {
      if (url.includes('/htmlview')) {
        const err = new Error('timeout of 180000ms exceeded');
        err.code = 'ECONNABORTED';
        throw err;
      }
      expect(url).not.toContain('&sheet=');
      return {
        status: 200,
        headers: { 'content-type': 'text/csv' },
        data: 'Phone,Name\n0901111111,Khach A',
      };
    });

    const customers = await campaignNodeDataService.fetchGoogleSheetCustomersFromConfig({
      sheetUrl: VALID_SHEET_URL,
      sheetName: 'Khách tháng 9',
      sheetNameSource: 'auto',
      headerRow: 1,
      dataStartRow: 2,
    });

    expect(customers).toHaveLength(1);
    expect(customers[0]).toMatchObject({ Phone: '0901111111' });
  });

  it('tên tab tự gõ + htmlview timeout → giữ hành vi cũ: không đọc, trả rỗng', async () => {
    mockAxiosGet.mockImplementation(async (url) => {
      if (url.includes('/htmlview')) {
        throw new Error('socket hang up');
      }
      return { status: 200, headers: { 'content-type': 'text/csv' }, data: 'Phone\n0901111111' };
    });

    const customers = await campaignNodeDataService.fetchGoogleSheetCustomersFromConfig({
      sheetUrl: VALID_SHEET_URL,
      sheetName: 'Khách tháng 9',
      headerRow: 1,
      dataStartRow: 2,
    });

    expect(customers).toEqual([]);
    expect(mockAxiosGet).toHaveBeenCalledTimes(1);
  });
});
