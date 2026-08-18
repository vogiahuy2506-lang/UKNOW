import { describe, expect, it, jest } from '@jest/globals';

const mockListEinvoices = jest.fn();
const mockRetryEinvoice = jest.fn();
const mockResendEinvoiceEmail = jest.fn();

jest.unstable_mockModule('../../../services/admin/adminEinvoice.service.js', () => ({
  listEinvoices: mockListEinvoices,
  retryEinvoice: mockRetryEinvoice,
  resendEinvoiceEmail: mockResendEinvoiceEmail,
}));

const mockLogSystem = jest.fn();
jest.unstable_mockModule('../../../services/audit.service.js', () => ({
  logSystem: mockLogSystem,
  AUDIT_ACTIONS: {
    EINVOICE_RETRIED: 'EINVOICE_RETRIED',
    EINVOICE_EMAIL_RESENT: 'EINVOICE_EMAIL_RESENT',
  },
  AUDIT_ENTITY_TYPES: {
    EINVOICE: 'einvoice',
  },
}));

jest.unstable_mockModule('../../../utils/auditContext.util.js', () => ({
  getSystemAuditContext: () => ({ userId: 1, ipAddress: '127.0.0.1' }),
}));

const ctrl = await import('../adminEinvoice.controller.js');

describe('adminEinvoice.controller', () => {
  it('retry: không bao giờ ghi row chứa CCCD / payload khách vào audit_logs.details', async () => {
    mockRetryEinvoice.mockResolvedValueOnce({
      ok: true,
      errorCode: '0',
      row: {
        id: 123,
        status: 'issued',
        request_payload: {
          NMua_Ten: 'Nguyen Van A',
          NMua_MST: '0123456789',
          NMua_CCCDan: '079123456789',
        },
        response_payload: { raw: 'secret' },
      },
    });

    const req = { params: { id: '123' }, query: {} };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };

    await ctrl.retry(req, res);

    expect(mockLogSystem).toHaveBeenCalledWith(
      expect.anything(),
      'EINVOICE_RETRIED',
      'einvoice',
      123,
      {
        ok: true,
        skipped: undefined,
        reason: undefined,
        errorCode: '0',
        status: 'issued',
      },
    );

    // Không được chứa trường row hay bất kỳ thông tin nhạy cảm nào
    const loggedDetails = mockLogSystem.mock.calls[0][4];
    expect(loggedDetails.row).toBeUndefined();
    expect(JSON.stringify(loggedDetails)).not.toContain('079123456789');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('resendEmail: ghi audit details tóm tắt và trả message phù hợp', async () => {
    mockResendEinvoiceEmail.mockResolvedValueOnce({
      ok: true,
      status: 'cqt_ok',
    });

    const req = { params: { id: '456' }, query: {} };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };

    await ctrl.resendEmail(req, res);

    expect(mockLogSystem).toHaveBeenCalledWith(
      expect.anything(),
      'EINVOICE_EMAIL_RESENT',
      'einvoice',
      456,
      {
        ok: true,
        skipped: undefined,
        reason: undefined,
        status: 'cqt_ok',
      },
    );
  });
});
