import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { HiOutlineX, HiOutlineTemplate } from "react-icons/hi";
import toast from "react-hot-toast";
import { createLandingTemplate } from "../services/landingPagesAdminApi.service.js";

export default function SaveTemplateModal({
  isOpen,
  onClose,
  htmlContent,
  landingPageTitle = "",
  onSuccess,
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Custom");
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(
        landingPageTitle
          ? `${landingPageTitle} (Mẫu)`
          : "Landing Page Template",
      );
      setDescription("");
      setCategory("Custom");
      setIsPublic(false);
    }
  }, [isOpen, landingPageTitle]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Vui lòng nhập tên template");
      return;
    }
    if (!htmlContent || !htmlContent.trim()) {
      toast.error("Không có nội dung HTML để lưu template");
      return;
    }

    setSaving(true);
    try {
      const created = await createLandingTemplate({
        name: trimmedName,
        description: description.trim(),
        category: category.trim() || "Custom",
        htmlStructure: htmlContent,
        htmlContent,
        isPublic,
      });

      if (onSuccess) {
        onSuccess(created);
      } else {
        toast.success("Đã lưu template thành công");
      }
      onClose();
    } catch (err) {
      toast.error(err?.message || "Không thể lưu template");
    } finally {
      setSaving(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-md bg-white dark:bg-dk-surface rounded-2xl shadow-2xl border border-gray-100 dark:border-dk-border overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-dk-border bg-gray-50/50 dark:bg-dk-raised/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-lg">
              <HiOutlineTemplate className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-dk-text">
                Lưu thành Template
              </h3>
              <p className="text-xs text-gray-500 dark:text-dk-text2">
                Lưu trang hiện tại vào bộ sưu tập mẫu để tái sử dụng
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-1.5 text-gray-400 dark:text-dk-muted hover:text-gray-600 dark:hover:text-dk-text2 hover:bg-gray-100 dark:hover:bg-dk-strong rounded-lg transition-colors"
          >
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-dk-text mb-1.5">
              Tên template <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Mẫu Landing Bán Hàng 01"
              required
              disabled={saving}
              className="w-full px-3.5 py-2 text-sm border border-gray-300 dark:border-dk-border-strong rounded-lg dark:bg-dk-inset dark:text-dk-text dark:placeholder-dk-muted focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all disabled:bg-gray-50 dark:disabled:bg-dk-raised"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-dk-text mb-1.5">
              Danh mục
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="VD: Bán hàng, Khóa học, Sự kiện..."
              disabled={saving}
              className="w-full px-3.5 py-2 text-sm border border-gray-300 dark:border-dk-border-strong rounded-lg dark:bg-dk-inset dark:text-dk-text dark:placeholder-dk-muted focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all disabled:bg-gray-50 dark:disabled:bg-dk-raised"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-dk-text mb-1.5">
              Mô tả ngắn
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mô tả mục đích hoặc phong cách của template này..."
              disabled={saving}
              className="w-full px-3.5 py-2 text-sm border border-gray-300 dark:border-dk-border-strong rounded-lg dark:bg-dk-inset dark:text-dk-text dark:placeholder-dk-muted focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none disabled:bg-gray-50 dark:disabled:bg-dk-raised"
            />
          </div>

          <div className="pt-1">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                disabled={saving}
                className="w-4 h-4 text-indigo-600 dark:text-indigo-400 rounded border-gray-300 dark:border-dk-border-strong focus:ring-indigo-500"
              />
              <span className="text-xs text-gray-600 dark:text-dk-text2">
                Chia sẻ công khai vào thư viện chung (cho tất cả thành viên)
              </span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100 dark:border-dk-border">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-medium text-gray-700 dark:text-dk-text bg-white dark:bg-dk-surface border border-gray-300 dark:border-dk-border-strong rounded-lg hover:bg-gray-50 dark:hover:bg-dk-raised transition-colors disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
            >
              {saving ? (
                <>
                  {/* giữ sáng: vòng xoay trắng trên nút indigo đặc (không dark:) */}
                  <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                "Lưu template"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modalContent, document.body)
    : modalContent;
}
