/**
 * HTML email template do tenant soạn (màn admin liệt kê template của mọi tenant). Xem trước qua
 * iframe srcDoc KHÔNG có sandbox thì tài liệu thừa hưởng origin của app và script/onerror trong
 * HTML chạy được. Iframe xem trước phải có sandbox không kèm allow-scripts; allow-same-origin giữ
 * lại để resizeIframeToContent đọc chiều cao, allow-popups(+escape) để link mở tab mới.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render } from '@testing-library/react';
import EmailTemplatePreviewModal from '../EmailTemplatePreviewModal';
import EmailTemplateEditorModal from '../EmailTemplateEditorModal';
import { I18nProvider } from '../../../../i18n';
import {
  resizeIframeToContent,
  wrapEmailSrcDoc,
} from '../../utils/emailTemplateEditor.helpers';

const TENANT_HTML = '<h2 id="tenant-heading">Chào bạn</h2><img src="x" onerror="window.__xss = 1">';

const expectInertSandbox = (iframe) => {
  expect(iframe).not.toBeNull();
  expect(iframe.hasAttribute('sandbox')).toBe(true);
  const tokens = iframe.getAttribute('sandbox').split(/\s+/);
  expect(tokens).not.toContain('allow-scripts');
  expect(tokens).toContain('allow-same-origin');
  expect(tokens).toContain('allow-popups');
  expect(tokens).toContain('allow-popups-to-escape-sandbox');
};

describe('wrapEmailSrcDoc', () => {
  it('chèn CSP chặn script vào <head>, giữ <base target="_blank"> và nội dung', () => {
    const doc = wrapEmailSrcDoc(TENANT_HTML);
    const head = doc.slice(0, doc.indexOf('</head>'));
    expect(head).toMatch(/<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'"/);
    expect(head).toContain('<base target="_blank" />');
    expect(doc).toContain('id="tenant-heading"');
  });

  it('resizeIframeToContent vẫn đo chiều cao qua contentDocument (cần allow-same-origin)', () => {
    const iframe = {
      contentDocument: { documentElement: { scrollHeight: 900 }, body: { scrollHeight: 820 } },
      style: {},
    };
    resizeIframeToContent(iframe);
    expect(iframe.style.height).toBe('900px');
  });
});

describe('EmailTemplatePreviewModal — iframe sandbox', () => {
  it('HTML template chỉ nằm trong srcDoc của iframe sandbox không cho chạy script', () => {
    const iframeRef = createRef();
    render(
      <EmailTemplatePreviewModal
        showPreviewModal
        previewTemplate={{ templateName: 'Mẫu', subject: 'Tiêu đề', bodyHtml: TENANT_HTML }}
        previewAttachments={[]}
        getCategoryBadge={() => null}
        handleOpenAttachment={vi.fn()}
        setShowPreviewModal={vi.fn()}
        wrapEmailSrcDoc={wrapEmailSrcDoc}
        modalPreviewIframeRef={iframeRef}
        resizeIframeToContent={vi.fn()}
      />
    );
    const iframe = document.body.querySelector('iframe[title="Preview"]');
    expectInertSandbox(iframe);
    expect(iframe).toBe(iframeRef.current);
    expect(iframe.getAttribute('srcdoc')).toContain('tenant-heading');
    expect(document.getElementById('tenant-heading')).toBeNull();
  });
});

describe('EmailTemplateEditorModal — iframe xem trước sandbox', () => {
  it('khung xem trước HTML dùng sandbox không có allow-scripts', () => {
    const noop = vi.fn();
    render(
      <I18nProvider>
        <EmailTemplateEditorModal
          showEditorModal
          editingTemplate={null}
          setShowEditorModal={noop}
          setEditingTemplate={noop}
          handleSubmit={(e) => e.preventDefault()}
          formData={{ templateName: 'Mẫu', subject: 'Tiêu đề', category: '', bodyHtml: TENANT_HTML, bodyText: '', attachments: [] }}
          setFormData={noop}
          subjectInputRef={createRef()}
          setActiveInput={noop}
          updateSubjectValue={noop}
          editorTab="content"
          setEditorTab={noop}
          fileInputRef={createRef()}
          handleFileSelect={noop}
          isUploading={false}
          setShowAttachmentsModal={noop}
          contentTab="html"
          setIsPreviewVisible={noop}
          isPreviewVisible
          editorContainerRef={createRef()}
          editorSplit={50}
          setContentTab={noop}
          setShowVariableSuggestions={noop}
          htmlTextareaRef={createRef()}
          textTextareaRef={createRef()}
          updateContentValue={noop}
          showVariableSuggestions={false}
          variables={[]}
          activeInput="html"
          suggestionPosition={{ top: 0, left: 0 }}
          variableQuery=""
          insertVariableAtCursor={noop}
          startResize={noop}
          editorPreviewIframeRef={createRef()}
          editorPreviewSrcDoc={wrapEmailSrcDoc(TENANT_HTML)}
          resizeIframeToContent={noop}
          labels={[]}
        />
      </I18nProvider>
    );
    const iframes = document.body.querySelectorAll('iframe');
    expect(iframes).toHaveLength(1);
    expectInertSandbox(iframes[0]);
    expect(iframes[0].getAttribute('srcdoc')).toContain('tenant-heading');
    expect(document.getElementById('tenant-heading')).toBeNull();
  });
});
