/**
 * PR-1 (PLAN_NHAN_VIEN_KHONG_THAY_CHIEN_DICH mục 3, P4): PATCH /employees/:id/permissions phải
 * nhận `[]` như `{}` (chủ bấm "Lưu quyền hạn" khi chưa tick ô nào), nhưng vẫn từ chối mọi thứ
 * không phải object — kể cả mảng CÓ phần tử. Chạy trên router thật, controller mock, không DB.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

jest.unstable_mockModule('../../middleware/auth.middleware.js', () => ({
  default: (req, _res, next) => {
    req.user = { id: 7, role: 'user', activeContext: { type: 'self' } };
    next();
  },
  resolveUserContext: jest.fn(),
  optionalAuthMiddleware: (_req, _res, next) => next(),
  attachUserIdForRateLimit: (_req, _res, next) => next(),
  attachSseUserIdForRateLimit: (_req, _res, next) => next(),
}));

const mockUpdatePermissions = jest.fn((req, res) => res.json({ success: true, received: req.body.permissions }));
const noop = (_req, res) => res.json({ success: true });
jest.unstable_mockModule('../../controllers/employee.controller.js', () => ({
  myContribution: noop,
  getPermissionCatalog: noop,
  getCampaignApprovalThreshold: noop,
  updateCampaignApprovalThreshold: noop,
  getEmployees: noop,
  teamContribution: noop,
  teamOverview: noop,
  getEmployee: noop,
  createEmployee: noop,
  resendInvite: noop,
  linkEmployee: noop,
  updateInfo: noop,
  updateLimits: noop,
  updatePermissions: mockUpdatePermissions,
  updateStatus: noop,
  resetEmployeePassword: noop,
  deleteEmployee: noop,
}));

const { default: employeeRoutes } = await import('../employee.routes.js');

const app = express();
app.use(express.json());
app.use('/api/employees', employeeRoutes);

const patch = (permissions) => request(app).patch('/api/employees/42/permissions').send({ permissions });

beforeEach(() => {
  mockUpdatePermissions.mockClear();
});

describe('PATCH /api/employees/:id/permissions — validator', () => {
  it('object có quyền → tới controller', async () => {
    const res = await patch({ campaigns_view: true });
    expect(res.status).toBe(200);
    expect(mockUpdatePermissions).toHaveBeenCalledTimes(1);
  });

  it('object rỗng {} → tới controller', async () => {
    const res = await patch({});
    expect(res.status).toBe(200);
  });

  it('mảng RỖNG [] → tới controller (client chưa tick gì)', async () => {
    const res = await patch([]);
    expect(res.status).toBe(200);
    expect(mockUpdatePermissions).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['mảng có phần tử', ['campaigns_view']],
    ['chuỗi', 'not-an-object'],
    ['số', 5],
    ['null', null],
  ])('%s → 400, không tới controller', async (_label, value) => {
    const res = await patch(value);
    expect(res.status).toBe(400);
    expect(mockUpdatePermissions).not.toHaveBeenCalled();
  });

  it('thiếu hẳn trường permissions → 400', async () => {
    const res = await request(app).patch('/api/employees/42/permissions').send({});
    expect(res.status).toBe(400);
    expect(mockUpdatePermissions).not.toHaveBeenCalled();
  });
});
