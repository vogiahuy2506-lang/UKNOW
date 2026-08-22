import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import api from '../../services/api';
import { useI18n } from '../../i18n';
import { validateFilesBeforeUpload, getUploadValidationErrorMessage } from '../../features/storage/validateUpload';
import { notifyStorageQuotaRefresh } from '../../features/storage/storageEvents';
import { miniMarkdownToHtml } from '../../utils/miniMarkdownToHtml';
import { HELP_ARTICLE_BODY_RICH_CLASS } from '../../constants/helpArticleBodyStyle';

/**
 * Class cho vùng soạn thảo — CÙNG bộ style với trang /huong-dan và ô Xem trước.
 *
 * BẮT BUỘC gom khoảng trắng về một dấu cách: HELP_ARTICLE_BODY_RICH_CLASS là
 * template string nhiều dòng. React nhận className kiểu đó vô tư, nhưng
 * ProseMirror đẩy chuỗi này qua `classList.add()`, mà DOMTokenList từ chối mọi
 * token chứa ký tự khoảng trắng — để nguyên là ném "Failed to execute 'add' on
 * 'DOMTokenList'" và hỏng nguyên trang sửa bài.
 */
const EDITOR_BODY_CLASS = `${HELP_ARTICLE_BODY_RICH_CLASS} max-w-none min-h-[280px] px-3 py-2 focus:outline-none text-slate-800`
  .replace(/\s+/g, ' ')
  .trim();

async function uploadHelpImageFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await api.post('/uploads/help-image', fd, {
    headers: { 'Content-Type': undefined },
  });
  const url = res.data?.data?.url;
  if (!url) throw new Error(res.data?.message || 'Upload ảnh thất bại');
  return url;
}

