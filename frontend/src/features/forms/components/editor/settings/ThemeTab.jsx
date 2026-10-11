import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '../../../../../i18n';
import { uploadFormTempFile, uploadFormAsset } from '../../../services/formAdminApi.service';
import useStorageQuota from '../../../../storage/useStorageQuota';
import { validateFilesBeforeUpload, getUploadValidationErrorMessage } from '../../../../storage/validateUpload';
import { notifyStorageQuotaRefresh } from '../../../../storage/storageEvents';
import {
  ALLOWED_FORM_FONTS,
  ALLOWED_FORM_LAYOUTS,
  ALLOWED_FORM_BANNER_HEIGHTS,
  FORM_THEME_PRESETS,
} from '../../../constants/formTheme';
import { HEX_COLOR_RE } from '../formEditorConstants';

/**
 * Tab "Giao diện" của modal Cài đặt: mẫu dựng sẵn, màu, font, bố cục, chiều cao banner, ảnh banner/logo. Chuyển NGUYÊN VĂN
 * khối Giao diện + các handler của trình soạn cũ (state `theme` vẫn nằm ở FormEditorPage). Khung xem trước giờ là cột bên phải
 * luôn hiện của trang, nên tab này không còn xem trước riêng.
 */
export default function ThemeTab({ theme, setTheme }) {
  const { t } = useI18n();
  const { usage: storageQuota } = useStorageQuota();
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const bannerInputRef = useRef(null);
  const logoInputRef = useRef(null);

  // Chọn mẫu dựng sẵn: CHỈ ghi đè màu/font/layout — cố ý KHÔNG đụng bannerKey/logoKey/bannerUrl/
  // logoUrl (mục 6 "chọn preset ... giữ nguyên ảnh"; nghiệm thu "chọn preset khi có logo -> giữ
  // logoKey"). FORM_THEME_PRESETS không chứa trường ảnh nên không có gì để vô tình ghi đè.
  const handleSelectThemePreset = (presetId) => {
    const preset = FORM_THEME_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setTheme((prev) => ({
      ...prev,
      preset: preset.id,
      primaryColor: preset.primaryColor,
      backgroundColor: preset.backgroundColor,
      fontFamily: preset.fontFamily,
      layout: preset.layout,
    }));
  };

  const handleThemeColorChange = (field, value) => {
    setTheme((prev) => ({ ...prev, [field]: value }));
  };

  const handleThemeFontChange = (value) => {
    setTheme((prev) => ({ ...prev, fontFamily: value }));
  };

  const handleThemeLayoutChange = (value) => {
    setTheme((prev) => ({ ...prev, layout: value }));
  };

  const handleThemeBannerHeightChange = (value) => {
    setTheme((prev) => ({ ...prev, bannerHeight: value }));
  };

  const handleRemoveThemeImage = (kind) => {
    // kind: 'banner' | 'logo' — xoá khỏi state, KHÔNG gửi khoá này khi lưu -> backend tự gỡ +
    // giải phóng tệp (hợp đồng "gửi thiếu bannerKey = gỡ banner VÀ xoá file ảnh").
    if (kind === 'banner') {
      setTheme((prev) => ({ ...prev, bannerKey: '', bannerUrl: '' }));
    } else {
      setTheme((prev) => ({ ...prev, logoKey: '', logoUrl: '' }));
    }
  };

  const handleUploadThemeImage = async (kind, file) => {
    if (!file) return;
    const allowedExts = ['.png', '.jpg', '.jpeg', '.webp'];
    const name = (file.name || '').toLowerCase();
    if (!allowedExts.some((ext) => name.endsWith(ext))) {
      toast.error(t('forms.editorPage.theme.onlyImages'));
      return;
    }

    const validation = validateFilesBeforeUpload([file], storageQuota);
    if (!validation.ok) {
      toast.error(getUploadValidationErrorMessage(validation, t));
      return;
    }

    const setUploading = kind === 'banner' ? setIsUploadingBanner : setIsUploadingLogo;
    setUploading(true);
    try {
      const temp = await uploadFormTempFile(file);
      const asset = await uploadFormAsset({
        tempId: temp.tempId,
        originalName: temp.originalName,
        contentType: temp.contentType,
        size: temp.size,
      });
      if (kind === 'banner') {
        setTheme((prev) => ({ ...prev, bannerKey: asset.storageKey, bannerUrl: asset.url }));
      } else {
        setTheme((prev) => ({ ...prev, logoKey: asset.storageKey, logoUrl: asset.url }));
      }
      notifyStorageQuotaRefresh();
    } catch (err) {
      // Bẫy 413/STORAGE_QUOTA_EXCEEDED — báo hết dung lượng, KHÔNG đổi ảnh đang hiển thị
      // (nghiệm thu: "413 -> báo hết dung lượng không đổi ảnh").
      if (err.response?.status === 413 || err.response?.data?.code === 'STORAGE_QUOTA_EXCEEDED') {
        toast.error(t('storageQuota.quotaExceededServer'));
      } else {
        toast.error(err.response?.data?.message || t('forms.editorPage.theme.uploadError'));
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-500 dark:text-dk-text2">
        {t('forms.editorPage.theme.subtitle')}
      </p>

      {/* Mẫu dựng sẵn */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-2">
          {t('forms.editorPage.theme.presetLabel')}
        </label>
        <div className="flex flex-wrap gap-2">
          {FORM_THEME_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleSelectThemePreset(preset.id)}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
                theme.preset === preset.id
                  ? 'border-primary-500 ring-2 ring-primary-100 dark:ring-primary-950/40 text-gray-900 dark:text-dk-text bg-orange-50/50 dark:bg-orange-950/30'
                  : 'border-gray-300 dark:border-dk-border text-gray-700 dark:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-raised'
              }`}
            >
              <span
                className="w-4 h-4 rounded-full border border-black/10 shrink-0"
                style={{ backgroundColor: preset.primaryColor }}
              />
              {t(`forms.editorPage.theme.presets.${preset.id}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
            {t('forms.editorPage.theme.primaryColorLabel')}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={HEX_COLOR_RE.test(theme.primaryColor) ? theme.primaryColor : '#df5c0e'}
              onChange={(e) => handleThemeColorChange('primaryColor', e.target.value)}
              className="h-9 w-11 rounded-lg border border-gray-300 dark:border-dk-border cursor-pointer shrink-0"
              aria-label={t('forms.editorPage.theme.primaryColorLabel')}
            />
            <input
              type="text"
              value={theme.primaryColor}
              onChange={(e) => handleThemeColorChange('primaryColor', e.target.value)}
              placeholder="#DF5C0E"
              maxLength={7}
              className="w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border border-gray-300 dark:border-dk-border text-sm font-mono text-slate-900 dark:text-dk-text placeholder:text-slate-400 dark:placeholder:text-dk-muted focus:outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
            {t('forms.editorPage.theme.backgroundColorLabel')}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={HEX_COLOR_RE.test(theme.backgroundColor) ? theme.backgroundColor : '#f9fafb'}
              onChange={(e) => handleThemeColorChange('backgroundColor', e.target.value)}
              className="h-9 w-11 rounded-lg border border-gray-300 dark:border-dk-border cursor-pointer shrink-0"
              aria-label={t('forms.editorPage.theme.backgroundColorLabel')}
            />
            <input
              type="text"
              value={theme.backgroundColor}
              onChange={(e) => handleThemeColorChange('backgroundColor', e.target.value)}
              placeholder="#F9FAFB"
              maxLength={7}
              className="w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border border-gray-300 dark:border-dk-border text-sm font-mono text-slate-900 dark:text-dk-text placeholder:text-slate-400 dark:placeholder:text-dk-muted focus:outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
            {t('forms.editorPage.theme.fontLabel')}
          </label>
          <select
            value={theme.fontFamily}
            onChange={(e) => handleThemeFontChange(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border border-gray-300 dark:border-dk-border text-sm text-slate-900 dark:text-dk-text focus:outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40"
          >
            <option value="">{t('forms.editorPage.theme.fontDefault')}</option>
            {ALLOWED_FORM_FONTS.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
            {t('forms.editorPage.theme.layoutLabel')}
          </label>
          <select
            value={theme.layout}
            onChange={(e) => handleThemeLayoutChange(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border border-gray-300 dark:border-dk-border text-sm text-slate-900 dark:text-dk-text focus:outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40"
          >
            <option value="">{t('forms.editorPage.theme.layoutDefault')}</option>
            {ALLOWED_FORM_LAYOUTS.map((l) => (
              <option key={l} value={l}>
                {t(`forms.editorPage.theme.layout.${l}`)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
            {t('forms.editorPage.theme.bannerHeightLabel')}
          </label>
          <select
            value={theme.bannerHeight}
            onChange={(e) => handleThemeBannerHeightChange(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border border-gray-300 dark:border-dk-border text-sm text-slate-900 dark:text-dk-text focus:outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40"
          >
            <option value="">{t('forms.editorPage.theme.bannerHeightDefault')}</option>
            {ALLOWED_FORM_BANNER_HEIGHTS.map((h) => (
              <option key={h} value={h}>
                {t(`forms.editorPage.theme.bannerHeight.${h}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Banner + Logo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
            {t('forms.editorPage.theme.bannerLabel')}
          </label>
          {theme.bannerUrl ? (
            <img
              src={theme.bannerUrl}
              alt=""
              className="w-full h-24 object-cover rounded-xl border border-gray-200 dark:border-dk-border mb-2"
            />
          ) : (
            <div className="w-full h-24 rounded-xl border border-dashed border-gray-300 dark:border-dk-border bg-gray-50 dark:bg-dk-raised/40 mb-2" />
          )}
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              handleUploadThemeImage('banner', file);
            }}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isUploadingBanner}
              onClick={() => bannerInputRef.current?.click()}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-dk-border text-xs font-medium text-gray-700 dark:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-raised disabled:opacity-50"
            >
              {isUploadingBanner ? t('forms.editorPage.theme.uploading') : t('forms.editorPage.theme.uploadButton')}
            </button>
            {theme.bannerUrl && (
              <button
                type="button"
                onClick={() => handleRemoveThemeImage('banner')}
                className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                {t('forms.editorPage.theme.removeImage')}
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
            {t('forms.editorPage.theme.logoLabel')}
          </label>
          {theme.logoUrl ? (
            <img
              src={theme.logoUrl}
              alt=""
              className="h-24 max-w-full object-contain rounded-xl border border-gray-200 dark:border-dk-border mb-2 bg-white dark:bg-dk-bg"
            />
          ) : (
            <div className="w-full h-24 rounded-xl border border-dashed border-gray-300 dark:border-dk-border bg-gray-50 dark:bg-dk-raised/40 mb-2" />
          )}
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              handleUploadThemeImage('logo', file);
            }}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isUploadingLogo}
              onClick={() => logoInputRef.current?.click()}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-dk-border text-xs font-medium text-gray-700 dark:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-raised disabled:opacity-50"
            >
              {isUploadingLogo ? t('forms.editorPage.theme.uploading') : t('forms.editorPage.theme.uploadButton')}
            </button>
            {theme.logoUrl && (
              <button
                type="button"
                onClick={() => handleRemoveThemeImage('logo')}
                className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                {t('forms.editorPage.theme.removeImage')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
