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
  default: {},
  OUTBOUND_MESSAGE_JOB_TYPES: {},
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
});
