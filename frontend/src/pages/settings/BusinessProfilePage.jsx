import { useState, useEffect, useRef } from 'react';
import {
  HiOutlineSparkles, HiOutlineSave, HiOutlineRefresh,
  HiOutlinePlus, HiOutlineTrash, HiOutlineChevronDown, HiOutlineChevronUp,
  HiOutlineOfficeBuilding, HiOutlineCube, HiOutlineUserGroup, HiOutlineColorSwatch,
  HiOutlineDocumentText, HiOutlinePhotograph, HiOutlineUpload,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import businessProfileApiService from '../../features/settings/services/businessProfileApi.service';

  const TONE_OPTIONS = (t) => [
  { value: 'professional', label: t('businessProfile.professional') },
  { value: 'friendly',     label: t('businessProfile.friendly') },
  { value: 'formal',       label: t('businessProfile.formal') },
  { value: 'casual',       label: t('businessProfile.casual') },
  { value: 'inspiring',    label: t('businessProfile.inspiring') },
];

const EMPTY_PRODUCT = () => ({ name: '', price: '', description: '', usp: '' });
const EMPTY_SEGMENT = () => ({ name: '', description: '', painPoint: '' });

const EMPTY_FORM = {
  company_name:    '',
  industry:        '',
  products:        [],
  target_audience: [],
  tone:            'professional',
  brand_color:     '#FF6B35',
  logo_url:        '',
  extra_context:   '',
};

function parseArrayField(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try { const p = JSON.parse(value); return Array.isArray(p) ? p : []; } catch { return []; }
}

// ── SectionCard ───────────────────────────────────────────────────────────────
const SectionCard = ({ icon: Icon, title, subtitle, children, accent = 'orange' }) => {
  const colors = {
    orange: 'bg-orange-50 text-orange-500',
    blue:   'bg-blue-50 text-blue-500',
    purple: 'bg-purple-50 text-purple-500',
    slate:  'bg-slate-100 text-slate-500',
  };
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${colors[accent]}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-700">{title}</p>
          {subtitle && <p className="text-xs text-slate-400 truncate">{subtitle}</p>}
        </div>
      </div>
      <div className="p-5">
        {children}
      </div>
    </div>
  );
};

// ── ProductList ───────────────────────────────────────────────────────────────
const ProductList = ({ products, onChange }) => {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState({});

  const add = () => {
    const next = [...products, EMPTY_PRODUCT()];
    onChange(next);
    setExpanded(prev => ({ ...prev, [next.length - 1]: true }));
  };
  const remove = (i) => onChange(products.filter((_, idx) => idx !== i));
  const update = (i, field, val) => onChange(products.map((p, idx) => idx === i ? { ...p, [field]: val } : p));
  const toggle = (i) => setExpanded(prev => ({ ...prev, [i]: !prev[i] }));

  return (
    <div className="space-y-2">
      {products.map((p, i) => (
        <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 cursor-pointer select-none" onClick={() => toggle(i)}>
            <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-600 text-[10px] font-bold flex items-center justify-center shrink-0">
              {i + 1}
            </span>
            <span className="flex-1 text-sm font-medium text-slate-700 truncate">
              {p.name || `${t('businessProfile.productName')} ${i + 1}`}
              {p.price && <span className="ml-2 text-xs text-slate-400 font-normal">{p.price}</span>}
            </span>
            <button type="button" onClick={(e) => { e.stopPropagation(); remove(i); }}
              className="p-1 text-slate-400 hover:text-red-500 transition-colors">
              <HiOutlineTrash className="w-3.5 h-3.5" />
            </button>
            {expanded[i] ? <HiOutlineChevronUp className="w-4 h-4 text-slate-400" /> : <HiOutlineChevronDown className="w-4 h-4 text-slate-400" />}
          </div>
          {expanded[i] && (
            <div className="p-3 grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{t('businessProfile.productName')} *</label>
                <input type="text" value={p.name} onChange={e => update(i, 'name', e.target.value)}
                  placeholder={t('businessProfile.productNamePlaceholder')}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-orange-400 transition-all" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{t('businessProfile.price')}</label>
                <input type="text" value={p.price} onChange={e => update(i, 'price', e.target.value)}
                  placeholder={t('businessProfile.pricePlaceholder')}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-orange-400 transition-all" />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{t('businessProfile.shortDescription')}</label>
                <input type="text" value={p.description} onChange={e => update(i, 'description', e.target.value)}
                  placeholder={t('businessProfile.shortDescriptionPlaceholder')}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-orange-400 transition-all" />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{t('businessProfile.usp')}</label>
                <input type="text" value={p.usp} onChange={e => update(i, 'usp', e.target.value)}
                  placeholder={t('businessProfile.uspPlaceholder')}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-orange-400 transition-all" />
              </div>
            </div>
          )}
        </div>
      ))}
      <button type="button" onClick={add}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 border border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-orange-400 hover:text-orange-500 transition-all">
        <HiOutlinePlus className="w-4 h-4" />
        {t('businessProfile.addProduct')}
      </button>
    </div>
  );
};

