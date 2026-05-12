import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../../utils/emailTemplateEditor.helpers', () => ({
  wrapEmailSrcDoc: vi.fn((html) => `<!doctype html><body>${html || ''}</body>`),
  normalizeS3KeyFromUrl: vi.fn((url) =>
    typeof url === 'string' ? url.replace(/^https?:\/\/[^/]+\//, '') : ''
  ),
}));

import useEmailTemplateDerivedData from '../useEmailTemplateDerivedData';

const baseProps = {
  bodyHtml: '<p>Hi</p>',
  templates: [],
  searchTerm: '',
  filterCategory: '',
  previewTemplate: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useEmailTemplateDerivedData — editorPreviewSrcDoc', () => {
  it('wrap bodyHtml qua wrapEmailSrcDoc', () => {
    const { result } = renderHook(() =>
      useEmailTemplateDerivedData({ ...baseProps, bodyHtml: '<h1>X</h1>' })
    );
    expect(result.current.editorPreviewSrcDoc).toContain('<h1>X</h1>');
  });

  it('memoize: bodyHtml không đổi → không re-call wrapEmailSrcDoc', async () => {
    const mod = await import('../../utils/emailTemplateEditor.helpers');
    const { rerender } = renderHook(({ html }) =>
      useEmailTemplateDerivedData({ ...baseProps, bodyHtml: html }),
      { initialProps: { html: '<p>A</p>' } }
    );
    const initialCalls = mod.wrapEmailSrcDoc.mock.calls.length;
    rerender({ html: '<p>A</p>' });
    expect(mod.wrapEmailSrcDoc.mock.calls.length).toBe(initialCalls);
    rerender({ html: '<p>B</p>' });
    expect(mod.wrapEmailSrcDoc.mock.calls.length).toBe(initialCalls + 1);
  });
});

describe('useEmailTemplateDerivedData — filteredTemplates', () => {
  const templates = [
    { templateName: 'Welcome Email', subject: 'Chào mừng', category: 'transactional' },
    { templateName: 'Promo Summer', subject: 'Khuyến mãi hè', category: 'marketing' },
    { templateName: 'Reminder', subject: 'Nhắc nhở khoá học', category: 'transactional' },
  ];

  it('search rỗng + category rỗng → trả full', () => {
    const { result } = renderHook(() =>
      useEmailTemplateDerivedData({ ...baseProps, templates })
    );
    expect(result.current.filteredTemplates).toHaveLength(3);
  });

  it('search keyword khớp templateName (case-insensitive)', () => {
    const { result } = renderHook(() =>
      useEmailTemplateDerivedData({ ...baseProps, templates, searchTerm: 'PROMO' })
    );
    expect(result.current.filteredTemplates).toHaveLength(1);
    expect(result.current.filteredTemplates[0].templateName).toBe('Promo Summer');
  });

  it('search keyword khớp subject', () => {
    const { result } = renderHook(() =>
      useEmailTemplateDerivedData({ ...baseProps, templates, searchTerm: 'nhắc' })
    );
    expect(result.current.filteredTemplates).toHaveLength(1);
    expect(result.current.filteredTemplates[0].templateName).toBe('Reminder');
  });

  it('filterCategory → giữ đúng category match (AND với search)', () => {
    const { result } = renderHook(() =>
      useEmailTemplateDerivedData({
        ...baseProps,
        templates,
        filterCategory: 'transactional',
      })
    );
    expect(result.current.filteredTemplates).toHaveLength(2);
    expect(result.current.filteredTemplates.every((t) => t.category === 'transactional')).toBe(true);
  });

  it('search + category combined (AND)', () => {
    const { result } = renderHook(() =>
      useEmailTemplateDerivedData({
        ...baseProps,
        templates,
        searchTerm: 'welcome',
        filterCategory: 'transactional',
      })
    );
    expect(result.current.filteredTemplates).toHaveLength(1);
  });

  it('templateName/subject null/undefined không crash', () => {
    const { result } = renderHook(() =>
      useEmailTemplateDerivedData({
        ...baseProps,
        templates: [{ templateName: null, subject: undefined, category: 'x' }],
        searchTerm: 'abc',
      })
    );
    expect(result.current.filteredTemplates).toHaveLength(0);
  });
});

