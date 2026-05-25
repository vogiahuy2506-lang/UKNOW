import { createPortal } from 'react-dom';

export const fmtVnd   = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';
export const fmtEmp   = (n) => n === -1 ? 'Không giới hạn' : `${n} nhân viên`;
export const fmtLimit = (v) => (v == null ? '∞' : Number(v).toLocaleString('vi-VN'));

export const MODAL_OVERLAY = 'fixed inset-0 z-[9999] flex items-center justify-center p-4';
export const MODAL_PANEL   = 'relative z-10 w-full max-w-lg max-h-[90vh] rounded-xl bg-white shadow-xl p-6 overflow-y-auto';
export const MODAL_SM      = 'relative z-10 w-full max-w-md  max-h-[90vh] rounded-xl bg-white shadow-xl p-6 overflow-y-auto';

export const renderModal = (content, onClose, cls = MODAL_PANEL) =>
  createPortal(
    <div className={MODAL_OVERLAY}>
      <button type="button" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={cls}>{content}</div>
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
  maxZaloAccounts: '', maxEmailAccounts: '',
  maxEmailTemplates: '', maxZaloTemplates: '',
});
