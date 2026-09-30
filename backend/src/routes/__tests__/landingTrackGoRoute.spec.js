/**
 * GET /api/public/landing-track/go phải đi qua landingPagePublicController.getTrackGo (nơi kiểm đích
 * thuộc landing), không phải một handler chuyển hướng tới URL tuỳ ý.
 */
import { describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const mockGetTrackGo = jest.fn((req, res) => res.status(299).json({ viaController: true, query: req.query }));

jest.unstable_mockModule('../../controllers/landingPagePublic.controller.js', () => ({
  default: {
    getTrackGo: mockGetTrackGo,
    getPublishedByHost: jest.fn(),
    getPublishedFormConfig: jest.fn(),
  },
}));

const { default: router } = await import('../landingCmsPublic.routes.js');

describe('landingCmsPublic.routes — /landing-track/go', () => {
  it('uỷ quyền cho controller (không tự chuyển hướng)', async () => {
    const app = express();
    app.use('/api/public', router);
    const res = await request(app)
      .get('/api/public/landing-track/go')
      .query({ slug: 'promo', u: 'https://evil.example.net/' });
    expect(res.status).toBe(299);
    expect(res.headers.location).toBeUndefined();
    expect(mockGetTrackGo).toHaveBeenCalledTimes(1);
    expect(res.body.query).toEqual({ slug: 'promo', u: 'https://evil.example.net/' });
  });
});
