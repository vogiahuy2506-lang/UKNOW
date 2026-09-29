import { useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlinePaperAirplane } from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import whatsappSettingsApiService from '../services/whatsappSettingsApi.service';
import { parseWhatsAppPhoneList } from '../../campaigns/utils/nodeConfigModal.helpers';

/**
 * P8a (PLAN_TG_WA_DAY_DU mục 11) — nút "Gửi thử" của một số WhatsApp đang kết nối: nhập SĐT, gửi MỘT tin thử để
 * kiểm tra kết nối trước khi chạy chiến dịch. API `POST /whatsapp-qr/sessions/:key/messages` có sẵn từ W1
 * (limiter 10 lần/giờ ở backend); backend nhận `:key` là khoá NGẮN (không có tiền tố chủ), như xoá/đổi tên phiên.
 *
 * @param {{ sessionKey: string }} props `sessionKey` đầy đủ dạng "<idChủ>-<tênPhiên>".
 */
export default function WhatsAppTestSend({ sessionKey }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const shortKey = String(sessionKey || '').split('-').slice(1).join('-') || 'default';

  const handleSend = async () => {
    const { valid, invalid } = parseWhatsAppPhoneList(phone);
    if (valid.length !== 1 || invalid.length > 0) {
      setError(t('whatsAppSettings.testSend.invalidPhone'));
      return;
    }
    setError('');
    setSending(true);
    try {
      await whatsappSettingsApiService.sendBaileysTest(
        shortKey,
        valid[0],
        text.trim() || t('whatsAppSettings.testSend.defaultText'),
      );
      toast.success(t('whatsAppSettings.testSend.success'));
    } catch (err) {
      toast.error(err?.response?.data?.message || t('whatsAppSettings.testSend.failed'));
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <div className="mt-3 border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-primary-200 hover:text-primary-700"
        >
          <HiOutlinePaperAirplane className="h-3.5 w-3.5 rotate-45" />
          {t('whatsAppSettings.testSend.toggle')}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3" data-testid="whatsapp-test-send">
      <p className="text-xs font-semibold text-slate-700">{t('whatsAppSettings.testSend.title')}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs text-slate-600">
          {t('whatsAppSettings.testSend.phoneLabel')}
          <input
            type="text"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t('whatsAppSettings.testSend.phonePlaceholder')}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </label>
        <label className="block text-xs text-slate-600">
          {t('whatsAppSettings.testSend.textLabel')}
          <input
            type="text"
            maxLength={1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('whatsAppSettings.testSend.defaultText')}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </label>
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSend}
          disabled={sending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <HiOutlinePaperAirplane className="h-3.5 w-3.5 rotate-45" />
          {sending ? t('whatsAppSettings.testSend.sending') : t('whatsAppSettings.testSend.send')}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={sending}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          {t('whatsAppSettings.testSend.close')}
        </button>
        <span className="text-[11px] text-slate-500">{t('whatsAppSettings.testSend.hint')}</span>
      </div>
    </div>
  );
}
