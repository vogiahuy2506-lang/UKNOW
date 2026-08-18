import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindEinvoices = jest.fn();
const mockResetEinvoiceForAdminRetry = jest.fn();
const mockResetEinvoiceEmailForAdminResend = jest.fn();
const mockFindEinvoiceById = jest.fn();

jest.unstable_mockModule('../../../repositories/admin/adminEinvoice.repository.js', () => ({
  findEinvoices: mockFindEinvoices,
  resetEinvoiceForAdminRetry: mockResetEinvoiceForAdminRetry,
  resetEinvoiceEmailForAdminResend: mockResetEinvoiceEmailForAdminResend,
  findEinvoiceById: mockFindEinvoiceById,
}));

const mockDispatchPreparedEinvoice = jest.fn();
const mockSendInvoicePdfForEinvoice = jest.fn();

jest.unstable_mockModule('../../payment/matbaoInvoice.service.js', () => ({
  dispatchPreparedEinvoice: mockDispatchPreparedEinvoice,
  sendInvoicePdfForEinvoice: mockSendInvoicePdfForEinvoice,
}));

const mockIsMatbaoEinvoiceWorkerEnabled = jest.fn();
jest.unstable_mockModule('../../../utils/invoiceVat.util.js', () => ({
  isMatbaoEinvoiceWorkerEnabled: mockIsMatbaoEinvoiceWorkerEnabled,
}));

const mockIsMatbaoConfigured = jest.fn();
jest.unstable_mockModule('../../../utils/matbaoHddtClient.util.js', () => ({
  isMatbaoConfigured: mockIsMatbaoConfigured,
}));

const { listEinvoices, retryEinvoice, resendEinvoiceEmail } = await import('../adminEinvoice.service.js');