describe('useEmailTemplateDerivedData — previewAttachments', () => {
  it('previewTemplate null → []', () => {
    const { result } = renderHook(() => useEmailTemplateDerivedData(baseProps));
    expect(result.current.previewAttachments).toEqual([]);
  });

  it('legacy attachmentUrl đơn → 1 item với fallback name "Tập đính kèm"', () => {
    const { result } = renderHook(() =>
      useEmailTemplateDerivedData({
        ...baseProps,
        previewTemplate: { attachmentUrl: 'https://s3.aws.com/bucket/file.pdf' },
      })
    );
    expect(result.current.previewAttachments).toHaveLength(1);
    expect(result.current.previewAttachments[0]).toEqual({
      name: 'Tập đính kèm',
      url: 'https://s3.aws.com/bucket/file.pdf',
      key: 'bucket/file.pdf',
    });
  });

  it('attachmentUrl + attachmentName → dùng tên custom', () => {
    const { result } = renderHook(() =>
      useEmailTemplateDerivedData({
        ...baseProps,
        previewTemplate: {
          attachmentUrl: 'https://x/a.pdf',
          attachmentName: 'Hợp đồng',
        },
      })
    );
    expect(result.current.previewAttachments[0].name).toBe('Hợp đồng');
  });

  it('attachments array of strings → mỗi item có name fallback "Tập đính kèm N"', () => {
    const { result } = renderHook(() =>
      useEmailTemplateDerivedData({
        ...baseProps,
        previewTemplate: {
          attachments: ['https://x/a.pdf', 'https://x/b.png'],
        },
      })
    );
    expect(result.current.previewAttachments).toHaveLength(2);
    expect(result.current.previewAttachments[0].name).toBe('Tập đính kèm 1');
    expect(result.current.previewAttachments[1].name).toBe('Tập đính kèm 2');
  });

  it('attachments array of objects với url/link/attachmentUrl + name/originalName/fileName fallback', () => {
    const { result } = renderHook(() =>
      useEmailTemplateDerivedData({
        ...baseProps,
        previewTemplate: {
          attachments: [
            { url: 'https://x/1', name: 'One' },
            { link: 'https://x/2', originalName: 'Two' },
            { attachmentUrl: 'https://x/3', fileName: 'Three' },
            { key: 'custom-key', url: 'https://x/4' },
          ],
        },
      })
    );
    expect(result.current.previewAttachments).toHaveLength(4);
    expect(result.current.previewAttachments[0].name).toBe('One');
    expect(result.current.previewAttachments[1].name).toBe('Two');
    expect(result.current.previewAttachments[2].name).toBe('Three');
    expect(result.current.previewAttachments[3].key).toBe('custom-key');
  });

  it('attachment object không có url → bị bỏ qua', () => {
    const { result } = renderHook(() =>
      useEmailTemplateDerivedData({
        ...baseProps,
        previewTemplate: {
          attachments: [{ name: 'orphan' }, { url: 'https://x/keep' }],
        },
      })
    );
    expect(result.current.previewAttachments).toHaveLength(1);
    expect(result.current.previewAttachments[0].url).toBe('https://x/keep');
  });

  it('legacy attachmentUrl + attachments array → cộng dồn', () => {
    const { result } = renderHook(() =>
      useEmailTemplateDerivedData({
        ...baseProps,
        previewTemplate: {
          attachmentUrl: 'https://x/legacy',
          attachments: [{ url: 'https://x/new' }],
        },
      })
    );
    expect(result.current.previewAttachments).toHaveLength(2);
    expect(result.current.previewAttachments[0].url).toBe('https://x/legacy');
    expect(result.current.previewAttachments[1].url).toBe('https://x/new');
  });
});
