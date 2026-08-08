import { describe, expect, it } from '@jest/globals';
import {
  ZALO_LIVE_ELSEWHERE_CODE,
  ZALO_LIVE_ELSEWHERE_MESSAGE,
  createZaloLiveElsewhereError,
  isPostgresUniqueViolation,
  mapUniqueViolationToZaloLiveElsewhere,
} from '../zaloOneWorkspace.util.js';

describe('zaloOneWorkspace.util', () => {
  it('createZaloLiveElsewhereError — message chung, không lộ email', () => {
    const err = createZaloLiveElsewhereError({
      ownerEmail: 'owner@example.com',
      revealOwner: false,
    });
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe(ZALO_LIVE_ELSEWHERE_CODE);
    expect(err.message).toBe(ZALO_LIVE_ELSEWHERE_MESSAGE);
    expect(err.message).not.toContain('owner@example.com');
  });

  it('createZaloLiveElsewhereError — superadmin được xem email', () => {
    const err = createZaloLiveElsewhereError({
      ownerEmail: 'owner@example.com',
      revealOwner: true,
    });
    expect(err.message).toContain('owner@example.com');
  });

  it('mapUniqueViolationToZaloLiveElsewhere — chỉ map 23505', () => {
    expect(mapUniqueViolationToZaloLiveElsewhere(new Error('x'))).toBeNull();
    expect(isPostgresUniqueViolation({ code: '23505' })).toBe(true);

    const mapped = mapUniqueViolationToZaloLiveElsewhere({
      code: '23505',
      constraint: 'uniq_zalo_settings_live_zalo_user',
    });
    expect(mapped?.statusCode).toBe(409);
    expect(mapped?.code).toBe(ZALO_LIVE_ELSEWHERE_CODE);
  });
});
