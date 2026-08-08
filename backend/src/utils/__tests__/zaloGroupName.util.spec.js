import { describe, it, expect } from '@jest/globals';
import {
  normalizeZaloGroupId,
  extractGroupNameFromApiResult,
  isPlaceholderGroupName,
  buildPlaceholderGroupName,
  buildZaloGroupExternalIdCandidates,
  resolveZaloGroupSendId,
  isZaloGroupConversation,
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
    expect(normalizeZaloGroupId('g_12345')).toEqual({
      raw: 'g_12345',
      bare: '12345',
      prefixed: 'group_12345',
    });
    expect(normalizeZaloGroupId('group_g_12345')).toEqual({
      raw: 'group_g_12345',
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

  it('builds alternate group external_id candidates for lookup', () => {
    expect(buildZaloGroupExternalIdCandidates('g_99')).toEqual(
      expect.arrayContaining(['group_99', 'g_99', 'group_g_99', '99'])
    );
    expect(buildZaloGroupExternalIdCandidates('group_99')[0]).toBe('group_99');
  });

  it('resolves Zalo grid send id by stripping internal group_ prefix', () => {
    expect(resolveZaloGroupSendId('group_7445330951687908000')).toBe('7445330951687908000');
    expect(resolveZaloGroupSendId(null, 'group_99')).toBe('99');
    expect(resolveZaloGroupSendId('7445', 'group_ignored')).toBe('7445');
    expect(resolveZaloGroupSendId('g_abc')).toBe('abc');
    expect(isZaloGroupConversation({ externalId: 'group_1' })).toBe(true);
    expect(isZaloGroupConversation({ conversationInfo: { is_group: true } })).toBe(true);
    expect(isZaloGroupConversation({ externalId: 'user_1' })).toBe(false);
  });
});
