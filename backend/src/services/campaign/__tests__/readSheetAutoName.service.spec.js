import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockAxiosGet = jest.fn();

jest.unstable_mockModule('axios', () => ({
  default: {
    get: mockAxiosGet,
  },
}));

const { fillReadSheetFirstTabNames } = await import('../readSheetAutoName.service.js');

function htmlviewWithSheetNames(...sheetNames) {
  const pushes = sheetNames.map((n) => `items.push({name: "${n}", gid: "0"});`).join('\n');
  return `<!DOCTYPE html><html><head><script>${pushes}</script></head><body></body></html>`;
}

const SHEET_URL_A = 'https://docs.google.com/spreadsheets/d/abcAAA/edit#gid=0';
const SHEET_URL_B = 'https://docs.google.com/spreadsheets/d/xyzBBB/edit#gid=0';

function makeReadSheetNode(id, config) {
  return { id, nodeSubtype: 'read_sheet', config };
}

describe('readSheetAutoName.service — fillReadSheetFirstTabNames', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('node read_sheet URL hợp lệ, tên trống -> điền sheetName = tab đầu tiên + sheetNameSource auto', async () => {
    mockAxiosGet.mockResolvedValue({
      status: 200,
      data: htmlviewWithSheetNames('Khách tháng 9', 'Cũ'),
    });

    const nodes = [makeReadSheetNode('n1', { sheetUrl: SHEET_URL_A, sheetName: '' })];

    await fillReadSheetFirstTabNames(nodes);

    expect(nodes[0].config.sheetName).toBe('Khách tháng 9');
    expect(nodes[0].config.sheetNameSource).toBe('auto');
  });

  it('node đã có sheetName -> KHÔNG đổi, KHÔNG gọi mạng', async () => {
    const nodes = [makeReadSheetNode('n1', { sheetUrl: SHEET_URL_A, sheetName: 'Đã đặt tay' })];

    await fillReadSheetFirstTabNames(nodes);

    expect(nodes[0].config.sheetName).toBe('Đã đặt tay');
    expect(nodes[0].config.sheetNameSource).toBeUndefined();
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  it('htmlview 403 (không đọc được) -> giữ sheetName trống, không gắn cờ auto', async () => {
    mockAxiosGet.mockResolvedValue({ status: 403, data: 'Forbidden' });

    const nodes = [makeReadSheetNode('n1', { sheetUrl: SHEET_URL_A, sheetName: '' })];

    await fillReadSheetFirstTabNames(nodes);

    expect(nodes[0].config.sheetName).toBe('');
    expect(nodes[0].config.sheetNameSource).toBeUndefined();
  });

  it('2 node cùng URL -> chỉ gọi mạng 1 lần (cache theo spreadsheetId)', async () => {
    mockAxiosGet.mockResolvedValue({
      status: 200,
      data: htmlviewWithSheetNames('Tab đầu'),
    });

    const nodes = [
      makeReadSheetNode('n1', { sheetUrl: SHEET_URL_A, sheetName: '' }),
      makeReadSheetNode('n2', { sheetUrl: SHEET_URL_A, sheetName: '' }),
    ];

    await fillReadSheetFirstTabNames(nodes);

    expect(nodes[0].config.sheetName).toBe('Tab đầu');
    expect(nodes[1].config.sheetName).toBe('Tab đầu');
    expect(mockAxiosGet).toHaveBeenCalledTimes(1);
  });

  it('2 node URL KHÁC nhau -> gọi mạng riêng cho mỗi URL', async () => {
    mockAxiosGet.mockImplementation(async (url) => {
      if (url.includes('abcAAA')) {
        return { status: 200, data: htmlviewWithSheetNames('Tab A') };
      }
      return { status: 200, data: htmlviewWithSheetNames('Tab B') };
    });

    const nodes = [
      makeReadSheetNode('n1', { sheetUrl: SHEET_URL_A, sheetName: '' }),
      makeReadSheetNode('n2', { sheetUrl: SHEET_URL_B, sheetName: '' }),
    ];

    await fillReadSheetFirstTabNames(nodes);

    expect(nodes[0].config.sheetName).toBe('Tab A');
    expect(nodes[1].config.sheetName).toBe('Tab B');
    expect(mockAxiosGet).toHaveBeenCalledTimes(2);
  });

  it('node không phải read_sheet -> không đụng, không gọi mạng', async () => {
    const nodes = [
      { id: 'n1', nodeSubtype: 'send_email', config: { sheetUrl: SHEET_URL_A, sheetName: '' } },
    ];

    await fillReadSheetFirstTabNames(nodes);

    expect(nodes[0].config.sheetName).toBe('');
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  it('node read_sheet không có sheetUrl -> bỏ qua, không gọi mạng', async () => {
    const nodes = [makeReadSheetNode('n1', { sheetUrl: '', sheetName: '' })];

    await fillReadSheetFirstTabNames(nodes);

    expect(nodes[0].config.sheetName).toBe('');
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  it('nodes rỗng / không phải mảng -> không throw', async () => {
    await expect(fillReadSheetFirstTabNames([])).resolves.toBeUndefined();
    await expect(fillReadSheetFirstTabNames(null)).resolves.toBeUndefined();
  });
});
