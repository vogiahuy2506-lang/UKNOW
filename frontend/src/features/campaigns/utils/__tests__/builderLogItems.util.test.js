import { describe, it, expect } from 'vitest';
import {
  BUILDER_LOG_ITEMS_CAP,
  GOOGLE_SHEET_PREVIEW_SERVER_MAX,
  resolveBuilderSheetPreviewLimit,
  resolveSheetPreviewApiLimit,
  resolveEffectiveBuilderLogItemsMode,
  cloneResultForBuilderLogDisplay,
} from '../builderLogItems.util';

describe('resolveBuilderSheetPreviewLimit', () => {
  it("mode='all' → trần server", () => {
    expect(resolveBuilderSheetPreviewLimit('all')).toBe(GOOGLE_SHEET_PREVIEW_SERVER_MAX);
  });

  it("mode='100' (hoặc khác 'all') → BUILDER_LOG_ITEMS_CAP=100", () => {
    expect(resolveBuilderSheetPreviewLimit('100')).toBe(BUILDER_LOG_ITEMS_CAP);
    expect(resolveBuilderSheetPreviewLimit('')).toBe(BUILDER_LOG_ITEMS_CAP);
    expect(resolveBuilderSheetPreviewLimit(undefined)).toBe(BUILDER_LOG_ITEMS_CAP);
  });
});

describe('resolveSheetPreviewApiLimit', () => {
  it("config.builderSheetPreviewRowLimit='all' → trần server", () => {
    expect(resolveSheetPreviewApiLimit({ builderSheetPreviewRowLimit: 'all' }, '100')).toBe(
      GOOGLE_SHEET_PREVIEW_SERVER_MAX
    );
  });

  it('số dương trong giới hạn → giữ nguyên', () => {
    expect(resolveSheetPreviewApiLimit({ builderSheetPreviewRowLimit: 500 }, '100')).toBe(500);
    expect(resolveSheetPreviewApiLimit({ builderSheetPreviewRowLimit: '250' }, '100')).toBe(250);
  });

  it('số vượt trần → clamp về trần server', () => {
    expect(
      resolveSheetPreviewApiLimit({ builderSheetPreviewRowLimit: 999999 }, '100')
    ).toBe(GOOGLE_SHEET_PREVIEW_SERVER_MAX);
  });

  it('số không hợp lệ (≤0, NaN, chuỗi rác) → fallback theo logItemsMode', () => {
    expect(resolveSheetPreviewApiLimit({ builderSheetPreviewRowLimit: 0 }, 'all')).toBe(
      GOOGLE_SHEET_PREVIEW_SERVER_MAX
    );
    expect(resolveSheetPreviewApiLimit({ builderSheetPreviewRowLimit: 'abc' }, '100')).toBe(
      BUILDER_LOG_ITEMS_CAP
    );
  });

  it('config rỗng/empty raw → fallback logItemsMode', () => {
    expect(resolveSheetPreviewApiLimit({}, '100')).toBe(BUILDER_LOG_ITEMS_CAP);
    expect(resolveSheetPreviewApiLimit({ builderSheetPreviewRowLimit: '   ' }, 'all')).toBe(
      GOOGLE_SHEET_PREVIEW_SERVER_MAX
    );
  });
});

describe('resolveEffectiveBuilderLogItemsMode', () => {
  it("node không phải read_sheet → mirror logItemsMode", () => {
    expect(resolveEffectiveBuilderLogItemsMode('send_email', {}, '100')).toBe('100');
    expect(resolveEffectiveBuilderLogItemsMode('send_email', {}, 'all')).toBe('all');
  });

  it("read_sheet với raw='all' → 'all'", () => {
    expect(
      resolveEffectiveBuilderLogItemsMode('read_sheet', { builderSheetPreviewRowLimit: 'all' }, '100')
    ).toBe('all');
  });

  it('read_sheet với raw > cap → "all" dù logItemsMode=100', () => {
    expect(
      resolveEffectiveBuilderLogItemsMode('read_sheet', { builderSheetPreviewRowLimit: 200 }, '100')
    ).toBe('all');
  });

  it('read_sheet với raw ≤ cap → mirror logItemsMode', () => {
    expect(
      resolveEffectiveBuilderLogItemsMode('read_sheet', { builderSheetPreviewRowLimit: 50 }, '100')
    ).toBe('100');
    expect(
      resolveEffectiveBuilderLogItemsMode('read_sheet', { builderSheetPreviewRowLimit: 50 }, 'all')
    ).toBe('all');
  });

  it('read_sheet config rỗng → mirror logItemsMode', () => {
    expect(resolveEffectiveBuilderLogItemsMode('read_sheet', {}, '100')).toBe('100');
    expect(resolveEffectiveBuilderLogItemsMode('read_sheet', undefined, 'all')).toBe('all');
  });
});

describe('cloneResultForBuilderLogDisplay', () => {
  it("null/undefined → input nguyên", () => {
    expect(cloneResultForBuilderLogDisplay(null, '100')).toBeNull();
    expect(cloneResultForBuilderLogDisplay(undefined, '100')).toBeUndefined();
  });

  it("mode='all' → identity", () => {
    const result = { output: { items: new Array(500).fill({ a: 1 }) } };
    expect(cloneResultForBuilderLogDisplay(result, 'all')).toBe(result);
  });

  it('không có output.items mảng → identity', () => {
    const result = { output: { items: 'not-array' } };
    expect(cloneResultForBuilderLogDisplay(result, '100')).toBe(result);
    expect(cloneResultForBuilderLogDisplay({ output: null }, '100')).toEqual({ output: null });
  });

  it('items.length ≤ cap → identity', () => {
    const items = new Array(BUILDER_LOG_ITEMS_CAP).fill({ a: 1 });
    const result = { output: { items } };
    expect(cloneResultForBuilderLogDisplay(result, '100')).toBe(result);
  });

  it('items.length > cap → clone + slice + meta', () => {
    const items = new Array(BUILDER_LOG_ITEMS_CAP + 50).fill({ a: 1 });
    const result = { output: { items, schema: ['a'] } };
    const out = cloneResultForBuilderLogDisplay(result, '100');
    expect(out).not.toBe(result);
    expect(out.output.items).toHaveLength(BUILDER_LOG_ITEMS_CAP);
    expect(out.output.schema).toEqual(['a']);
    expect(out.output.meta).toEqual({
      builderLogTotalItems: BUILDER_LOG_ITEMS_CAP + 50,
      builderLogPreviewed: BUILDER_LOG_ITEMS_CAP,
      builderLogTruncated: true,
    });
    expect(result.output.items).toHaveLength(BUILDER_LOG_ITEMS_CAP + 50);
  });

  it('items > cap với meta cũ → merge meta (giữ key cũ)', () => {
    const items = new Array(BUILDER_LOG_ITEMS_CAP + 1).fill({ a: 1 });
    const result = { output: { items, meta: { sourceLatencyMs: 999 } } };
    const out = cloneResultForBuilderLogDisplay(result, '100');
    expect(out.output.meta.sourceLatencyMs).toBe(999);
    expect(out.output.meta.builderLogTruncated).toBe(true);
  });
});