// ── SegmentList ───────────────────────────────────────────────────────────────
const SegmentList = ({ segments, onChange }) => {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState({});

  const add = () => {
    const next = [...segments, EMPTY_SEGMENT()];
    onChange(next);
    setExpanded(prev => ({ ...prev, [next.length - 1]: true }));
  };
  const remove = (i) => onChange(segments.filter((_, idx) => idx !== i));
  const update = (i, field, val) => onChange(segments.map((s, idx) => idx === i ? { ...s, [field]: val } : s));
  const toggle = (i) => setExpanded(prev => ({ ...prev, [i]: !prev[i] }));

  return (
    <div className="space-y-2">
      {segments.map((s, i) => (
        <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 cursor-pointer select-none" onClick={() => toggle(i)}>
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold flex items-center justify-center shrink-0">
              {i + 1}
            </span>
            <span className="flex-1 text-sm font-medium text-slate-700 truncate">
              {s.name || `${t('businessProfile.segmentName')} ${i + 1}`}
            </span>
            <button type="button" onClick={(e) => { e.stopPropagation(); remove(i); }}
              className="p-1 text-slate-400 hover:text-red-500 transition-colors">
              <HiOutlineTrash className="w-3.5 h-3.5" />
            </button>
            {expanded[i] ? <HiOutlineChevronUp className="w-4 h-4 text-slate-400" /> : <HiOutlineChevronDown className="w-4 h-4 text-slate-400" />}
          </div>
          {expanded[i] && (
            <div className="p-3 space-y-2">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{t('businessProfile.segmentName')} *</label>
                <input type="text" value={s.name} onChange={e => update(i, 'name', e.target.value)}
                  placeholder={t('businessProfile.segmentNamePlaceholder')}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-orange-400 transition-all" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{t('businessProfile.characteristics')}</label>
                <input type="text" value={s.description} onChange={e => update(i, 'description', e.target.value)}
                  placeholder={t('businessProfile.characteristicsPlaceholder')}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-orange-400 transition-all" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{t('businessProfile.painPoint')}</label>
                <input type="text" value={s.painPoint} onChange={e => update(i, 'painPoint', e.target.value)}
                  placeholder={t('businessProfile.painPointPlaceholder')}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-orange-400 transition-all" />
              </div>
            </div>
          )}
        </div>
      ))}
      <button type="button" onClick={add}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 border border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-blue-400 hover:text-blue-500 transition-all">
        <HiOutlinePlus className="w-4 h-4" />
        {t('businessProfile.addSegment')}
      </button>
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────
const BusinessProfilePage = () => {
  const { t } = useI18n();
  const [form, setForm]             = useState(EMPTY_FORM);
  const [isLoading, setIsLoading]   = useState(true);
  const [isSaving, setIsSaving]     = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoDragging, setLogoDragging] = useState(false);
  const [logoPreview, setLogoPreview] = useState('');
  const logoInputRef = useRef(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchProfile(); }, []);

  const fetchProfile = async () => {
    try {
      const res = await businessProfileApiService.getBusinessProfile();
      if (res.data) {
        setHasProfile(true);
        setLogoPreview('');
        setForm({
          company_name:    res.data.company_name    || '',
          industry:        res.data.industry        || '',
          products:        parseArrayField(res.data.products),
          target_audience: parseArrayField(res.data.target_audience),
          tone:            res.data.tone            || 'professional',
          brand_color:     res.data.brand_color     || '#FF6B35',
          logo_url:        res.data.logo_url         || '',
          extra_context:   res.data.extra_context   || '',
        });
      }
    } catch { toast.error(t('businessProfile.loadFailed')); }
    finally { setIsLoading(false); }
  };

  const set = (field, val) => setForm(prev => ({ ...prev, [field]: val }));

  const uploadLogo = (file) => {
    if (!file || !file.type.startsWith('image/')) {
      toast.error(t('businessProfile.imageRequired'));
      return;
    }
    setIsUploadingLogo(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 800;
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        setLogoPreview(canvas.toDataURL('image/jpeg', 0.9));
        canvas.toBlob(async (blob) => {
          try {
            const formData = new FormData();
            formData.append('file', blob, 'logo.jpg');
            const res = await businessProfileApiService.uploadLogo(formData);
            set('logo_url', res.data.data.url);
          } catch {
            toast.error(t('businessProfile.uploadFailed'));
            setLogoPreview('');
          } finally {
            setIsUploadingLogo(false);
          }
        }, 'image/jpeg', 0.9);
      };
      img.onerror = () => { toast.error(t('businessProfile.readImageFailed')); setIsUploadingLogo(false); };
      img.src = e.target.result;
    };
    reader.onerror = () => { toast.error(t('businessProfile.readFileFailed')); setIsUploadingLogo(false); };
    reader.readAsDataURL(file);
  };

  const handleLogoDrop = (e) => {
    e.preventDefault();
    setLogoDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadLogo(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.company_name.trim()) { toast.error(t('businessProfile.companyRequired')); return; }
    setIsSaving(true);
    try {
      await businessProfileApiService.saveBusinessProfile(form);
      setHasProfile(true);
      toast.success(t('businessProfile.saveSuccess'));
    } catch { toast.error(t('businessProfile.saveFailed')); }
    finally { setIsSaving(false); }
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-40 text-slate-400 text-sm">{t('common.loading')}</div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
          <HiOutlineSparkles className="w-5 h-5 text-orange-500" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-800">{t('businessProfile.title')}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {t('businessProfile.description')}
          </p>
        </div>
      </div>

      {hasProfile && (
        <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full shrink-0" />
          {t('businessProfile.inUseNote')}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Thông tin cơ bản */}
        <SectionCard
          icon={HiOutlineOfficeBuilding}
          title={t('businessProfile.basicInfo')}
          subtitle={t('businessProfile.basicInfoSubtitle')}
          accent="orange"
        >
          <div className="grid grid-cols-2 gap-6">
            {/* Cột trái — Logo */}
            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{t('businessProfile.companyLogo')}</label>
              <div className="flex gap-3 items-stretch">
                {/* Preview box nhỏ */}
                <div
                  className={`shrink-0 w-36 h-36 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden transition-all cursor-pointer
                    ${logoDragging ? 'border-orange-400 bg-orange-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100'}`}
                  onDragOver={e => { e.preventDefault(); setLogoDragging(true); }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setLogoDragging(false); }}
                  onDrop={handleLogoDrop}
                  onClick={() => logoInputRef.current?.click()}
                >
                  {(logoPreview || form.logo_url)
                    ? <img src={logoPreview || form.logo_url} alt="logo" onError={e => { e.target.style.display='none'; }}
                        className="w-full h-full object-contain p-2" />
                    : <div className="flex flex-col items-center gap-1 text-slate-300">
                        <HiOutlinePhotograph className="w-7 h-7" />
                        <span className="text-[9px]">Logo</span>
                      </div>
                  }
                </div>
                {/* Controls bên phải */}
                <div className="flex-1 flex flex-col justify-between gap-2">
                  <p className="text-xs text-slate-500 leading-relaxed">{t('businessProfile.logoFormats')}</p>
                  <button type="button" onClick={() => logoInputRef.current?.click()} disabled={isUploadingLogo}
                    className="flex items-center justify-center gap-1.5 px-2 py-1.5 border border-slate-200 rounded-lg text-[11px] text-slate-600 hover:border-orange-400 hover:text-orange-500 transition-all disabled:opacity-50">
                    {isUploadingLogo
                      ? <div className="w-3 h-3 border-2 border-orange-400/30 border-t-orange-400 rounded-full animate-spin" />
                      : <HiOutlineUpload className="w-3 h-3" />}
                    {t('businessProfile.selectFile')}
                  </button>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    <div className="flex-1 h-px bg-slate-200" />{t('businessProfile.orUrl')}<div className="flex-1 h-px bg-slate-200" />
                  </div>
                  <input type="url" value={form.logo_url} onChange={e => set('logo_url', e.target.value)}
                    placeholder={t('businessProfile.pasteUrl')}
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] outline-none focus:border-orange-400 transition-all" />
                </div>
              </div>
              <p className="text-[10px] text-slate-400">{t('businessProfile.logoFormats')}</p>
            </div>

            {/* Cột phải — Tên công ty + Ngành nghề */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  {t('businessProfile.companyName')} <span className="text-red-400">*</span>
                </label>
                <input type="text" value={form.company_name} onChange={e => set('company_name', e.target.value)}
                  placeholder={t('businessProfile.companyNamePlaceholder')}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 transition-all" />
                <p className="text-[10px] text-slate-400">{t('businessProfile.companyNameFull')}</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{t('businessProfile.industry')}</label>
                <input type="text" value={form.industry} onChange={e => set('industry', e.target.value)}
                  placeholder={t('businessProfile.industryPlaceholder')}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 transition-all" />
                <p className="text-[10px] text-slate-400">{t('businessProfile.industryNote')}</p>
              </div>
            </div>
          </div>
          <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ''; }} />
        </SectionCard>

        {/* Sản phẩm / dịch vụ */}
        <SectionCard
          icon={HiOutlineCube}
          title={t('businessProfile.products')}
          subtitle={t('businessProfile.productsSubtitle')}
          accent="orange"
        >
          <ProductList products={form.products} onChange={v => set('products', v)} />
        </SectionCard>

        {/* Khách hàng mục tiêu */}
        <SectionCard
          icon={HiOutlineUserGroup}
          title={t('businessProfile.targetAudience')}
          subtitle={t('businessProfile.targetAudienceSubtitle')}
          accent="blue"
        >
          <SegmentList segments={form.target_audience} onChange={v => set('target_audience', v)} />
        </SectionCard>

        {/* Thương hiệu */}
        <SectionCard
          icon={HiOutlineColorSwatch}
          title={t('businessProfile.brandIdentity')}
          subtitle={t('businessProfile.brandIdentitySubtitle')}
          accent="purple"
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{t('businessProfile.tone')}</label>
                <select value={form.tone} onChange={e => set('tone', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 transition-all bg-white">
                  {TONE_OPTIONS(t).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{t('businessProfile.brandColor')}</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.brand_color} onChange={e => set('brand_color', e.target.value)}
                    className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5 shrink-0" />
                  <input type="text" value={form.brand_color} onChange={e => set('brand_color', e.target.value)}
                    placeholder="#FF6B35"
                    className="flex-1 min-w-0 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 transition-all font-mono" />
                </div>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Thông tin bổ sung */}
        <SectionCard
          icon={HiOutlineDocumentText}
          title={t('businessProfile.additionalInfo')}
          subtitle={t('businessProfile.additionalInfoSubtitle')}
          accent="slate"
        >
          <textarea value={form.extra_context} onChange={e => set('extra_context', e.target.value)}
            placeholder={t('businessProfile.additionalInfoPlaceholder')}
            rows={4}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 transition-all resize-none" />
        </SectionCard>

        <div className="flex justify-end pt-1">
          <button type="submit" disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white text-sm font-semibold rounded-xl hover:bg-orange-600 active:scale-95 transition-all disabled:opacity-60 shadow-md shadow-orange-500/25">
            {isSaving
              ? <><HiOutlineRefresh className="w-4 h-4 animate-spin" />{t('businessProfile.savingProfile')}</>
              : <><HiOutlineSave className="w-4 h-4" />{t('businessProfile.saveProfile')}</>}
          </button>
        </div>
      </form>
    </div>
  );
};

export default BusinessProfilePage;
