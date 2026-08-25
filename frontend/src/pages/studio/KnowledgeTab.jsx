import { useState, useRef, useEffect, useCallback } from 'react';
import {
  HiOutlineUpload,
  HiOutlinePlus,
  HiOutlineDocumentText,
  HiOutlineTrash,
  HiOutlineRefresh,
  HiOutlineBookOpen,
  HiOutlineX,
  HiOutlineGlobeAlt,
  HiOutlineEye,
  HiOutlineExternalLink,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';

const ALLOWED_DOC_EXTS = ['txt', 'md', 'csv', 'json', 'html', 'htm', 'pdf', 'doc', 'docx', 'xlsx', 'xls', 'png', 'jpg', 'jpeg', 'webp', 'pptx'];
const ALLOWED_ACCEPT = '.pdf,.docx,.doc,.txt,.md,.csv,.json,.html,.htm,.xlsx,.xls,.png,.jpg,.jpeg,.webp,.pptx';
const ALLOWED_FORMATS_LABEL = [...new Set(
  ALLOWED_ACCEPT.split(',')
    .map((ext) => ext.replace(/^\./, '').toUpperCase())
    .map((ext) => {
      if (ext === 'HTM') return 'HTML';
      if (ext === 'DOC') return 'DOCX';
      if (ext === 'XLS') return 'XLSX';
      if (ext === 'JPEG') return 'JPG';
      return ext;
    })
)].join(', ');
const MAX_FILE_MB = 10;

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function KnowledgeTab({ chatbot, onDocumentsChange, initialDocuments = [] }) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [showUpload, setShowUpload] = useState(false);
  const [showText, setShowText] = useState(false);
  const [showUrlScrape, setShowUrlScrape] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [addingText, setAddingText] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [viewingDoc, setViewingDoc] = useState(null);

  const [uploadFile, setUploadFile] = useState(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);
  const dragCounter = useRef(0);

  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');

  const [scrapeUrl, setScrapeUrl] = useState('');

  const handleViewDocument = async (doc) => {
    setViewingDoc({ ...doc, loading: true });
    try {
      const res = await chatbotApi.getDocument(chatbot.id, doc.id);
      if (res.data?.document) {
        setViewingDoc({ ...doc, ...res.data.document, loading: false });
      } else {
        toast.error('Không thể tải nội dung');
        setViewingDoc(null);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể tải nội dung');
      setViewingDoc(null);
    }
  };

  const loadDocuments = useCallback(async () => {
    if (!chatbot?.id) return;
    try {
      const res = await chatbotApi.listCustomChatDocuments(chatbot.id);
      const list = res?.data?.documents || res?.documents || res?.data || [];
      setDocuments(Array.isArray(list) ? list : (chatbot.documents || []));
    } catch {
      setDocuments(chatbot.documents || []);
    }
  }, [chatbot]);

  // Only load from API if no initial documents provided
  useEffect(() => {
    if (chatbot?.id) {
      if (initialDocuments.length > 0) {
        setDocuments(initialDocuments);
      } else {
        loadDocuments();
      }
    }
  }, [chatbot?.id, initialDocuments]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setUploadTitle((prev) => prev || file.name.replace(/\.[^.]+$/, ''));
    e.target.value = '';
    setShowUpload(true);
  };

  const handleUploadFile = async (e) => {
    e?.preventDefault?.();
    if (!uploadFile) {
      toast.error('Vui lòng chọn file');
      return;
    }
    if (uploadFile.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`File vượt quá ${MAX_FILE_MB}MB`);
      return;
    }
    const ext = uploadFile.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_DOC_EXTS.includes(ext)) {
      toast.error(`Định dạng không hỗ trợ. Vui lòng dùng: ${ALLOWED_DOC_EXTS.join(', ')}`);
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('chatbot_id', String(chatbot.id));
      const res = await chatbotApi.uploadCustomChatDocument(fd);
      if (res.data?.success) {
        toast.success(`Đã huấn luyện thành công: ${res.data.chunks || 0} đoạn`);
        setShowUpload(false);
        setUploadFile(null);
        setUploadTitle('');
        await loadDocuments();
        onDocumentsChange?.();
      } else {
        toast.error(res.data?.message || 'Upload thất bại');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Upload thất bại');
    } finally {
      setUploading(false);
    }
  };

  const handleAddText = async (e) => {
    e.preventDefault();
    if (!textContent.trim()) {
      toast.error('Vui lòng nhập nội dung');
      return;
    }
    setAddingText(true);
    try {
      const res = await chatbotApi.addCustomChatTextDocument(chatbot.id, {
        title: textTitle || 'Text Document',
        content: textContent,
      });
      if (res.data?.success) {
        toast.success('Đã thêm văn bản vào knowledge base');
        setShowText(false);
        setTextTitle('');
        setTextContent('');
        await loadDocuments();
        onDocumentsChange?.();
      } else {
        toast.error(res.data?.message || 'Thêm văn bản thất bại');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Thêm văn bản thất bại');
    } finally {
      setAddingText(false);
    }
  };

  const handleScrapeUrl = async (e) => {
    e.preventDefault();
    if (!scrapeUrl.trim()) {
      toast.error('Vui lòng nhập URL');
      return;
    }
    let normalizedUrl = scrapeUrl.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }
    try {
      new URL(normalizedUrl);
    } catch {
      toast.error('URL không hợp lệ');
      return;
    }
    setScraping(true);
    try {
      const res = await chatbotApi.scrapeCustomChatWebsite(chatbot.id, {
        url: normalizedUrl,
      });
      if (res.data?.success) {
        toast.success(`Đã trích xuất: ${res.data.chunks || 0} đoạn từ ${res.data.pages || 1} trang`);
        setShowUrlScrape(false);
        setScrapeUrl('');
        await loadDocuments();
        onDocumentsChange?.();
      } else {
        toast.error(res.data?.message || 'Trích xuất thất bại');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Trích xuất thất bại');
    } finally {
      setScraping(false);
    }
  };

  const handleDelete = async (doc) => {
    if (!confirm(`Xóa tài liệu "${doc.title}"?`)) return;
    setDeletingId(doc.id);
    try {
      const docId = typeof doc.id === 'string' ? doc.id : String(doc.id);
      await chatbotApi.deleteDocument(chatbot.id, docId);
      toast.success('Đã xóa tài liệu');
      await loadDocuments();
      onDocumentsChange?.();
    } catch (err) {
      console.error('[KnowledgeTab] Delete error:', err);
      toast.error(err?.response?.data?.message || 'Không thể xóa tài liệu');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.items?.length) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setUploadTitle(file.name.replace(/\.[^.]+$/, ''));
    setShowUpload(true);
  }, []);

  const openUpload = () => fileInputRef.current?.click();

  const getStatusBadge = (status) => {
    if (status === 'ready') return 'bg-emerald-50 text-emerald-700';
    if (status === 'processing') return 'bg-blue-50 text-blue-700';
    return 'bg-amber-50 text-amber-700';
  };

  return (
    <div
      className="flex flex-col h-full relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="px-5 pb-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">Tài liệu</h3>
          <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">
            {documents.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={openUpload}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-slate-200 hover:border-primary-300 hover:bg-primary-50 transition-all text-xs font-medium text-slate-700"
          >
            <HiOutlineUpload className="w-3.5 h-3.5" />
            <span>Upload</span>
          </button>
          <button
            type="button"
            onClick={() => setShowText(true)}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-slate-200 hover:border-primary-300 hover:bg-primary-50 transition-all text-xs font-medium text-slate-700"
          >
            <HiOutlinePlus className="w-3.5 h-3.5" />
            <span>Văn bản</span>
          </button>
          <button
            type="button"
            onClick={() => setShowUrlScrape(true)}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-slate-200 hover:border-primary-300 hover:bg-primary-50 transition-all text-xs font-medium text-slate-700"
          >
            <HiOutlineGlobeAlt className="w-3.5 h-3.5" />
            <span>URL</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-5">
        {documents.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2">
              <HiOutlineBookOpen className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-700">Chưa có tài liệu</p>
            <p className="text-xs text-slate-400 mt-1">Kéo thả file hoặc chọn nguồn bên dưới</p>
          </div>
        ) : (
          <div className="space-y-1">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="group flex items-center gap-3 px-3 py-2.5 bg-white rounded-lg hover:bg-slate-50 transition-colors"
              >
                <div className="w-8 h-8 rounded-md bg-primary-50 text-primary-600 flex items-center justify-center shrink-0">
                  <HiOutlineDocumentText className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{doc.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[11px] text-slate-400">
                      {doc.chunk_count || 0} chunks
                    </span>
                    {doc.source_type && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                        <span className="w-1 h-1 rounded-full bg-slate-300" />
                        {doc.source_type}
                      </span>
                    )}
                    {doc.status && (
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getStatusBadge(doc.status)}`}>
                        {doc.status}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleViewDocument(doc)}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-slate-300 hover:text-primary-600 hover:bg-primary-50 transition-colors opacity-0 group-hover:opacity-100"
                    title="Xem nội dung"
                  >
                    <HiOutlineEye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(doc)}
                    disabled={deletingId === doc.id}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                    title="Xóa"
                  >
                    {deletingId === doc.id ? (
                      <HiOutlineRefresh className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <HiOutlineTrash className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-slate-100 px-5 py-3 bg-white">
        <div
          onClick={openUpload}
          className="border-2 border-dashed border-slate-200 rounded-xl px-4 py-4 text-center cursor-pointer hover:border-primary-300 hover:bg-primary-50 transition-all"
        >
          <HiOutlineUpload className="w-5 h-5 text-slate-400 mx-auto mb-1.5" />
          <p className="text-xs font-medium text-slate-500">Kéo thả file vào đây hoặc bấm để chọn</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{ALLOWED_FORMATS_LABEL} • Tối đa {MAX_FILE_MB}MB</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_ACCEPT}
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {isDragging && (
        <div
          ref={dropZoneRef}
          className="absolute inset-0 z-40 bg-primary-50 border-2 border-dashed border-primary-400 rounded-xl flex items-center justify-center pointer-events-none"
        >
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-2">
              <HiOutlineUpload className="w-6 h-6 text-primary-600 animate-bounce" />
            </div>
            <p className="text-sm font-semibold text-primary-700">Thả file để upload</p>
            <p className="text-xs text-primary-600 mt-1">{ALLOWED_FORMATS_LABEL}</p>
          </div>
        </div>
      )}

      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-5 py-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Upload tài liệu</h3>
              <button
                type="button"
                onClick={() => setShowUpload(false)}
                className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <HiOutlineX className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleUploadFile} className="px-5 pb-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1.5">Tên tài liệu</label>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="VD: Hướng dẫn sử dụng"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 transition-all"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1.5">File</label>
                {uploadFile ? (
                  <div className="flex items-center gap-3 px-3 py-2.5 border border-slate-200 rounded-lg bg-slate-50">
                    <div className="w-8 h-8 rounded-md bg-primary-100 text-primary-600 flex items-center justify-center shrink-0">
                      <HiOutlineDocumentText className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{uploadFile.name}</p>
                      <p className="text-xs text-slate-400">{formatBytes(uploadFile.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setUploadFile(null); setUploadTitle(''); }}
                      className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50"
                    >
                      <HiOutlineX className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={openUpload}
                    className="border-2 border-dashed border-slate-200 rounded-lg px-4 py-6 text-center cursor-pointer hover:border-primary-300 hover:bg-primary-50 transition-colors"
                  >
                    <HiOutlineUpload className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
                    <p className="text-xs font-medium text-slate-600">Bấm để chọn file hoặc kéo thả vào đây</p>
                    <p className="text-[11px] text-slate-400 mt-1">Tối đa {MAX_FILE_MB}MB</p>
                  </div>
                )}
                <p className="text-[11px] text-slate-400 mt-1">
                  Hỗ trợ: {ALLOWED_FORMATS_LABEL}
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUpload(false)}
                  className="px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Hủy
                </button>
                <button type="submit" disabled={uploading} className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
                  {uploading ? 'Đang upload...' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showText && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-5 py-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Thêm văn bản</h3>
              <button
                type="button"
                onClick={() => setShowText(false)}
                className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <HiOutlineX className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddText} className="px-5 pb-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1.5">Tiêu đề</label>
                <input
                  type="text"
                  value={textTitle}
                  onChange={(e) => setTextTitle(e.target.value)}
                  placeholder="VD: Câu hỏi thường gặp"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 transition-all"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1.5">Nội dung</label>
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  rows={6}
                  placeholder="Nhập nội dung kiến thức..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 transition-all resize-y"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowText(false)}
                  className="px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Hủy
                </button>
                <button type="submit" disabled={addingText} className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
                  {addingText ? 'Đang thêm...' : 'Thêm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showUrlScrape && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-5 py-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Trích xuất từ URL</h3>
              <button
                type="button"
                onClick={() => setShowUrlScrape(false)}
                className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <HiOutlineX className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleScrapeUrl} className="px-5 pb-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1.5">URL</label>
                <input
                  type="url"
                  value={scrapeUrl}
                  onChange={(e) => setScrapeUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 transition-all"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Hệ thống sẽ tự động crawl các trang liên kết nội bộ.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUrlScrape(false)}
                  className="px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Hủy
                </button>
                <button type="submit" disabled={scraping} className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
                  {scraping ? 'Đang trích xuất...' : 'Trích xuất'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100 shrink-0">
              <div className="flex-1 min-w-0 mr-4">
                <h3 className="text-sm font-semibold text-slate-900 truncate">{viewingDoc.title}</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-slate-400">{viewingDoc.chunk_count || 0} chunks</span>
                  {viewingDoc.extracted_chars && (
                    <>
                      <span className="text-slate-300">|</span>
                      <span className="text-[11px] text-slate-400">{(viewingDoc.extracted_chars / 1000).toFixed(1)}k ký tự</span>
                    </>
                  )}
                  {viewingDoc.source_type && (
                    <>
                      <span className="text-slate-300">|</span>
                      <span className="text-[11px] text-slate-400">{viewingDoc.source_type}</span>
                    </>
                  )}
                  <span className="text-slate-300">|</span>
                  <span className="text-[11px] text-slate-400">{formatDate(viewingDoc.created_at)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {viewingDoc.source_type === 'url' && viewingDoc.source && (
                  <a
                    href={viewingDoc.source}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                    title="Mở URL gốc"
                  >
                    <HiOutlineExternalLink className="w-4 h-4" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setViewingDoc(null)}
                  className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <HiOutlineX className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {viewingDoc.loading ? (
                <div className="flex items-center justify-center py-12">
                  <HiOutlineRefresh className="w-5 h-5 animate-spin text-primary-500" />
                  <span className="ml-2 text-sm text-slate-500">Đang tải...</span>
                </div>
              ) : viewingDoc.content_text ? (
                <pre className="whitespace-pre-wrap text-sm text-slate-700 font-mono leading-relaxed bg-slate-50 rounded-lg p-4 border border-slate-100 overflow-auto">
                  {viewingDoc.content_text}
                </pre>
              ) : (
                <div className="text-center py-12 text-slate-400">
                  <HiOutlineDocumentText className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Không có nội dung để hiển thị</p>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-slate-100 shrink-0 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingDoc(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
