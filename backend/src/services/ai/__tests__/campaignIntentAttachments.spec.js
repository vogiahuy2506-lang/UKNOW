import { describe, expect, it } from '@jest/globals';
import {
  deriveIntent,
  isCompilableIntent,
  validateCampaignIntentV1,
} from '../campaignIntent.schema.js';

describe('Việc 2: CampaignIntentV1 mang attachments và fileUsage', () => {
  it('deriveIntent rút đúng fileUsage và attachments từ gates và files', () => {
    const gates = {
      channel: 'zalo_group',
      senderAccountId: 10,
      zaloGroupIds: ['g1'],
      schedule: { mode: 'once' },
      fileUsage: 'both',
    };

    const files = [
      {
        key: 'campaigns/123/tailieu.pdf',
        name: 'tailieu.pdf',
        size: 102400,
        contentType: 'application/pdf',
      },
    ];

    const { intent, missing } = deriveIntent(gates, null, { files });
    expect(missing).toEqual([]);
    expect(intent.fileUsage).toBe('both');
    expect(intent.attachments).toEqual([
      {
        key: 'campaigns/123/tailieu.pdf',
        name: 'tailieu.pdf',
        size: 102400,
        contentType: 'application/pdf',
      },
    ]);
  });

  it('validateCampaignIntentV1 chấp nhận intent có attachments và fileUsage hợp lệ', () => {
    const validIntent = {
      version: 1,
      channel: 'zalo_group',
      sender: { type: 'zalo_account', id: 10 },
      audience: { type: 'zalo_contacts', recipientKind: 'phone' },
      schedule: { type: 'once' },
      fileUsage: 'as_attachment',
      attachments: [
        { key: 'storage/abc.pdf', name: 'abc.pdf', size: 5000, contentType: 'application/pdf' },
      ],
    };

    const check = validateCampaignIntentV1(validIntent);
    expect(check.valid).toBe(true);
    expect(check.errors).toEqual([]);
  });

  it('validateCampaignIntentV1 từ chối fileUsage không hợp lệ', () => {
    const invalidIntent = {
      version: 1,
      channel: 'zalo_group',
      fileUsage: 'unknown_mode',
    };

    const check = validateCampaignIntentV1(invalidIntent);
    expect(check.valid).toBe(false);
    expect(check.errors.some((e) => e.includes('fileUsage không hợp lệ'))).toBe(true);
  });

  it('isCompilableIntent không bắt buộc attachments hay fileUsage', () => {
    const intentWithoutFile = {
      version: 1,
      channel: 'zalo_group',
      sender: { type: 'zalo_account', id: 10 },
      audience: { type: 'zalo_contacts', recipientKind: 'phone' },
      schedule: { type: 'once' },
    };

    const check = isCompilableIntent(intentWithoutFile);
    expect(check.ok).toBe(true);
    expect(check.missing).toEqual([]);
  });
});
