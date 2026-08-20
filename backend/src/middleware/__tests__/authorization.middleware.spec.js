import { describe, expect, it, jest } from '@jest/globals';
import {
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  requireSelfContext,
} from '../authorization.middleware.js';
import {
  normalizePermissions,
  VALID_PERMISSION_KEYS,
} from '../../config/employeePermissionCatalog.js';

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('authorization.middleware & employeePermissionCatalog', () => {
  describe('normalizePermissions', () => {
    it('drops unknown keys and coerces to boolean', () => {
      const input = {
        campaigns_view: true,
        campaigns_create: 'yes', // truthy but not strictly true
        unknown_hacker_key: true,
        leads: true,
      };
      const normalized = normalizePermissions(input);
      expect(normalized.campaigns_view).toBe(true);
      expect(normalized.campaigns_create).toBe(false);
      expect(normalized.leads).toBe(true);
      expect(normalized.unknown_hacker_key).toBeUndefined();
    });

    it('auto-resolves dependencies: campaigns_create/campaigns_run -> campaigns_view', () => {
      const normalized = normalizePermissions({ campaigns_create: true });
      expect(normalized.campaigns_create).toBe(true);
      expect(normalized.campaigns_view).toBe(true);

      const normalizedRun = normalizePermissions({ campaigns_run: true });
      expect(normalizedRun.campaigns_run).toBe(true);
      expect(normalizedRun.campaigns_view).toBe(true);
    });
  });

  describe('requirePermission', () => {
    it('allows superadmin regardless of permissions', () => {
      const req = { user: { role: 'admin' } };
      const res = mockRes();
      const next = jest.fn();

      requirePermission('campaigns_run')(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('allows self context (user role, self context)', () => {
      const req = { user: { role: 'user', activeContext: { type: 'self' } } };
      const res = mockRes();
      const next = jest.fn();

      requirePermission('campaigns_run')(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('allows employee when permission is true', () => {
      const req = {
        user: {
          role: 'user',
          activeContext: {
            type: 'employee',
            ownerId: 10,
            permissions: { campaigns_run: true },
          },
        },
      };
      const res = mockRes();
      const next = jest.fn();

      requirePermission('campaigns_run')(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('returns 403 PERMISSION_DENIED when employee lacks permission', () => {
      const req = {
        user: {
          role: 'user',
          activeContext: {
            type: 'employee',
            ownerId: 10,
            permissions: { campaigns_run: false, campaigns_view: true },
          },
        },
      };
      const res = mockRes();
      const next = jest.fn();

      requirePermission('campaigns_run')(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'PERMISSION_DENIED' })
      );
    });
  });

  describe('requireAnyPermission', () => {
    it('allows employee when at least one permission is true', () => {
      const req = {
        user: {
          role: 'user',
          activeContext: {
            type: 'employee',
            ownerId: 10,
            permissions: { email_templates: true, zalo_templates: false },
          },
        },
      };
      const res = mockRes();
      const next = jest.fn();

      requireAnyPermission(['email_templates', 'zalo_templates'])(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('returns 403 when employee has none of the permissions', () => {
      const req = {
        user: {
          role: 'user',
          activeContext: {
            type: 'employee',
            ownerId: 10,
            permissions: { email_templates: false, zalo_templates: false },
          },
        },
      };
      const res = mockRes();
      const next = jest.fn();

      requireAnyPermission(['email_templates', 'zalo_templates'])(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'PERMISSION_DENIED' })
      );
    });
  });

  describe('requireAllPermissions', () => {
    it('allows employee when all required permissions are true', () => {
      const req = {
        user: {
          role: 'user',
          activeContext: {
            type: 'employee',
            ownerId: 10,
            permissions: { campaigns_create: true, campaigns_run: true },
          },
        },
      };
      const res = mockRes();
      const next = jest.fn();

      requireAllPermissions(['campaigns_create', 'campaigns_run'])(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('returns 403 when employee only has some permissions', () => {
      const req = {
        user: {
          role: 'user',
          activeContext: {
            type: 'employee',
            ownerId: 10,
            permissions: { campaigns_create: true, campaigns_run: false },
          },
        },
      };
      const res = mockRes();
      const next = jest.fn();

      requireAllPermissions(['campaigns_create', 'campaigns_run'])(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'PERMISSION_DENIED' })
      );
    });
  });

  describe('requireSelfContext', () => {
    it('allows self context', () => {
      const req = { user: { role: 'user', activeContext: { type: 'self' } } };
      const res = mockRes();
      const next = jest.fn();

      requireSelfContext(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('returns 403 OWNER_ONLY for employee context', () => {
      const req = { user: { role: 'user', activeContext: { type: 'employee', ownerId: 10 } } };
      const res = mockRes();
      const next = jest.fn();

      requireSelfContext(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'OWNER_ONLY' })
      );
    });
  });
});