describe('adminEinvoice.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsMatbaoEinvoiceWorkerEnabled.mockReturnValue(true);
    mockIsMatbaoConfigured.mockReturnValue(true);
  });

  describe('listEinvoices', () => {
    it('gọi repository findEinvoices với filters và trả về cấu trúc phân trang', async () => {
      mockFindEinvoices.mockResolvedValueOnce({
        rows: [{ id: 1, orderCode: '1001' }],
        total: 1,
      });

      const res = await listEinvoices({ status: 'stuck', page: 2, limit: 10 });
      expect(mockFindEinvoices).toHaveBeenCalledWith({ status: 'stuck', page: 2, limit: 10 });
      expect(res).toEqual({
        einvoices: [{ id: 1, orderCode: '1001' }],
        total: 1,
        page: 2,
        limit: 10,
      });
    });
  });

  describe('retryEinvoice', () => {
    it('trả skipped worker_disabled và KHÔNG reset DB nếu worker bị tắt', async () => {
      mockIsMatbaoEinvoiceWorkerEnabled.mockReturnValue(false);

      const res = await retryEinvoice(100);
      expect(res).toEqual({ skipped: true, reason: 'worker_disabled' });
      expect(mockFindEinvoiceById).not.toHaveBeenCalled();
      expect(mockResetEinvoiceForAdminRetry).not.toHaveBeenCalled();
      expect(mockDispatchPreparedEinvoice).not.toHaveBeenCalled();
    });

    it('trả skipped worker_disabled và KHÔNG reset DB nếu MatBao chưa cấu hình', async () => {
      mockIsMatbaoConfigured.mockReturnValue(false);

      const res = await retryEinvoice(100);
      expect(res).toEqual({ skipped: true, reason: 'worker_disabled' });
      expect(mockFindEinvoiceById).not.toHaveBeenCalled();
      expect(mockResetEinvoiceForAdminRetry).not.toHaveBeenCalled();
      expect(mockDispatchPreparedEinvoice).not.toHaveBeenCalled();
    });

    it('ném lỗi 404 nếu không tìm thấy hoá đơn', async () => {
      mockFindEinvoiceById.mockResolvedValueOnce(null);
      await expect(retryEinvoice(999)).rejects.toMatchObject({ status: 404 });
    });

    it('từ chối retry nếu hoá đơn đã có số (issued)', async () => {
      mockFindEinvoiceById.mockResolvedValueOnce({ id: 1, status: 'issued' });
      const res = await retryEinvoice(1);
      expect(res).toEqual({ skipped: true, reason: 'already_issued', status: 'issued' });
      expect(mockResetEinvoiceForAdminRetry).not.toHaveBeenCalled();
    });

    it('từ chối retry nếu hoá đơn đã cqt_ok', async () => {
      mockFindEinvoiceById.mockResolvedValueOnce({ id: 2, status: 'cqt_ok' });
      const res = await retryEinvoice(2);
      expect(res).toEqual({ skipped: true, reason: 'already_issued', status: 'cqt_ok' });
      expect(mockResetEinvoiceForAdminRetry).not.toHaveBeenCalled();
    });

    it('trả skipped: not_claimable nếu reset trả null', async () => {
      mockFindEinvoiceById.mockResolvedValueOnce({ id: 3, status: 'processing' });
      mockResetEinvoiceForAdminRetry.mockResolvedValueOnce(null);

      const res = await retryEinvoice(3);
      expect(res).toEqual({ skipped: true, reason: 'not_claimable', status: 'processing' });
      expect(mockDispatchPreparedEinvoice).not.toHaveBeenCalled();
    });

    it('reset và gọi dispatch khi hợp lệ (cqt_rejected hoặc failed)', async () => {
      mockFindEinvoiceById.mockResolvedValueOnce({ id: 4, status: 'cqt_rejected' });
      mockResetEinvoiceForAdminRetry.mockResolvedValueOnce({ id: 4, status: 'pending' });
      mockDispatchPreparedEinvoice.mockResolvedValueOnce({ ok: true, row: { id: 4 } });

      const res = await retryEinvoice(4);
      expect(mockResetEinvoiceForAdminRetry).toHaveBeenCalledWith(4);
      expect(mockDispatchPreparedEinvoice).toHaveBeenCalledWith(4);
      expect(res).toEqual({ ok: true, row: { id: 4 } });
    });

    it('trả nguyên lý do nếu dispatch bị skipped', async () => {
      mockFindEinvoiceById.mockResolvedValueOnce({ id: 5, status: 'failed' });
      mockResetEinvoiceForAdminRetry.mockResolvedValueOnce({ id: 5, status: 'pending' });
      mockDispatchPreparedEinvoice.mockResolvedValueOnce({ skipped: true, reason: 'network_timeout' });

      const res = await retryEinvoice(5);
      expect(res).toEqual({ skipped: true, reason: 'network_timeout' });
    });
  });

  describe('resendEinvoiceEmail', () => {
    it('trả skipped worker_disabled và KHÔNG reset email nếu worker bị tắt', async () => {
      mockIsMatbaoEinvoiceWorkerEnabled.mockReturnValue(false);

      const res = await resendEinvoiceEmail(200);
      expect(res).toEqual({ skipped: true, reason: 'worker_disabled' });
      expect(mockFindEinvoiceById).not.toHaveBeenCalled();
      expect(mockResetEinvoiceEmailForAdminResend).not.toHaveBeenCalled();
      expect(mockSendInvoicePdfForEinvoice).not.toHaveBeenCalled();
    });

    it('ném lỗi 404 nếu không tìm thấy hoá đơn', async () => {
      mockFindEinvoiceById.mockResolvedValueOnce(null);
      await expect(resendEinvoiceEmail(999)).rejects.toMatchObject({ status: 404 });
    });

    it('từ chối gửi email nếu hoá đơn chưa phát hành (pending/failed)', async () => {
      mockFindEinvoiceById.mockResolvedValueOnce({ id: 10, status: 'failed' });
      const res = await resendEinvoiceEmail(10);
      expect(res).toEqual({ skipped: true, reason: 'not_issued', status: 'failed' });
      expect(mockResetEinvoiceEmailForAdminResend).not.toHaveBeenCalled();
    });

    it('trả skipped: not_claimable nếu reset email trả null', async () => {
      mockFindEinvoiceById.mockResolvedValueOnce({ id: 11, status: 'issued' });
      mockResetEinvoiceEmailForAdminResend.mockResolvedValueOnce(null);

      const res = await resendEinvoiceEmail(11);
      expect(res).toEqual({ skipped: true, reason: 'not_claimable', status: 'issued' });
      expect(mockSendInvoicePdfForEinvoice).not.toHaveBeenCalled();
    });

    it('reset email và gọi sendInvoicePdfForEinvoice khi hoá đơn đã issued', async () => {
      mockFindEinvoiceById.mockResolvedValueOnce({ id: 12, status: 'issued' });
      mockResetEinvoiceEmailForAdminResend.mockResolvedValueOnce({ id: 12, email_status: 'pending' });
      mockSendInvoicePdfForEinvoice.mockResolvedValueOnce({ ok: true });

      const res = await resendEinvoiceEmail(12);
      expect(mockResetEinvoiceEmailForAdminResend).toHaveBeenCalledWith(12);
      expect(mockSendInvoicePdfForEinvoice).toHaveBeenCalledWith(12);
      expect(res).toEqual({ ok: true });
    });

    it('trả nguyên reason nếu sendInvoicePdfForEinvoice trả skipped', async () => {
      mockFindEinvoiceById.mockResolvedValueOnce({ id: 13, status: 'cqt_ok' });
      mockResetEinvoiceEmailForAdminResend.mockResolvedValueOnce({ id: 13, email_status: 'pending' });
      mockSendInvoicePdfForEinvoice.mockResolvedValueOnce({ skipped: true, reason: 'pdf_fetch_failed' });

      const res = await resendEinvoiceEmail(13);
      expect(res).toEqual({ skipped: true, reason: 'pdf_fetch_failed' });
    });
  });
});
