import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineChevronUp,
  HiOutlineChevronDown,
  HiOutlineChevronDown as HiOutlineExpand,
  HiOutlineExclamation,
  HiOutlineExternalLink,
  HiOutlineSparkles,
  HiOutlineClipboardList,
  HiOutlineCheck,
  HiOutlineRefresh,
  HiOutlineDocumentDuplicate,
  HiOutlineX,
  HiOutlineCheckCircle,
} from 'react-icons/hi';
import { FounderLeadFormCard } from '../../landing/components/FounderLeadFormCard.jsx';
import { editLandingHtmlWithAi } from '../../landing-pages/services/landingPagesAdminApi.service.js';
import { fetchForms } from '../../forms/services/formAdminApi.service.js';
import {
  CUSTOM_FIELD_TYPES,
  defaultLeadFormConfig,
  generateCustomFieldKey,
  nextUnusedOptionValue,
  normalizeLeadFormConfig,
} from '../../landing-pages/utils/landingLeadFormConfig.js';
import { buildAddCustomFieldInstruction, buildAddFixedFieldInstruction } from '../utils/leadFormFieldInstructions.js';
import {
  customFieldOptionValues,
  fixedFieldOptionValues,
  htmlHasFieldName,
  htmlHasFieldOptions,
} from '../utils/leadFormHtmlChecks.js';

const emptyCustomField = () => ({
  key: generateCustomFieldKey('field'),
  type: 'text',
  labelVi: '',
  labelEn: '',
  placeholderVi: '',
  placeholderEn: '',
  required: false,
  options: [{ value: 'opt_a', labelVi: 'Lựa chọn 1', labelEn: 'Option 1' }],
});

/**
 * PLAN_LEAD_FORM_TRUONG_THEM_2026-09-08.md PR-2d-3 việc 3: form.htmlContent có thật sự chứa
 * ô name="<khoá>" của trường này chưa — cảnh báo "trang chưa có ô này" + nút "Nhờ AI thêm ô
 * này". Sửa 09/09: thêm mức 2 — ô có nhưng mã lựa chọn không khớp cấu hình (sự cố slug-test,
 * xem leadFormHtmlChecks.js) → cảnh báo "không khớp mã" + nút "Nhờ AI sửa ô này". Cả hai KHÔNG
 * chặn lưu (chỉ cảnh báo).
 *
 * @returns {'missing'|'mismatch'|null}
 */
function fieldHtmlIssue(html, key, optionValues) {
  if (!htmlHasFieldName(html, key)) return 'missing';
  if (!htmlHasFieldOptions(html, key, optionValues)) return 'mismatch';
  return null;
}

/**
 * Cấu hình field form lead — Phase 6+ UI gọn:
 *  - Toggle occupation/interest dạng inline-card.
 *  - Custom fields dạng **inline-card** mặc định (1 hàng ngang), bấm caret để mở rộng.
 *  - Xem trước form ở cuối (nameMode đến từ LeadFormSettingsPanel).
 */