function ToolbarButton({ active, disabled, onClick, title, children }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded px-2 py-1.5 text-xs font-medium ${
        active ? 'bg-primary-100 text-primary-700' : 'text-slate-600 hover:bg-slate-100'
      } disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

/**
 * TipTap rich-text editor for help articles (admin).
 * Images go through POST /api/uploads/help-image (admin + raster whitelist).
 * Supports tables and inserting AI markdown.
 */
export default function RichTextEditor({
  value = '',
  onChange,
  placeholder = 'Soạn nội dung…',
  disabled = false,
}) {
  const { t, locale } = useI18n();
  const editorRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [showMarkdownModal, setShowMarkdownModal] = useState(false);
  const [markdownInput, setMarkdownInput] = useState('');
  const fileInputRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const insertImageFromFile = useCallback(async (ed, file) => {
    if (!file || !ed) return;
    // Help-article images write to the system storage pool (POST /uploads/help-image),
    // not the admin's own workspace — only the per-file size cap applies here.
    // Checking `storageQuota.remainingBytes` (workspace quota) would block an admin
    // whose personal workspace is nearly full even though this upload never touches it.
    const validation = validateFilesBeforeUpload([file], null);
    if (!validation.ok) {
      setUploadError(getUploadValidationErrorMessage(validation, t, locale));
      return;
    }
    setUploadError('');
    setUploading(true);
    try {
      const url = await uploadHelpImageFile(file);
      notifyStorageQuotaRefresh();
      ed.chain().focus().setImage({ src: url, alt: file.name || 'image' }).run();
    } catch (err) {
      setUploadError(err?.response?.data?.message || err.message || 'Upload ảnh thất bại');
    } finally {
      setUploading(false);
    }
  }, [locale, t]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Table.configure({
        resizable: false,
        HTMLAttributes: {
          class: 'w-full border-collapse border border-slate-200 my-4',
        },
      }),
      TableRow,
      TableHeader.configure({
        HTMLAttributes: {
          class: 'border border-slate-200 bg-slate-50 p-2 font-semibold text-left text-slate-900',
        },
      }),
      TableCell.configure({
        HTMLAttributes: {
          class: 'border border-slate-200 p-2 text-slate-700',
        },
      }),
    ],
    content: value || '',
    editable: !disabled,
    onUpdate: ({ editor: ed }) => {
      onChangeRef.current?.(ed.getHTML());
    },
    editorProps: {
      attributes: {
        // Dùng CHUNG bộ style với trang /huong-dan và ô Xem trước, thay vì
        // `prose` của @tailwindcss/typography — plugin đó không được cài
        // (tailwind.config.js: plugins: []), nên `prose` không sinh CSS nào,
        // trong khi preflight của Tailwind lại reset list-style về none và
        // font-size của h2/h3/h4 về như chữ thường. Hệ quả: trong khung soạn
        // thảo mọi thứ trông như đoạn văn phẳng — không thấy bullet, số thứ tự
        // hay cấp tiêu đề — phải liếc sang ô Xem trước mới biết mình đang sửa gì.
        class: EDITOR_BODY_CLASS,
        'data-placeholder': placeholder,
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        const ed = editorRef.current;
        if (!files?.length || !ed) return false;
        const image = Array.from(files).find((f) => f.type.startsWith('image/'));
        if (!image) return false;
        event.preventDefault();
        insertImageFromFile(ed, image);
        return true;
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        const ed = editorRef.current;
        if (!items || !ed) return false;
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              event.preventDefault();
              insertImageFromFile(ed, file);
              return true;
            }
          }
        }
        return false;
      },
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Sync external value when switching articles (not on every keystroke)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const next = value || '';
    if (next !== current && next !== '<p></p>') {
      editor.commands.setContent(next, false);
    }
  }, [value, editor]);

  useEffect(() => {
    if (editor) editor.setEditable(!disabled);
  }, [disabled, editor]);

  if (!editor) return null;

  const setLink = () => {
    const prev = editor.getAttributes('link').href || '';
    const url = window.prompt('URL liên kết', prev);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const handleInsertMarkdown = () => {
    if (!markdownInput.trim()) {
      setShowMarkdownModal(false);
      return;
    }
    const html = miniMarkdownToHtml(markdownInput);
    if (editor) {
      editor.chain().focus().insertContent(html).run();
    }
    setMarkdownInput('');
    setShowMarkdownModal(false);
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
        <ToolbarButton
          title="Đậm"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          title="Nghiêng"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton
          title="Gạch chân"
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <span className="underline">U</span>
        </ToolbarButton>
        <ToolbarButton
          title="Gạch ngang"
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <span className="line-through">S</span>
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <ToolbarButton
          title="Tiêu đề H2"
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          title="Tiêu đề H3"
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H3
        </ToolbarButton>
        <ToolbarButton
          title="Tiêu đề H4"
          active={editor.isActive('heading', { level: 4 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
        >
          H4
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <ToolbarButton
          title="Danh sách"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          • List
        </ToolbarButton>
        <ToolbarButton
          title="Danh sách số"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1. List
        </ToolbarButton>
        <ToolbarButton
          title="Trích dẫn"
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          Quote
        </ToolbarButton>
        <ToolbarButton
          title="Code"
          active={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          {'</>'}
        </ToolbarButton>
        <ToolbarButton
          title={t('adminHelp.table')}
          active={editor.isActive('table')}
          onClick={() => {
            if (editor.isActive('table')) {
              editor.chain().focus().deleteTable().run();
            } else {
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
            }
          }}
        >
          {t('adminHelp.table')}
        </ToolbarButton>
        <ToolbarButton
          title="Đường kẻ ngang"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          ―
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <ToolbarButton title="Liên kết" active={editor.isActive('link')} onClick={setLink}>
          Link
        </ToolbarButton>
        <ToolbarButton
          title="Chèn ảnh"
          disabled={uploading || disabled}
          onClick={() => fileInputRef.current?.click()}
        >
          Ảnh
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <ToolbarButton
          title={t('adminHelp.pasteMarkdownTitle')}
          disabled={disabled}
          onClick={() => setShowMarkdownModal(true)}
        >
          <span className="inline-flex items-center gap-1 font-semibold text-primary-600">
            <span>📝</span>
            <span>{t('adminHelp.pasteMarkdown')}</span>
          </span>
        </ToolbarButton>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) insertImageFromFile(editor, file);
          }}
        />
        {uploading && (
          <span className="ml-2 text-xs text-slate-500">Đang tải ảnh…</span>
        )}
      </div>

      <EditorContent editor={editor} />

      {uploadError && (
        <p className="border-t border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">{uploadError}</p>
      )}

      {showMarkdownModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                {t('adminHelp.pasteMarkdownTitle')}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowMarkdownModal(false);
                  setMarkdownInput('');
                }}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-500">
              {t('adminHelp.pasteMarkdownPlaceholder')}
            </p>
            <textarea
              className="w-full h-64 rounded-lg border border-slate-300 p-3 font-mono text-xs focus:border-primary-500 focus:outline-none"
              placeholder="# Tiêu đề hướng dẫn\n\nNội dung được tạo bởi AI...\n\n| Cột 1 | Cột 2 |\n|---|---|\n| Giá trị 1 | Giá trị 2 |"
              value={markdownInput}
              onChange={(e) => setMarkdownInput(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowMarkdownModal(false);
                  setMarkdownInput('');
                }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {t('adminHelp.pasteMarkdownCancel')}
              </button>
              <button
                type="button"
                onClick={handleInsertMarkdown}
                disabled={!markdownInput.trim()}
                className="rounded-lg bg-primary-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {t('adminHelp.pasteMarkdownInsert')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
