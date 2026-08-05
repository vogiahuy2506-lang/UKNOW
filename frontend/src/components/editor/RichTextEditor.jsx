import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import api from '../../services/api';

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
 */
export default function RichTextEditor({
  value = '',
  onChange,
  placeholder = 'Soạn nội dung…',
  disabled = false,
}) {
  const editorRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const insertImageFromFile = useCallback(async (ed, file) => {
    if (!file || !ed) return;
    setUploadError('');
    setUploading(true);
    try {
      const url = await uploadHelpImageFile(file);
      ed.chain().focus().setImage({ src: url, alt: file.name || 'image' }).run();
    } catch (err) {
      setUploadError(err?.response?.data?.message || err.message || 'Upload ảnh thất bại');
    } finally {
      setUploading(false);
    }
  }, []);

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
    ],
    content: value || '',
    editable: !disabled,
    onUpdate: ({ editor: ed }) => {
      onChangeRef.current?.(ed.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-sm max-w-none min-h-[280px] px-3 py-2 focus:outline-none text-slate-800',
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
    </div>
  );
}
