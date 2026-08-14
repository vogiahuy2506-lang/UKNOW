import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { storageCapacityGuard } from '../storageCapacity.middleware.js';
import {
  __resetStorageCapacityForTests,
  __setStorageCapacityReaderForTests,
  STORAGE_POOL_TYPES,
} from '../../utils/storageCapacity.util.js';

afterEach(() => {
  __resetStorageCapacityForTests();
});

const snapshot = (percent) => ({
  filesystem: '/dev/test',
  mount: '/',
  total: 1000,
  used: percent * 10,
  available: 1000 - percent * 10,
  percent,
});

const createResponse = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
};

describe('storageCapacityGuard', () => {
  it('stops the request with a safe 503 response before upload middleware', async () => {
    __setStorageCapacityReaderForTests(async () => snapshot(80));
    const next = jest.fn();
    const res = createResponse();

    await storageCapacityGuard({
      paths: ['/tmp/local-upload'],
      poolType: STORAGE_POOL_TYPES.WORKSPACE,
    })({}, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      code: 'STORAGE_CAPACITY_PROTECTED',
      message: expect.any(String),
    });
  });

  it('continues when the target filesystem has capacity', async () => {
    __setStorageCapacityReaderForTests(async () => snapshot(79));
    const next = jest.fn();
    const res = createResponse();

    await storageCapacityGuard({
      paths: ['/tmp/local-upload'],
      poolType: STORAGE_POOL_TYPES.WORKSPACE,
    })({}, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('skips the disk check when a JSON route will not promote a temp file', async () => {
    const reader = jest.fn().mockResolvedValue(snapshot(90));
    __setStorageCapacityReaderForTests(reader);
    const next = jest.fn();
    const res = createResponse();

    await storageCapacityGuard({
      paths: ['/tmp/local-upload'],
      shouldCheck: (req) => Boolean(req.body?.imageTempId),
    })({ body: {} }, res, next);

    expect(reader).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });
});
