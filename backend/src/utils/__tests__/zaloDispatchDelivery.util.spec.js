import { describe, expect, it } from '@jest/globals';
import {
  buildZaloPartialCampaignOutcome,
  classifyZaloDispatchDelivery,
  collectDeliveredZaloMsgIds,
  createZaloSendNotDeliveredError,
  describeZaloOutboundFailure,
  extractValidZaloMsgIds,
  isPositiveZaloMsgId,
  isZaloOutboundResultSuccessful,
  isZaloPartialDeliveryResult,
  isZaloSendNotDeliveredError,
  mapZaloPartialDelivery,
  resolveZaloContinuousSendFailureProgress,
  shouldAdvanceZaloContinuousLedger,
  shouldAdvanceZaloOneShotLedger,
  ZALO_PARTIAL_DELIVERY_CATEGORY,
  ZALO_SEND_NOT_DELIVERED_CODE,
  ZALO_SEND_NOT_DELIVERED_MARKER,
  ZALO_SEND_PARTIAL_DELIVERY_CODE,
  ZALO_SILENT_DROP_CATEGORY,
} from '../zaloDispatchDelivery.util.js';
import { classifyZaloSendError } from '../zaloSendErrorClassifier.util.js';

describe('isPositiveZaloMsgId', () => {
  it('accepts integer/string ids starting 1-9, including large values', () => {
    expect(isPositiveZaloMsgId(8128678217945)).toBe(true);
    expect(isPositiveZaloMsgId('8128678217945')).toBe(true);
    expect(isPositiveZaloMsgId(1)).toBe(true);
    expect(isPositiveZaloMsgId(9007199254740993n)).toBe(true);
  });

  it('rejects 0, "0", null, missing, and non-digit strings', () => {
    expect(isPositiveZaloMsgId(0)).toBe(false);
    expect(isPositiveZaloMsgId('0')).toBe(false);
    expect(isPositiveZaloMsgId(null)).toBe(false);
    expect(isPositiveZaloMsgId(undefined)).toBe(false);
    expect(isPositiveZaloMsgId('')).toBe(false);
    expect(isPositiveZaloMsgId('0123')).toBe(false);
    expect(isPositiveZaloMsgId('abc')).toBe(false);
    expect(isPositiveZaloMsgId(1.5)).toBe(false);
  });
});

describe('extractValidZaloMsgIds', () => {
  it('reads message and attachment ids, skipping zeros', () => {
    expect(extractValidZaloMsgIds({
      message: { msgId: 0 },
      attachment: [{ msgId: '8128678217945' }, { msgId: 0 }],
    })).toEqual(['8128678217945']);
  });
});

describe('classifyZaloDispatchDelivery', () => {
  it('text with positive msgId is delivered', () => {
    expect(classifyZaloDispatchDelivery({
      dispatch: { type: 'text', msg: 'hello', attachments: [] },
      response: { message: { msgId: 8128678217945 }, attachment: [] },
    })).toMatchObject({ status: 'delivered', msgIds: ['8128678217945'] });
  });

  it('text msgId 0 / "0" / missing is not_delivered', () => {
    const dispatch = { type: 'text', msg: 'hello', attachments: [] };
    expect(classifyZaloDispatchDelivery({
      dispatch,
      response: { message: { msgId: 0 }, attachment: [] },
    }).status).toBe('not_delivered');
    expect(classifyZaloDispatchDelivery({
      dispatch,
      response: { message: { msgId: '0' }, attachment: [] },
    }).status).toBe('not_delivered');
    expect(classifyZaloDispatchDelivery({
      dispatch,
      response: { message: null, attachment: [] },
    }).status).toBe('not_delivered');
  });

  it('image caption with message=null and valid attachment ids is delivered', () => {
    const result = classifyZaloDispatchDelivery({
      dispatch: {
        type: 'image_single',
        msg: 'caption',
        attachments: [{ filename: 'a.png' }],
      },
      response: { message: null, attachment: [{ msgId: '9' }] },
    });
    expect(result.status).toBe('delivered');
    expect(result.msgIds).toEqual(['9']);
  });

  it('file + text: attachment ok but message.msgId=0 is partial', () => {
    const result = classifyZaloDispatchDelivery({
      dispatch: {
        type: 'file_single',
        msg: 'kèm file',
        attachments: [{ filename: 'a.pdf' }],
      },
      response: { message: { msgId: 0 }, attachment: [{ msgId: '55' }] },
    });
    expect(result.status).toBe('partial');
    expect(result.msgIds).toEqual(['55']);
    expect(result.failedComponents).toEqual([{ kind: 'text' }]);
  });

  it('image_group with one attachment id 0 is partial', () => {
    const result = classifyZaloDispatchDelivery({
      dispatch: {
        type: 'image_group',
        msg: '',
        attachments: [{ filename: 'a.png' }, { filename: 'b.png' }],
      },
      response: { message: null, attachment: [{ msgId: '11' }, { msgId: 0 }] },
    });
    expect(result.status).toBe('partial');
    expect(result.msgIds).toEqual(['11']);
  });
});

