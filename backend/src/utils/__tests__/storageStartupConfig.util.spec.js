import { describe, expect, it } from '@jest/globals';
import { validateStorageEnv } from '../storageStartupConfig.util.js';

describe('storage startup configuration', () => {
  it('allows widget and KB flags to remain off in shadow rollout', () => {
    expect(() => validateStorageEnv({
      STORAGE_WIDGET_CAP_ENABLED: 'false',
      STORAGE_KB_LIMIT_ENABLED: 'false',
    })).not.toThrow();
  });

  it('requires both positive widget byte caps when enabled', () => {
    expect(() => validateStorageEnv({
      STORAGE_WIDGET_CAP_ENABLED: 'true',
      STORAGE_WIDGET_BYTES_PER_IP_PER_DAY: '1000',
      STORAGE_WIDGET_BYTES_PER_CHATBOT_PER_DAY: '',
    })).toThrow('STORAGE_WIDGET_BYTES_PER_CHATBOT_PER_DAY');

    expect(() => validateStorageEnv({
      STORAGE_WIDGET_CAP_ENABLED: 'true',
      STORAGE_WIDGET_BYTES_PER_IP_PER_DAY: '1000',
      STORAGE_WIDGET_BYTES_PER_CHATBOT_PER_DAY: '5000',
    })).not.toThrow();
  });
});
