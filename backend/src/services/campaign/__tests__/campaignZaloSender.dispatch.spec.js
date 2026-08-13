import { describe, expect, it } from '@jest/globals';
import campaignZaloSenderService from '../campaignZaloSender.service.js';
import {
  ZALO_SEND_NOT_DELIVERED_MARKER,
  ZALO_SEND_PARTIAL_DELIVERY_CODE,
} from '../../../utils/zaloDispatchDelivery.util.js';

describe('sendMessageWithAttachmentDispatch delivery contract', () => {
  it('text msgId>0 is success', async () => {
    const result = await campaignZaloSenderService.sendMessageWithAttachmentDispatch({
      operationName: 'test_text_ok',
      message: 'hello',
      attachments: [],
      sendOperation: async () => ({ message: { msgId: 8128678217945 }, attachment: [] }),
    });
    expect(result.status).toBe('success');
    expect(result.dispatchCount).toBe(1);
    expect(result.dispatchResults[0].delivery.status).toBe('delivered');
  });

  it('text msgId:0 throws NOT_DELIVERED and does not retry remaining dispatches', async () => {
    let calls = 0;
    await expect(campaignZaloSenderService.sendMessageWithAttachmentDispatch({
      operationName: 'test_text_drop',
      message: 'hello',
      attachments: [],
      sendOperation: async () => {
        calls += 1;
        return { message: { msgId: 0 }, attachment: [] };
      },
    })).rejects.toMatchObject({
      message: expect.stringContaining(ZALO_SEND_NOT_DELIVERED_MARKER),
    });
    expect(calls).toBe(1);
  });

  it('first dispatch delivered then later not_delivered returns partial without throw', async () => {
    const responses = [
      { message: { msgId: 11 }, attachment: [{ msgId: 12 }] },
      { message: null, attachment: [{ msgId: 0 }] },
    ];
    let calls = 0;
    const result = await campaignZaloSenderService.sendMessageWithAttachmentDispatch({
      operationName: 'test_multi_partial',
      message: 'kèm file',
      attachments: [{ filename: 'a.pdf' }, { filename: 'b.pdf' }],
      sendOperation: async () => {
        const response = responses[calls];
        calls += 1;
        return response;
      },
    });
    expect(result.status).toBe('partial');
    expect(result.code).toBe(ZALO_SEND_PARTIAL_DELIVERY_CODE);
    expect(calls).toBe(2);
    expect(result.dispatchResults[0].delivery.status).toBe('delivered');
    expect(result.failedDispatch.index).toBe(1);
  });

  it('image caption message=null with valid attachment ids is success', async () => {
    const result = await campaignZaloSenderService.sendMessageWithAttachmentDispatch({
      operationName: 'test_image_ok',
      message: 'caption',
      attachments: [{ filename: 'shot.png' }],
      sendOperation: async () => ({ message: null, attachment: [{ msgId: '99' }] }),
    });
    expect(result.status).toBe('success');
    expect(result.dispatchResults[0].type).toBe('image_single');
  });

  it('file + text with attachment id and message.msgId 0 returns partial', async () => {
    const result = await campaignZaloSenderService.sendMessageWithAttachmentDispatch({
      operationName: 'test_file_partial',
      message: 'file text',
      attachments: [{ filename: 'doc.pdf' }],
      sendOperation: async () => ({
        message: { msgId: 0 },
        attachment: [{ msgId: '55' }],
      }),
    });
    expect(result.status).toBe('partial');
    expect(result.dispatchResults[0].delivery.status).toBe('partial');
  });

  it('first dispatch delivered then later throw returns partial without throw', async () => {
    const delivered = [];
    let calls = 0;
    const result = await campaignZaloSenderService.sendMessageWithAttachmentDispatch({
      operationName: 'test_second_throw',
      message: 'kèm file',
      attachments: [{ filename: 'a.pdf' }, { filename: 'b.pdf' }],
      sendOperation: async () => {
        calls += 1;
        if (calls === 1) {
          return { message: { msgId: 11 }, attachment: [{ msgId: 12 }] };
        }
        const err = new Error('second failed');
        err.code = 'ZALO_API';
        throw err;
      },
      onDispatchDelivered: (dispatchResult) => {
        delivered.push(...dispatchResult.msgIds);
      },
    });
    expect(result.status).toBe('partial');
    expect(result.code).toBe(ZALO_SEND_PARTIAL_DELIVERY_CODE);
    expect(calls).toBe(2);
    expect(result.dispatchResults[0].delivery.status).toBe('delivered');
    expect(result.failedDispatch.index).toBe(1);
    expect(result.failedDispatch.delivery.failedComponents).toEqual([{ kind: 'exception' }]);
    expect(delivered).toEqual(['11', '12']);
  });

  it('first dispatch throw still rethrows when nothing was delivered', async () => {
    await expect(campaignZaloSenderService.sendMessageWithAttachmentDispatch({
      operationName: 'test_first_throw',
      message: 'hello',
      attachments: [],
      sendOperation: async () => {
        throw new Error('first failed');
      },
    })).rejects.toThrow('first failed');
  });

  it('onDispatchDelivered is not called for msgId 0', async () => {
    const delivered = [];
    await expect(campaignZaloSenderService.sendMessageWithAttachmentDispatch({
      operationName: 'test_no_echo_zero',
      message: 'hello',
      attachments: [],
      sendOperation: async () => ({ message: { msgId: 0 }, attachment: [] }),
      onDispatchDelivered: (dispatchResult) => {
        delivered.push(dispatchResult);
      },
    })).rejects.toMatchObject({
      message: expect.stringContaining(ZALO_SEND_NOT_DELIVERED_MARKER),
    });
    expect(delivered).toEqual([]);
  });

  it('decorateZaloSendResult pass-through keeps partial instead of hardcoding success', () => {
    const decorated = campaignZaloSenderService.decorateZaloSendResult(
      { groupId: '1', attachmentsCount: 0 },
      {
        status: 'partial',
        response: { message: { msgId: 0 } },
        dispatchCount: 1,
        dispatchResults: [{
          type: 'text',
          index: 0,
          msgIds: [],
          delivery: { status: 'not_delivered', msgIds: [] },
        }],
        failedDispatch: { index: 0 },
      }
    );
    expect(decorated.status).toBe('partial');
    expect(decorated.code).toBe(ZALO_SEND_PARTIAL_DELIVERY_CODE);
  });
});