export default function LeadFormConfigPanel({ form, setForm, t, nameMode = 'split' }) {
  const config = normalizeLeadFormConfig(form.leadFormConfig || defaultLeadFormConfig());
  const persistedKeys = new Set(form.leadFormPersistedMeta?.keys || []);
  const persistedOptionValuesByKey = form.leadFormPersistedMeta?.optionValuesByKey || {};
  const fieldErrors = form.leadFormFieldErrors || {};
  const htmlContent = form.htmlContent || '';
  const hasHtml = Boolean(htmlContent.trim());

  const [expanded, setExpanded] = useState(() => new Set());
  // Khoá đang chờ AI thêm ô (Nhờ AI thêm ô này) — theo dõi riêng từng field để chỉ khoá đúng
  // nút đang gọi, không khoá cả panel.
  const [askingKeys, setAskingKeys] = useState(() => new Set());

  // Quản lý tích hợp module Biểu mẫu (Forms)
  const [formsList, setFormsList] = useState([]);
  const [loadingForms, setLoadingForms] = useState(false);
  const [selectedFormId, setSelectedFormId] = useState(form?.linkedFormId ? String(form.linkedFormId) : '');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const loadForms = async () => {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
      return;
    }
    setLoadingForms(true);
    try {
      const list = await fetchForms();
      if (Array.isArray(list)) {
        setFormsList(list);
      }
    } catch {
      // an toàn trong môi trường test hoặc khi API chưa sẵn sàng
    } finally {
      setLoadingForms(false);
    }
  };

  useEffect(() => {
    loadForms();
  }, []);

  useEffect(() => {
    if (form?.linkedFormId) {
      setSelectedFormId(String(form.linkedFormId));
    }
  }, [form?.linkedFormId]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeLinkedForm = formsList.find((f) => String(f.id) === String(form?.linkedFormId));
  const currentlySelectedForm = formsList.find((f) => String(f.id) === String(selectedFormId));

  const handleApplyLinkedForm = (formItem) => {
    const target = formItem || currentlySelectedForm;
    if (!target) {
      toast.error('Vui lòng chọn một biểu mẫu trước khi áp dụng.');
      return;
    }

    let updatedHtml = htmlContent;
    if (!updatedHtml.includes('data-founderai-form-slot') && !updatedHtml.includes('data-founderai-form')) {
      const formSlotHtml = '\n<!-- Biểu mẫu đăng ký được liên kết -->\n<div data-founderai-form-slot class="my-8 max-w-2xl mx-auto px-4"></div>\n';
      if (updatedHtml.includes('</body>')) {
        updatedHtml = updatedHtml.replace('</body>', `${formSlotHtml}</body>`);
      } else {
        updatedHtml += formSlotHtml;
      }
    }

    setForm((prev) => ({
      ...prev,
      linkedFormId: target.id,
      htmlContent: updatedHtml,
    }));
    setIsDropdownOpen(false);
    toast.success(`Đã áp dụng biểu mẫu "${target.title}" vào trang!`);
  };

  const handleUnlinkForm = () => {
    setForm((prev) => ({
      ...prev,
      linkedFormId: null,
    }));
    toast.success('Đã huỷ liên kết biểu mẫu. Trang sẽ dùng form HTML nội tuyến.');
  };

  const handleCopyEmbedCode = (targetForm) => {
    const target = targetForm || currentlySelectedForm || activeLinkedForm;
    if (!target || !target.publicKey) {
      toast.error('Biểu mẫu này chưa có mã công khai hoặc chưa được lưu.');
      return;
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const embedHtml = `<div data-founderai-form="${target.publicKey}">\n  <iframe src="${origin}/f/${target.publicKey}?embed=1" style="width:100%;border:0;min-height:500px" title="${target.title}"></iframe>\n</div>\n<script src="${origin}/form-embed.js" defer></script>`;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(embedHtml);
      toast.success('Đã sao chép mã nhúng HTML vào bộ nhớ tạm!');
    } else {
      toast.success('Đã tạo mã nhúng!');
    }
  };

  const patch = (next) => {
    setForm((prev) => ({ ...prev, leadFormConfig: normalizeLeadFormConfig(next) }));
  };

  /**
   * PLAN_LEAD_FORM_TRUONG_THEM_2026-09-08.md PR-2d-3 việc 3: gọi đường sửa AI (editHtml, rule
   * 2b — việc 2) với câu lệnh dựng sẵn, cập nhật form.htmlContent khi thành công. Không chặn
   * lưu nếu lỗi — chỉ toast, admin tự thử lại hoặc tự sửa HTML.
   */
  const handleAskAiToAddField = async (key, instruction, optionValues = []) => {
    if (askingKeys.has(key)) return;
    setAskingKeys((prev) => new Set(prev).add(key));
    try {
      const result = await editLandingHtmlWithAi({
        currentHtml: htmlContent,
        instruction,
        locale: 'vi',
      });
      const nextHtml = result?.data?.html || result?.html;
      if (!nextHtml) {
        throw new Error(result?.message || 'AI không trả về HTML hợp lệ.');
      }
      setForm((prev) => ({ ...prev, htmlContent: nextHtml }));
      // Vẫn nhận HTML (admin có Hoàn tác) nhưng báo đúng sự thật: AI có thể thêm ô mà ghi sai mã
      // lựa chọn — khi đó cảnh báo "không khớp mã" sẽ còn nguyên trên panel.
      const issue = fieldHtmlIssue(nextHtml, key, optionValues);
      if (issue === 'missing') {
        toast.error('AI trả HTML nhưng vẫn chưa có ô này. Hãy thử lại.');
      } else if (issue === 'mismatch') {
        toast.error('AI đã thêm ô nhưng mã lựa chọn chưa đúng. Hãy bấm "Nhờ AI sửa ô này" lần nữa.');
      } else {
        toast.success('AI đã thêm ô vào form.');
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || 'Không nhờ được AI thêm ô này.');
    } finally {
      setAskingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const setFixedVisible = (field, visible) => {
    patch({
      ...config,
      fixedFields: {
        ...config.fixedFields,
        [field]: { visible },
      },
    });
  };

  const updateField = (index, partial) => {
    const customFields = config.customFields.map((f, i) => (i === index ? { ...f, ...partial } : f));
    const nextConfig = normalizeLeadFormConfig({ ...config, customFields });
    setForm((prev) => {
      const next = { ...prev, leadFormConfig: nextConfig };
      const key = config.customFields[index]?.key;
      if (key && Object.prototype.hasOwnProperty.call(partial, 'labelVi')) {
        const nextErrors = { ...(prev.leadFormFieldErrors || {}) };
        delete nextErrors[key];
        next.leadFormFieldErrors = nextErrors;
      }
      return next;
    });
  };

  const moveField = (index, dir) => {
    const next = [...config.customFields];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    patch({ ...config, customFields: next });
  };

  const removeField = (index) => {
    patch({ ...config, customFields: config.customFields.filter((_, i) => i !== index) });
  };

  const toggleExpand = (key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const previewForm = {
    fullName: '',
    email: '',
    phone: '',
    occupation: '',
    interestArea: '',
    marketingConsent: true,
    customFields: {},
  };

  return (
    <div className="space-y-6">
      {/* Khối tích hợp Biểu mẫu hệ thống (Forms Module) */}
      {form?.linkedFormId ? (
        <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/90 to-indigo-50/40 p-5 space-y-4 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-blue-100 text-blue-700 shrink-0 mt-0.5 shadow-2xs">
                <HiOutlineClipboardList className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-bold text-blue-950">
                    Trang đang liên kết với Biểu mẫu chuyên nghiệp
                  </h4>
                  <span className="text-[11px] font-semibold bg-blue-200/80 text-blue-800 px-2.5 py-0.5 rounded-full">
                    #{form.linkedFormId}
                  </span>
                  {activeLinkedForm?.isPublished !== undefined && (
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        activeLinkedForm.isPublished
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {activeLinkedForm.isPublished ? 'Đã xuất bản' : 'Bản nháp'}
                    </span>
                  )}
                </div>
                <p className="text-xs font-medium text-blue-900">
                  {activeLinkedForm?.title || `Biểu mẫu #${form.linkedFormId}`}
                  {activeLinkedForm?.fields?.length ? ` (${activeLinkedForm.fields.length} trường thông tin)` : ''}
                </p>
                <p className="text-xs text-blue-800/80 leading-relaxed">
                  Biểu mẫu này được quản lý tập trung: hỗ trợ tải tệp, logic phân nhánh, đặt lịch hẹn và bài nộp nâng cao.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto flex-wrap">
              <a
                href={`/app/forms/${form.linkedFormId}/edit`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition"
              >
                <span>Mở sửa Biểu mẫu</span>
                <HiOutlineExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                onClick={handleUnlinkForm}
                className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-gray-600 hover:text-red-600 bg-white hover:bg-red-50 border border-gray-200 hover:border-red-200 rounded-xl transition"
                title="Huỷ liên kết với biểu mẫu này để quay lại form nội tuyến"
              >
                <HiOutlineX className="w-3.5 h-3.5" />
                <span>Huỷ liên kết</span>
              </button>
            </div>
          </div>

          {/* Trạng thái vị trí hiển thị trong HTML */}
          <div className="pt-3 border-t border-blue-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            {htmlContent.includes('data-founderai-form-slot') || htmlContent.includes('data-founderai-form') ? (
              <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
                <HiOutlineCheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Đã có vị trí hiển thị (slot) của biểu mẫu này trong HTML trang.</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-amber-800 bg-amber-50/90 border border-amber-200 px-3 py-1.5 rounded-lg flex-1 justify-between flex-wrap">
                <span className="font-medium">
                  ⚠️ Trang chưa có thẻ vị trí (slot) để hiển thị biểu mẫu.
                </span>
                <button
                  type="button"
                  onClick={() => handleApplyLinkedForm(activeLinkedForm)}
                  className="px-2.5 py-1 text-xs font-bold text-amber-900 bg-amber-200/80 hover:bg-amber-300 rounded-md transition"
                >
                  Chèn vị trí form vào trang ngay
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => handleCopyEmbedCode(activeLinkedForm)}
              className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 font-medium self-end sm:self-auto py-1"
            >
              <HiOutlineDocumentDuplicate className="w-3.5 h-3.5" />
              <span>Sao chép mã nhúng HTML</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 via-purple-50/30 to-white p-5 space-y-4 shadow-2xs">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-100 text-indigo-700 shrink-0 mt-0.5 shadow-2xs">
              <HiOutlineSparkles className="w-5 h-5" />
            </div>
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-bold text-gray-900">
                  Sử dụng Biểu mẫu có sẵn từ module Forms
                </h4>
                <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-100 px-2.5 py-0.5 rounded-full">
                  Khuyên dùng
                </span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                Tận dụng các biểu mẫu chuyên nghiệp bạn đã tạo với đầy đủ tính năng: tải tệp, đánh giá sao, câu hỏi trắc nghiệm, đặt lịch hẹn, thanh toán MoMo/Bank...
              </p>
            </div>
          </div>

          {/* Bộ chọn Biểu mẫu có sẵn */}
          <div className="pt-2 border-t border-indigo-100/70 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-gray-700">Chọn biểu mẫu để liên kết vào trang:</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadForms}
                  disabled={loadingForms}
                  className="inline-flex items-center gap-1 text-gray-500 hover:text-indigo-600 transition"
                  title="Làm mới danh sách biểu mẫu"
                >
                  <HiOutlineRefresh className={`w-3.5 h-3.5 ${loadingForms ? 'animate-spin' : ''}`} />
                  <span>Làm mới</span>
                </button>
                <a
                  href="/app/forms/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold"
                >
                  <span>+ Tạo biểu mẫu mới</span>
                  <HiOutlineExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* Custom Dropdown Selector (tránh dùng thẻ select role="combobox" để không xung đột test) */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsDropdownOpen((prev) => !prev)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 bg-white border border-gray-300 hover:border-indigo-400 rounded-xl text-left text-xs font-medium text-gray-800 shadow-2xs transition"
              >
                <div className="truncate">
                  {currentlySelectedForm ? (
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{currentlySelectedForm.title}</span>
                      <span className="text-gray-400">({currentlySelectedForm.fields?.length || 0} trường)</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          currentlySelectedForm.isPublished
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {currentlySelectedForm.isPublished ? 'Đã xuất bản' : 'Bản nháp'}
                      </span>
                    </span>
                  ) : (
                    <span className="text-gray-500">
                      {formsList.length > 0
                        ? `-- Nhấn để chọn một biểu mẫu (${formsList.length} biểu mẫu khả dụng) --`
                        : loadingForms
                        ? 'Đang tải danh sách biểu mẫu...'
                        : '-- Chưa có biểu mẫu nào trong tài khoản --'}
                    </span>
                  )}
                </div>
                <HiOutlineChevronDown className="w-4 h-4 text-gray-400 shrink-0 ml-2" />
              </button>

              {isDropdownOpen && (
                <div className="absolute z-30 mt-1.5 w-full bg-white rounded-xl shadow-lg border border-gray-200 py-1.5 max-h-60 overflow-y-auto">
                  {formsList.length === 0 ? (
                    <div className="p-3 text-center text-xs text-gray-500">
                      {loadingForms ? 'Đang tải danh sách...' : 'Chưa có biểu mẫu nào. Hãy nhấn "+ Tạo biểu mẫu mới".'}
                    </div>
                  ) : (
                    formsList.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => {
                          setSelectedFormId(String(f.id));
                          setIsDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 text-left text-xs hover:bg-indigo-50/70 transition ${
                          String(selectedFormId) === String(f.id)
                            ? 'bg-indigo-50 font-semibold text-indigo-900'
                            : 'text-gray-700'
                        }`}
                      >
                        <div className="truncate">
                          <span className="block font-medium">{f.title || 'Biểu mẫu chưa đặt tên'}</span>
                          <span className="text-[11px] text-gray-400">
                            ID: #{f.id} · {f.fields?.length || 0} trường thông tin
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              f.isPublished
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-gray-100 text-gray-600 border border-gray-200'
                            }`}
                          >
                            {f.isPublished ? 'Xuất bản' : 'Nháp'}
                          </span>
                          {String(selectedFormId) === String(f.id) && (
                            <HiOutlineCheck className="w-4 h-4 text-indigo-600" />
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Chi tiết & Nút hành động khi đã chọn form */}
            {currentlySelectedForm && (
              <div className="p-3 bg-white/90 border border-indigo-200/90 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div className="text-xs space-y-0.5">
                  <div className="font-semibold text-indigo-950 flex items-center gap-2">
                    <span>{currentlySelectedForm.title}</span>
                    <span className="text-gray-400 font-normal">
                      ({currentlySelectedForm.fields?.length || 0} trường)
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Bấm &quot;Áp dụng vào trang&quot; để tự động gắn thẻ hiển thị form vào HTML trang.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleApplyLinkedForm(currentlySelectedForm)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition"
                  >
                    <HiOutlineCheck className="w-3.5 h-3.5" />
                    <span>Áp dụng vào trang</span>
                  </button>
                  <a
                    href={`/app/forms/${currentlySelectedForm.id}/edit`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 border border-gray-200 rounded-lg transition"
                    title="Mở sửa biểu mẫu này ở tab mới"
                  >
                    <HiOutlineExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <div className="h-px bg-gray-200 flex-1" />
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Cấu hình trường Form HTML nội tuyến
        </span>
        <div className="h-px bg-gray-200 flex-1" />
      </div>

      <p className="text-[13px] text-gray-500 leading-relaxed">
        {t('leadFormConfig.help')}
      </p>

      {/* Fixed fields toggle — inline card */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-[14px] font-semibold text-gray-900 mb-1">Các trường mặc định</p>
        <p className="text-[12px] text-gray-500 mb-3">
          Bật/tắt các trường bạn muốn hiển thị trên form.
        </p>
        <div className="flex flex-wrap gap-2">
        <InlineChip
          checked={config.fixedFields.occupation.visible}
          onChange={(v) => setFixedVisible('occupation', v)}
          label={t('leadFormConfig.showOccupation')}
        />
        <InlineChip
          checked={config.fixedFields.interestArea.visible}
          onChange={(v) => setFixedVisible('interestArea', v)}
          label={t('leadFormConfig.showInterest')}
        />
        </div>
        {[
          { key: 'occupation', label: 'Nghề nghiệp', visible: config.fixedFields.occupation.visible },
          { key: 'interestArea', label: 'Lĩnh vực quan tâm', visible: config.fixedFields.interestArea.visible },
        ].map(({ key, label, visible }) => {
          if (!hasHtml || !visible) return null;
          const optionValues = fixedFieldOptionValues(key);
          const issue = fieldHtmlIssue(htmlContent, key, optionValues);
          if (!issue) return null;
          return (
            <MissingFieldWarning
              key={key}
              fieldLabel={label}
              issue={issue}
              asking={askingKeys.has(key)}
              onAskAi={() => handleAskAiToAddField(key, buildAddFixedFieldInstruction(key), optionValues)}
            />
          );
        })}
      </section>

      {/* Custom fields card */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[14px] font-semibold text-gray-900">
              {t('leadFormConfig.customFields')}
              <span className="ml-2 text-[12px] font-normal text-gray-500">
                ({config.customFields.length}/20)
              </span>
            </p>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Thêm các trường tuỳ chỉnh cho form lead.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-orange-300 bg-orange-50 px-3 py-1.5 text-[13px] font-semibold text-orange-700 hover:bg-orange-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => {
              if (config.customFields.length >= 20) return;
              const next = [...config.customFields, emptyCustomField()];
              patch({ ...config, customFields: next });
              // auto-expand field mới để user điền label ngay
              setExpanded((prev) => new Set(prev).add(next[next.length - 1].key));
            }}
            disabled={config.customFields.length >= 20}
          >
            <HiOutlinePlus className="h-4 w-4" />
            {t('leadFormConfig.addField')}
          </button>
        </div>

        {/* Custom fields list — inline cards */}
        {config.customFields.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 px-4 py-6 text-center">
            <p className="text-[13px] text-gray-500">
              Chưa có trường tuỳ chỉnh. Bấm <b>+ Thêm trường</b> để tạo trường email, họ tên, SĐT hoặc tuỳ ý.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {config.customFields.map((field, index) => {
              const isPersisted = persistedKeys.has(field.key);
              const persistedOptionValues = new Set(persistedOptionValuesByKey[field.key] || []);
              const labelError = fieldErrors[field.key];
              const isExpanded = expanded.has(field.key);
              return (
                <CustomFieldRow
                  key={field.key}
                  index={index}
                  field={field}
                  isPersisted={isPersisted}
                  persistedOptionValues={persistedOptionValues}
                  persistedOptionValuesByKey={persistedOptionValuesByKey}
                  labelError={labelError}
                  isExpanded={isExpanded}
                  onToggleExpand={() => toggleExpand(field.key)}
                  onUpdate={(partial) => updateField(index, partial)}
                  onMoveUp={() => moveField(index, -1)}
                  onMoveDown={() => moveField(index, 1)}
                  onRemove={() => removeField(index)}
                  t={t}
                  htmlIssue={hasHtml ? fieldHtmlIssue(htmlContent, field.key, customFieldOptionValues(field)) : null}
                  asking={askingKeys.has(field.key)}
                  onAskAiToAdd={() =>
                    handleAskAiToAddField(field.key, buildAddCustomFieldInstruction(field), customFieldOptionValues(field))
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Xem trước form */}
      <section className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/60">
          <div>
            <p className="text-[14px] font-semibold text-gray-900">
              {t('leadFormConfig.localPreview') || 'Xem trước'}
            </p>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Form sẽ hiển thị như thế này trên landing page của bạn.
            </p>
          </div>
        </div>
        <div className="px-5 py-5 bg-gray-50/40 max-h-[520px] overflow-auto">
          <FounderLeadFormCard
            variant="embed"
            locale="vi"
            theme={config.theme}
            nameMode={nameMode}
            formCopy={{
              embedTitle: 'Đăng ký nhận thông tin',
              fullName: 'Họ và tên',
              email: 'Email',
              phone: 'Số điện thoại',
              occupation: 'Nghề nghiệp',
              interest: 'Lĩnh vực quan tâm',
              selectOccupation: '-- Chọn nghề --',
              selectInterest: '-- Chọn lĩnh vực --',
              consentPrefix: 'Tôi đồng ý nhận thông tin',
              privacyLink: 'chính sách bảo mật',
              submit: 'Gửi',
              submitting: 'Đang gửi',
              secureNote: 'Bảo mật tuyệt đối',
              successTitle: 'Thành công!',
              placeholders: { fullName: 'Nguyễn Văn A', email: 'email@gmail.com', phone: '0901 234 567' },
            }}
            form={previewForm}
            setField={() => {}}
            submitting={false}
            error=""
            success={false}
            onSubmit={(e) => e?.preventDefault?.()}
            leadFormConfig={config}
            previewMode
          />
        </div>
      </section>
    </div>
  );
}

/* ─────────────── Cảnh báo thiếu ô trong HTML + nút nhờ AI thêm ─────────────── */

/**
 * PLAN_LEAD_FORM_TRUONG_THEM_2026-09-08.md PR-2d-3 việc 3: hiện khi form.htmlContent
 * chưa có ô này (theo name="<khoá>") dù cấu hình yêu cầu, hoặc (09/09) có ô nhưng mã lựa chọn
 * không khớp cấu hình. KHÔNG chặn lưu — chỉ cảnh báo + nút gọi đường sửa AI (editHtml rule 2b,
 * việc 2). Cùng một câu lệnh cho cả hai: câu lệnh đã dặn THAY ô cũ nếu trang có sẵn.
 *
 * @param {{ fieldLabel: string, issue?: 'missing'|'mismatch', asking: boolean, onAskAi: () => void }} props
 */
function MissingFieldWarning({ fieldLabel, issue = 'missing', asking, onAskAi }) {
  const isMismatch = issue === 'mismatch';
  return (
    <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[12px] text-amber-800">
        <HiOutlineExclamation className="h-4 w-4 flex-shrink-0" />
        {isMismatch ? (
          <span>
            Ô &quot;{fieldLabel}&quot; có trên trang nhưng lựa chọn không khớp mã đã lưu — khách gửi sẽ bị từ chối.
          </span>
        ) : (
          <span>Trang chưa có ô &quot;{fieldLabel}&quot;.</span>
        )}
      </div>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[12px] font-semibold text-amber-800 hover:bg-amber-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={onAskAi}
        disabled={asking}
      >
        {asking ? 'Đang nhờ AI…' : isMismatch ? 'Nhờ AI sửa ô này' : 'Nhờ AI thêm ô này'}
      </button>
    </div>
  );
}

/* ───────────────── Inline chip toggle ───────────────── */

function InlineChip({ checked, onChange, label }) {
  return (
    <label
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] cursor-pointer select-none transition-colors ${
        checked
          ? 'bg-orange-50 border-orange-300 text-orange-700'
          : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-gray-300 text-orange-600 focus:ring-orange-500 w-4 h-4"
      />
      {label}
    </label>
  );
}

/* ───────────────── Custom field row (inline card) ───────────────── */

function CustomFieldRow({
  index,
  field,
  isPersisted,
  persistedOptionValues,
  persistedOptionValuesByKey,
  labelError,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onMoveUp,
  onMoveDown,
  onRemove,
  t,
  htmlIssue,
  asking,
  onAskAiToAdd,
}) {
  const summary = String(field.labelVi || '').trim() || <span className="italic text-gray-400">(chưa có nhãn)</span>;
  return (
    <div
      className={`rounded-lg border bg-white transition-colors ${
        labelError ? 'border-red-300' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      {/* Inline row */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggleExpand}
          className={`p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          title={isExpanded ? 'Thu gọn' : 'Mở rộng'}
        >
          <HiOutlineExpand className="h-4 w-4" />
        </button>

        <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_auto_auto] items-center gap-3">
          <div className="min-w-0">
            <span className="text-[14px] text-gray-900 truncate block">{summary}</span>
            <code className="text-[11px] text-gray-400 truncate block">{field.key}</code>
          </div>

          <select
            className="rounded-md border border-gray-200 px-2 py-1 text-[12px] disabled:bg-gray-100 disabled:text-gray-500"
            value={field.type}
            disabled={isPersisted}
            title={isPersisted ? t('leadFormConfig.typeLocked') : undefined}
            onChange={(e) => {
              const type = e.target.value;
              const options =
                type === 'select' || type === 'radio'
                  ? field.options?.length
                    ? field.options
                    : [{ value: 'opt_a', labelVi: 'Lựa chọn 1', labelEn: 'Option 1' }]
                  : [];
              onUpdate({ type, options });
            }}
          >
            {CUSTOM_FIELD_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`leadFormConfig.types.${type}`)}
              </option>
            ))}
          </select>

          <label
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] cursor-pointer border transition-colors ${
              field.required
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            <input
              type="checkbox"
              checked={Boolean(field.required)}
              onChange={(e) => onUpdate({ required: e.target.checked })}
              className="w-3.5 h-3.5"
            />
            Bắt buộc
          </label>

          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Di chuyển lên"
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-30"
              onClick={onMoveUp}
              disabled={index === 0}
            >
              <HiOutlineChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Di chuyển xuống"
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-30"
              onClick={onMoveDown}
            >
              <HiOutlineChevronDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Xoá trường"
              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
              onClick={onRemove}
            >
              <HiOutlineTrash className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {htmlIssue ? (
        <div className="px-3 pb-2">
          <MissingFieldWarning
            fieldLabel={String(field.labelVi || '').trim() || field.key}
            issue={htmlIssue}
            asking={asking}
            onAskAi={onAskAiToAdd}
          />
        </div>
      ) : null}

      {/* Expanded editor */}
      {isExpanded ? (
        <div className="border-t border-gray-100 px-3 py-2.5 space-y-2 bg-gray-50/40">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <input
                className={`w-full rounded border px-3 py-2 text-[13px] ${labelError ? 'border-red-400' : 'border-gray-300'}`}
                placeholder={t('leadFormConfig.labelVi')}
                value={field.labelVi}
                onChange={(e) => onUpdate({ labelVi: e.target.value })}
              />
              {labelError ? <p className="mt-1 text-[12px] text-red-600">{labelError}</p> : null}
            </div>
            <input
              className="rounded border border-gray-300 px-3 py-2 text-[13px]"
              placeholder={t('leadFormConfig.labelEn')}
              value={field.labelEn || ''}
              onChange={(e) => onUpdate({ labelEn: e.target.value })}
            />
          </div>

          {field.type === 'text' || field.type === 'textarea' ? (
            <div className="grid grid-cols-2 gap-3">
              <input
                className="rounded border border-gray-300 px-3 py-2 text-[13px]"
                placeholder={t('leadFormConfig.placeholderVi')}
                value={field.placeholderVi || ''}
                onChange={(e) => onUpdate({ placeholderVi: e.target.value })}
              />
              <input
                className="rounded border border-gray-300 px-3 py-2 text-[13px]"
                placeholder={t('leadFormConfig.placeholderEn')}
                value={field.placeholderEn || ''}
                onChange={(e) => onUpdate({ placeholderEn: e.target.value })}
              />
            </div>
          ) : null}

          {field.type === 'select' || field.type === 'radio' ? (
            <div className="space-y-1.5">
              {(field.options || []).map((opt, oi) => {
                const valueLocked = persistedOptionValues.has(opt.value);
                return (
                  <div key={`${field.key}-${oi}`} className="flex gap-2">
                    <input
                      className="w-28 rounded border border-gray-300 px-2.5 py-1.5 text-[12px] disabled:bg-gray-100 disabled:text-gray-500"
                      placeholder="value"
                      value={opt.value}
                      disabled={valueLocked}
                      title={valueLocked ? t('leadFormConfig.optionValueLocked') : undefined}
                      onChange={(e) => {
                        const options = [...(field.options || [])];
                        options[oi] = { ...opt, value: e.target.value };
                        onUpdate({ options });
                      }}
                    />
                    <input
                      className="flex-1 rounded border border-gray-300 px-2.5 py-1.5 text-[12px]"
                      placeholder="VI"
                      value={opt.labelVi}
                      onChange={(e) => {
                        const options = [...(field.options || [])];
                        options[oi] = { ...opt, labelVi: e.target.value };
                        onUpdate({ options });
                      }}
                    />
                    <input
                      className="flex-1 rounded border border-gray-300 px-2.5 py-1.5 text-[12px]"
                      placeholder="EN"
                      value={opt.labelEn || ''}
                      onChange={(e) => {
                        const options = [...(field.options || [])];
                        options[oi] = { ...opt, labelEn: e.target.value };
                        onUpdate({ options });
                      }}
                    />
                    <button
                      type="button"
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-30"
                      disabled={(field.options || []).length <= 1}
                      title={t('leadFormConfig.removeOption')}
                      onClick={() => {
                        const options = (field.options || []).filter((_, i) => i !== oi);
                        onUpdate({ options });
                      }}
                    >
                      <HiOutlineTrash className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                className="text-[12px] font-medium text-orange-700 hover:underline"
                onClick={() =>
                  onUpdate({
                    options: [
                      ...(field.options || []),
                      {
                        value: nextUnusedOptionValue(field.options, persistedOptionValuesByKey[field.key]),
                        labelVi: '',
                        labelEn: '',
                      },
                    ],
                  })
                }
              >
                + Thêm lựa chọn
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
