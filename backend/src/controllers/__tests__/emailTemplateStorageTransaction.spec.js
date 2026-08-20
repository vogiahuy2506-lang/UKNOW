import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const transactionClient = { query: jest.fn() };
const promoteTempToStorage = jest.fn();
const createTemplate = jest.fn();
const syncTemplateFile = jest.fn();
const enforceResourceLimitTx = jest.fn();

jest.unstable_mockModule('../upload.controller.js', () => ({
  default: { promoteTempToStorage },
}));
jest.unstable_mockModule('../../repositories/email/emailTemplate.repository.js', () => ({
  default: {
    create: createTemplate,
    syncTemplateFile,
  },
}));
jest.unstable_mockModule('../../config/database.js', () => ({
  default: { getClient: jest.fn() },
}));
jest.unstable_mockModule('../../utils/userResourceLimit.util.js', () => ({
  checkUserResourceLimit: jest.fn(async () => ({ allowed: true })),
  enforceResourceLimitTx,
}));
jest.unstable_mockModule('../../services/storage/storageQuota.service.js', () => ({
  resolveWorkspaceOwnerId: jest.fn(() => 42),
}));

const emailTemplateController = (await import('../emailTemplate.controller.js')).default;

describe('email template storage parent transaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createTemplate.mockResolvedValue({ id: 77, template_name: 'Welcome' });
    syncTemplateFile.mockResolvedValue(undefined);
    promoteTempToStorage.mockImplementation(async (files, userId, options) => {
      const moved = files.map((file, index) => ({
        tempId: file.tempId,
        key: `uploads/${userId}/file-${index}.pdf`,
        url: `/file/${index}`,
        originalName: file.originalName,
        storageObjectId: index + 1,
      }));
      await options.parentMutation(transactionClient, moved);
      return moved;
    });
  });

  it('creates the parent and template_files on the promote transaction client', async () => {
    const req = {
      user: { id: 9, role: 'employee', activeContext: { type: 'employee', ownerId: 42 } },
      body: {
        templateName: 'Welcome',
        subject: 'Hello',
        tempAttachments: [{ tempId: 'temp-1', originalName: 'brief.pdf', displayName: 'Brief' }],
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await emailTemplateController.create(req, res);

    expect(promoteTempToStorage).toHaveBeenCalledWith(req.body.tempAttachments, 9, expect.objectContaining({
      ownerUserId: 42,
      actorUserId: 9,
      category: 'email_template',
      referenceType: 'email_template',
      parentMutation: expect.any(Function),
    }));
    expect(enforceResourceLimitTx).toHaveBeenCalledWith(transactionClient, expect.objectContaining({
      userId: 9,
      resourceKey: 'emailTemplates',
    }));
    expect(createTemplate).toHaveBeenCalledWith(expect.objectContaining({
      attachments: [expect.objectContaining({ displayName: 'Brief', storageObjectId: 1 })],
    }), transactionClient);
    expect(syncTemplateFile).toHaveBeenCalledWith(77, expect.any(Object), transactionClient);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
