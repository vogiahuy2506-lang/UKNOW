/**
 * Bộ xử lý lỗi cuối của app: 5xx ở production trả thông báo chung (giữ mã nghiệp vụ/requestId),
 * chi tiết chỉ vào log; 4xx giữ nguyên thông báo.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const { globalErrorHandler, GENERIC_SERVER_ERROR_MESSAGE } = await import('../app.js');

const makeRes = () => {
  const res = { headersSent: false };
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};
const makeReq = (extra = {}) => ({ method: 'GET', originalUrl: '/api/x', ...extra });
const errorWith = (message, props = {}) => Object.assign(new Error(message), props);

const prevEnv = process.env.NODE_ENV;
let errorSpy;
beforeEach(() => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.env.NODE_ENV = prevEnv;
  jest.restoreAllMocks();
});

describe('globalErrorHandler — production', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
  });

  it('500: thông báo chung, không lộ message/stack; chi tiết vẫn ghi log', () => {
    const res = makeRes();
    globalErrorHandler(errorWith('relation "users_secret" does not exist'), makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body).toEqual({ success: false, message: GENERIC_SERVER_ERROR_MESSAGE });
    expect(JSON.stringify(body)).not.toContain('users_secret');
    expect(errorSpy.mock.calls.flat().join(' ')).toContain('users_secret');
  });

  it('503 có mã nghiệp vụ → giữ code; requestId (nếu có) được trả', () => {
    const res = makeRes();
    globalErrorHandler(
      errorWith('Pool đầy: host db-internal:5432', { status: 503, code: 'RESOURCE_LOCKED' }),
      makeReq({ id: 'req-123' }),
      res,
      jest.fn()
    );
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json.mock.calls[0][0]).toEqual({
      success: false,
      message: GENERIC_SERVER_ERROR_MESSAGE,
      code: 'RESOURCE_LOCKED',
      requestId: 'req-123',
    });
  });

  it('mã hệ thống Node / SQLSTATE Postgres không bị trả ra', () => {
    const sysRes = makeRes();
    globalErrorHandler(
      errorWith('connect ECONNREFUSED 10.0.0.5:6379', { code: 'ECONNREFUSED', errno: -111, syscall: 'connect' }),
      makeReq(), sysRes, jest.fn()
    );
    expect(sysRes.json.mock.calls[0][0]).not.toHaveProperty('code');

    const pgRes = makeRes();
    globalErrorHandler(
      errorWith('duplicate key value violates unique constraint', { code: '23505', severity: 'ERROR' }),
      makeReq(), pgRes, jest.fn()
    );
    expect(pgRes.json.mock.calls[0][0]).not.toHaveProperty('code');
  });

  it('4xx giữ nguyên thông báo', () => {
    const res = makeRes();
    globalErrorHandler(errorWith('Unexpected token } in JSON at position 10', { status: 400, type: 'entity.parse.failed' }), makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0]).toEqual({ success: false, message: 'Unexpected token } in JSON at position 10' });

    const notFound = makeRes();
    globalErrorHandler(errorWith('Không tìm thấy', { statusCode: 404 }), makeReq(), notFound, jest.fn());
    expect(notFound.status).toHaveBeenCalledWith(404);
    expect(notFound.json.mock.calls[0][0].message).toBe('Không tìm thấy');
  });

  it('status không hợp lệ → 500 chung', () => {
    const res = makeRes();
    globalErrorHandler(errorWith('lạ', { status: 'abc' }), makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].message).toBe(GENERIC_SERVER_ERROR_MESSAGE);
  });

  it('lỗi multer giữ nguyên 413/400', () => {
    const res = makeRes();
    globalErrorHandler(errorWith('File too large', { name: 'MulterError', code: 'LIMIT_FILE_SIZE' }), makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json.mock.calls[0][0].code).toBe('FILE_TOO_LARGE');
  });

  it('đã gửi header → chuyển cho Express (next(err)), không ghi thêm', () => {
    const res = makeRes();
    res.headersSent = true;
    const next = jest.fn();
    const err = errorWith('giữa chừng');
    globalErrorHandler(err, makeReq(), res, next);
    expect(next).toHaveBeenCalledWith(err);
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('globalErrorHandler — ngoài production', () => {
  it('development: 500 giữ message gốc + stack', () => {
    process.env.NODE_ENV = 'development';
    const res = makeRes();
    globalErrorHandler(errorWith('chi tiết để gỡ lỗi'), makeReq(), res, jest.fn());
    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe('chi tiết để gỡ lỗi');
    expect(body.stack).toEqual(expect.any(String));
  });

  it('test: 500 giữ message gốc, không có stack', () => {
    process.env.NODE_ENV = 'test';
    const res = makeRes();
    globalErrorHandler(errorWith('chi tiết'), makeReq(), res, jest.fn());
    expect(res.json.mock.calls[0][0]).toEqual({ success: false, message: 'chi tiết' });
  });
});
