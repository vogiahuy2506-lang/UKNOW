import { createPortal } from 'react-dom';

export const fmtVnd   = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';
export const fmtEmp   = (n) => n === -1 ? 'Không giới hạn' : `${n} nhân viên`;
export const fmtLimit = (v) => {
  if (v == null || v === '') return '∞';
  if (Number(v) === -1) return 'N/A';
  return Number(v).toLocaleString('vi-VN');
};

export const normalizeMoneyValue = (value) => {
  if (value === '' || value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';

  const raw = String(value).trim();
  if (!raw) return '';

  const compact = raw.replace(/[^\d.,-]/g, '');
  if (!compact || compact === '-') return '';

  const hasDot = compact.includes('.');
  const hasComma = compact.includes(',');

  if (hasDot && hasComma) {
    const lastDot = compact.lastIndexOf('.');
    const lastComma = compact.lastIndexOf(',');
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const groupSep = decimalSep === '.' ? ',' : '.';
    const [whole, decimal = ''] = compact.split(decimalSep);
    const normalized = `${whole.replaceAll(groupSep, '')}.${decimal}`;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? Math.round(parsed) : '';
  }

  if (hasDot) {
    const parts = compact.split('.');
    const isGrouped = parts.length > 1
      && parts[0].length >= 1
      && parts[0].length <= 3
      && parts.slice(1).every((part) => part.length === 3);
    const parsed = Number(isGrouped ? parts.join('') : compact);
    return Number.isFinite(parsed) ? Math.round(parsed) : '';
  }

  if (hasComma) {
    const parts = compact.split(',');
    const isGrouped = parts.length > 1
      && parts[0].length >= 1
      && parts[0].length <= 3
      && parts.slice(1).every((part) => part.length === 3);
    const parsed = Number(isGrouped ? parts.join('') : compact.replace(',', '.'));
    return Number.isFinite(parsed) ? Math.round(parsed) : '';
  }

  const parsed = Number(compact);
  return Number.isFinite(parsed) ? Math.round(parsed) : '';
};

export const MODAL_OVERLAY = 'fixed inset-0 z-[9999] flex items-center justify-center p-4';
export const MODAL_PANEL   = 'relative z-10 w-full max-w-lg max-h-[90vh] rounded-xl bg-white shadow-xl p-6 overflow-y-auto';
export const MODAL_SM      = 'relative z-10 w-full max-w-md  max-h-[90vh] rounded-xl bg-white shadow-xl p-6 overflow-y-auto';
export const MODAL_FORM    = 'relative z-10 w-full max-w-5xl max-h-[92vh] rounded-2xl bg-white shadow-2xl overflow-hidden';

export const renderModal = (content, onClose, cls = MODAL_PANEL) =>
  createPortal(
    <div className={MODAL_OVERLAY}>
      <div
        role="presentation"
        aria-hidden
        className="absolute inset-0 z-0 bg-black/50"
        onClick={onClose}
      />
      <div
        className={cls}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>,
    document.body
  );

export const emptyForm = () => ({
  code: '', name: '', price: 0, priceYearly: '', description: '',
  maxEmployees: -1, isActive: true, features: [],
  durationDays: '',
  dailyEmailLimit: '', monthlyEmailLimit: '',
  dailyZaloLimit: '',  monthlyZaloLimit: '',
  maxLandingPages: '', maxCampaigns: '',
  maxZaloCampaigns: '', maxZaloGroupCampaigns: '', maxEmailCampaigns: '',
  maxZaloAccounts: '', maxEmailAccounts: '',
  maxEmailTemplates: '', maxZaloTemplates: '',
});