describe('NOT_DELIVERED / PARTIAL contracts', () => {
  it('NOT_DELIVERED survives BullMQ-style new Error(message) and failedReason', () => {
    const original = createZaloSendNotDeliveredError({
      operationName: 'send_group_message',
      dispatchIndex: 0,
      dispatchCount: 1,
    });
    expect(original.code).toBe(ZALO_SEND_NOT_DELIVERED_CODE);
    expect(original.message).toContain(ZALO_SEND_NOT_DELIVERED_MARKER);
    const wrapped = new Error(original.message);
    expect(isZaloSendNotDeliveredError(wrapped)).toBe(true);
    expect(isZaloSendNotDeliveredError({ failedReason: original.message })).toBe(true);
    expect(classifyZaloSendError(wrapped).category).toBe(ZALO_SILENT_DROP_CATEGORY);
  });

  it('classifies NOT_DELIVERED before fuzzy policy matchers', () => {
    const error = createZaloSendNotDeliveredError({ operationName: 'send_personal_message' });
    expect(classifyZaloSendError(error).category).toBe(ZALO_SILENT_DROP_CATEGORY);
  });

  it('partial is a completed result, not an Error/failedReason', () => {
    const result = mapZaloPartialDelivery({
      status: 'partial',
      dispatchCount: 2,
      failedDispatch: { index: 1 },
    });
    expect(result.code).toBe(ZALO_SEND_PARTIAL_DELIVERY_CODE);
    expect(result.errorCategory).toBe(ZALO_PARTIAL_DELIVERY_CATEGORY);
    expect(isZaloPartialDeliveryResult({ status: 'partial', ...result })).toBe(true);
    expect(isZaloSendNotDeliveredError(result)).toBe(false);
  });

  it('collects msgIds from delivered and partial dispatches only', () => {
    expect(collectDeliveredZaloMsgIds([
      { delivery: { status: 'delivered' }, msgIds: ['1'] },
      { delivery: { status: 'partial' }, msgIds: ['2', '0'] },
      { delivery: { status: 'not_delivered' }, msgIds: ['3'] },
    ])).toEqual(['1', '2']);
  });
});

describe('campaign ledger + preview/diagnostic contracts', () => {
  it('continuous partial advances step without counting as success', () => {
    const outcome = buildZaloPartialCampaignOutcome({ status: 'partial' });
    expect(outcome.success).toBe(false);
    expect(outcome.advanceLedger).toBe(true);
    expect(shouldAdvanceZaloContinuousLedger(outcome)).toBe(true);
    expect(shouldAdvanceZaloOneShotLedger(outcome)).toBe(false);
  });

  it('silent drop keeps step pending; failure count reaches max 5 then abandon', () => {
    const dropOutcome = { success: false, status: 'failed' };
    expect(shouldAdvanceZaloContinuousLedger(dropOutcome)).toBe(false);
    expect(shouldAdvanceZaloOneShotLedger(dropOutcome)).toBe(false);

    let prev = 0;
    const ticks = [];
    for (let i = 0; i < 5; i += 1) {
      const progress = resolveZaloContinuousSendFailureProgress({
        prevFailureCount: prev,
        maxFailures: 5,
      });
      ticks.push(progress);
      prev = progress.nextFailureCount;
    }
    expect(ticks.map((t) => t.nextFailureCount)).toEqual([1, 2, 3, 4, 5]);
    expect(ticks.slice(0, 4).every((t) => t.keepStepPending && !t.abandon)).toBe(true);
    expect(ticks[4]).toMatchObject({ nextFailureCount: 5, abandon: true, keepStepPending: false });
  });

  it('one-shot does not advance ledger on partial', () => {
    expect(shouldAdvanceZaloOneShotLedger(buildZaloPartialCampaignOutcome({ status: 'partial' }))).toBe(false);
    expect(shouldAdvanceZaloOneShotLedger({ success: true })).toBe(true);
  });

  it('preview/diagnostic treat any completed status !== success as failure', () => {
    expect(isZaloOutboundResultSuccessful({ status: 'success' })).toBe(true);
    expect(isZaloOutboundResultSuccessful({ status: 'partial' })).toBe(false);
    expect(isZaloOutboundResultSuccessful({ status: 'failed' })).toBe(false);
    expect(isZaloOutboundResultSuccessful({ status: 'sent' })).toBe(false);
    expect(isZaloOutboundResultSuccessful({})).toBe(false);
    expect(isZaloOutboundResultSuccessful({ dryRun: true }, { allowDryRun: true })).toBe(true);
    expect(isZaloOutboundResultSuccessful({ dryRun: true })).toBe(false);

    const mapped = describeZaloOutboundFailure({ status: 'partial', dispatchCount: 2, failedDispatch: { index: 1 } });
    expect(mapped.errorCategory).toBe(ZALO_PARTIAL_DELIVERY_CATEGORY);
    expect(describeZaloOutboundFailure({ status: 'nope' }).errorCategory).toBe('UNKNOWN');
  });
});
