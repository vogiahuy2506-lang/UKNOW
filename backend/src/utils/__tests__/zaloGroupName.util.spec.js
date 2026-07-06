import { describe, it, expect } from '@jest/globals';
import {
  normalizeZaloGroupId,
  extractGroupNameFromApiResult,
  isPlaceholderGroupName,
  buildPlaceholderGroupName,
} from '../zaloGroupName.util.js';

describe('zaloGroupName.util', () => {
  it('normalizes group ids with and without prefix', () => {
    expect(normalizeZaloGroupId('group_12345')).toEqual({
      raw: 'group_12345',
      bare: '12345',
      prefixed: 'group_12345',
    });
    expect(normalizeZaloGroupId('12345')).toEqual({
      raw: '12345',
      bare: '12345',
      prefixed: 'group_12345',
    });
  });

  it('extracts group name from gridInfoMap using name field', () => {
    const result = {
      gridInfoMap: {
        172387: { name: 'Team Marketing' },
      },
    };
    expect(extractGroupNameFromApiResult(result, '172387')).toBe('Team Marketing');
    expect(extractGroupNameFromApiResult(result, 'group_172387')).toBe('Team Marketing');
  });

  it('detects placeholder group names', () => {
    expect(isPlaceholderGroupName('Nhóm 172387', '172387')).toBe(true);
    expect(isPlaceholderGroupName('Nhóm 3436373613436545579', '3436373613436545579')).toBe(true);
    expect(isPlaceholderGroupName('Team Marketing', '172387')).toBe(false);
  });

  it('builds short placeholder names', () => {
    expect(buildPlaceholderGroupName('3436373613436545579')).toBe('Nhóm 545579');
    expect(buildPlaceholderGroupName('group_172387')).toBe('Nhóm 172387');
  });
});
