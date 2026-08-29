import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import heroConsultationService from '../heroConsultation.service.js';

describe('heroConsultation.service quota & daily cap', () => {
  beforeEach(() => {
    heroConsultationService._resetForTests();
  });

  it('allows 5 chats per visitorId and decrements quota properly', async () => {
    // Mock fetch for Gemini API
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{ content: { parts: [{ text: 'Xin chao!' }] } }]
        }),
      })
    );
    process.env.GEMINI_API_KEY = 'mock_key';

    try {
      const visitorId = 'visitor_test_1';

      // 5 requests should succeed
      for (let i = 1; i <= 5; i++) {
        const remainingBefore = await heroConsultationService.getRemainingQuota(visitorId);
        expect(remainingBefore).toBe(5 - (i - 1));

        const res = await heroConsultationService.processChat({
          visitorId,
          message: `Hello ${i}`,
          ip: '192.168.1.1',
        });

        expect(res.success).toBe(true);
        expect(res.reply).toBe('Xin chao!');
        expect(res.chatsUsed).toBe(i);
      }

      // 6th request should fail with QUOTA_EXCEEDED
      const res6 = await heroConsultationService.processChat({
        visitorId,
        message: 'Hello 6',
        ip: '192.168.1.1',
      });

      expect(res6.success).toBe(false);
      expect(res6.code).toBe('QUOTA_EXCEEDED');
      expect(res6.message).toContain('het luot chat mien phi');

      const remainingAfter = await heroConsultationService.getRemainingQuota(visitorId);
      expect(remainingAfter).toBe(0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('handles burst concurrent requests atomically without check-then-act race conditions', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockImplementation(async () => {
      // Simulate artificial delay in AI generation
      await new Promise(r => setTimeout(r, 10));
      return {
        ok: true,
        json: () => Promise.resolve({
          candidates: [{ content: { parts: [{ text: 'Parallel reply' }] } }]
        }),
      };
    });
    process.env.GEMINI_API_KEY = 'mock_key';

    try {
      const visitorId = 'burst_visitor';
      // Fire 10 concurrent requests at the exact same moment
      const requests = Array.from({ length: 10 }, (_, i) =>
        heroConsultationService.processChat({
          visitorId,
          message: `Burst message ${i}`,
          ip: '192.168.1.50',
        })
      );

      const results = await Promise.all(requests);
      const successful = results.filter(r => r.success);
      const blocked = results.filter(r => !r.success && r.code === 'QUOTA_EXCEEDED');

      // Exactly 5 should pass and exactly 5 should be blocked
      expect(successful).toHaveLength(5);
      expect(blocked).toHaveLength(5);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('does not consume IP cap when visitor quota is already exceeded (shared NAT/office protection)', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{ content: { parts: [{ text: 'Tra loi hop le' }] } }]
        }),
      })
    );
    process.env.GEMINI_API_KEY = 'mock_key';

    try {
      const sharedIp = '203.0.113.195';
      const visitorA = 'visitor_A_office';
      const visitorB = 'visitor_B_office';

      // 1. Visitor A consumes all 5 free chats
      for (let i = 1; i <= 5; i++) {
        const res = await heroConsultationService.processChat({
          visitorId: visitorA,
          message: `Chat ${i} from A`,
          ip: sharedIp,
        });
        expect(res.success).toBe(true);
      }

      // 2. Visitor A spams 25 more requests while out of quota
      for (let i = 1; i <= 25; i++) {
        const resSpam = await heroConsultationService.processChat({
          visitorId: visitorA,
          message: `Spam attempt ${i}`,
          ip: sharedIp,
        });
        expect(resSpam.success).toBe(false);
        expect(resSpam.code).toBe('QUOTA_EXCEEDED');
        expect(resSpam.message).toContain('het luot chat mien phi');
      }

      // 3. Visitor B behind the same IP must still be able to chat (IP cap of 30 was only incremented 5 times)
      const resB = await heroConsultationService.processChat({
        visitorId: visitorB,
        message: 'Hello from visitor B',
        ip: sharedIp,
      });

      expect(resB.success).toBe(true);
      expect(resB.reply).toBe('Tra loi hop le');
      expect(resB.chatsUsed).toBe(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('enforces HERO_IP_DAILY_CAP when changing visitorId from same IP', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{ content: { parts: [{ text: 'Phan hoi AI' }] } }]
        }),
      })
    );
    process.env.GEMINI_API_KEY = 'mock_key';

    try {
      const ip = '10.0.0.99';
      const cap = heroConsultationService.heroIpDailyCap; // 30 by default

      // Simulate requests across multiple visitors behind same IP up to cap
      for (let i = 1; i <= cap; i++) {
        const visitorId = `visitor_ip_test_${i}`;
        const res = await heroConsultationService.processChat({
          visitorId,
          message: 'Tin nhan tu khach',
          ip,
        });
        expect(res.success).toBe(true);
      }

      // Request (cap + 1) from new visitor under same IP should be blocked by IP daily cap
      const resBlocked = await heroConsultationService.processChat({
        visitorId: 'visitor_ip_test_overflow',
        message: 'Tin nhan qua han',
        ip,
      });

      expect(resBlocked.success).toBe(false);
      expect(resBlocked.code).toBe('QUOTA_EXCEEDED');
      expect(resBlocked.message).toContain('trong ngay');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('rejects invalid inputs', async () => {
    const resNoVisitor = await heroConsultationService.processChat({
      visitorId: '',
      message: 'Hello',
    });
    expect(resNoVisitor.success).toBe(false);
    expect(resNoVisitor.code).toBe('INVALID_INPUT');

    const resNoMessage = await heroConsultationService.processChat({
      visitorId: 'v123',
      message: '   ',
    });
    expect(resNoMessage.success).toBe(false);
    expect(resNoMessage.code).toBe('INVALID_INPUT');
  });
});
