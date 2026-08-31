import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockQuery = jest.fn();
jest.unstable_mockModule('../../../config/database.js', () => ({
  default: {
    query: mockQuery,
  },
}));

const { metricLatestEinvoiceSeries } = await import('../alert.repository.js');

describe('metricLatestEinvoiceSeries — chỉ đọc run đã kết thúc', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('lọc dòng cron đang chạy (finished_at IS NULL) khỏi truy vấn', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await metricLatestEinvoiceSeries();

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('finished_at IS NOT NULL');
    expect(params).toEqual(['einvoice_series_check']);
  });

  it('không có run nào đã kết thúc thì found=false (evaluator bỏ qua, không bắn cảnh báo)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await metricLatestEinvoiceSeries();

    expect(res.found).toBe(false);
    expect(res.cLai).toBeNull();
  });

  it('đọc đúng cLai từ run success', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        status: 'success',
        result: { cLai: 1057, khhdon: 'C26MTT', notFound: false, yearMismatch: false },
        error_message: null,
      }],
    });

    const res = await metricLatestEinvoiceSeries();

    expect(res).toMatchObject({
      cLai: 1057, yearMismatch: false, notFound: false, error: null, found: true,
    });
  });

  it('run failure không có error trong result thì lấy error_message', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ status: 'failure', result: {}, error_message: 'ETIMEDOUT' }],
    });

    const res = await metricLatestEinvoiceSeries();

    expect(res.error).toBe('ETIMEDOUT');
    expect(res.cLai).toBeNull();
  });
});
