import { describe, expect, it } from '@jest/globals';

const { default: emailSettingsCrudService } = await import('../emailSettingsCrud.service.js');

describe('emailSettingsCrudService.mapListItem — cờ khoá theo gói', () => {
  it('is_locked true -> isLocked true; false/thiếu -> false', () => {
    expect(emailSettingsCrudService.mapListItem({ id: 1, is_locked: true }).isLocked).toBe(true);
    expect(emailSettingsCrudService.mapListItem({ id: 2, is_locked: false }).isLocked).toBe(false);
    expect(emailSettingsCrudService.mapListItem({ id: 3 }).isLocked).toBe(false);
  });
});
