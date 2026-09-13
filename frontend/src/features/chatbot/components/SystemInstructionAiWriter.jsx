import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineSparkles } from 'react-icons/hi';
import aiApi from '../../../services/aiApi';
import { useI18n } from '../../../i18n';

const MAX_HINT_LENGTH = 500;

/**
 * "AI viết hộ" chỉ dẫn hệ thống cho chatbot — PR-2 của PLAN_AI_VIET_HO_CHI_DAN_CHATBOT_2026-09-13.
 *
 * Hiện dạng KHỐI MỞ RỘNG ngay dưới nhãn, KHÔNG mở modal: component cha (AIConfig) đã nằm trong
 * ChatbotConfigModal, mà modal-chồng-modal ở repo này từng làm overlay chặn con trỏ.
 *
 * Ba ràng buộc sếp chốt 13/09: trừ credit mỗi lần viết · nạp hồ sơ doanh nghiệp (backend lo) ·
 * XEM TRƯỚC rồi mới áp, không đè thẳng vào ô nhập.
 *
 * @param {{ currentValue: string, onApply: (text: string) => void }} props
 */
export default function SystemInstructionAiWriter({ currentValue = '', onApply }) {
  const { t, locale } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [hint, setHint] = useState('');
  const [result, setResult] = useState('');
  const [isWriting, setIsWriting] = useState(false);
  const [hintError, setHintError] = useState('');
  // Cờ trong ref chứ không chỉ state: state `disabled` cập nhật sau lần render kế, nên hai cú bấm
  // sát nhau vẫn lọt được hai lời gọi — tức trừ HAI credit của khách cho một ý định.
  const inFlightRef = useRef(false);

  const write = async () => {
    if (inFlightRef.current) return;
    const trimmed = hint.trim();
    if (!trimmed) {
      setHintError(t('systemInstructionAiWriter.hintRequired'));
      return;
    }
    if (trimmed.length > MAX_HINT_LENGTH) {
      setHintError(t('systemInstructionAiWriter.hintTooLong', { max: MAX_HINT_LENGTH }));
      return;
    }
    setHintError('');
    inFlightRef.current = true;
    setIsWriting(true);
    try {
      const res = await aiApi.generateSystemInstruction({
        hint: trimmed,
        language: locale === 'en' ? 'en' : 'vi',
      });
      const instruction = res?.data?.instruction || '';
      if (!instruction) {
        toast.error(t('systemInstructionAiWriter.emptyResult'));
        return;
      }
      setResult(instruction);
    } catch (error) {
      const status = error?.response?.status;
      const message = error?.response?.data?.message;
      toast.error(
        status === 402
          ? message || t('systemInstructionAiWriter.outOfCredit')
          : message || t('systemInstructionAiWriter.writeFailed'),
      );
    } finally {
      inFlightRef.current = false;
      setIsWriting(false);
    }
  };

  const apply = () => {
    if (!result) return;
    if (currentValue.trim() && !window.confirm(t('systemInstructionAiWriter.overwriteConfirm'))) {
      return;
    }
    onApply?.(result);
    setResult('');
    setIsOpen(false);
  };

  const discard = () => {
    setResult('');
  };

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-700"
        aria-expanded={isOpen}
      >
        <HiOutlineSparkles className="w-3.5 h-3.5" />
        {t('systemInstructionAiWriter.toggle')}
      </button>

      {isOpen && (
        <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/50 p-3 space-y-2">
          {!result && (
            <>
              <label htmlFor="system-instruction-ai-hint" className="text-xs font-medium text-slate-700 block">
                {t('systemInstructionAiWriter.hintLabel')}
              </label>
              <textarea
                id="system-instruction-ai-hint"
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                maxLength={MAX_HINT_LENGTH}
                rows={2}
                placeholder={t('systemInstructionAiWriter.hintPlaceholder')}
                className="input resize-y min-h-[56px] text-sm"
                disabled={isWriting}
              />
              {hintError && <p role="alert" className="text-xs text-red-600">{hintError}</p>}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-slate-500">{t('systemInstructionAiWriter.creditNote')}</span>
                <button
                  type="button"
                  onClick={write}
                  disabled={isWriting}
                  className="btn btn-primary text-xs disabled:opacity-50"
                >
                  {isWriting ? t('systemInstructionAiWriter.writing') : t('systemInstructionAiWriter.write')}
                </button>
              </div>
            </>
          )}

          {result && (
            <>
              <p className="text-xs font-medium text-slate-700">{t('systemInstructionAiWriter.previewTitle')}</p>
              <pre
                data-testid="system-instruction-ai-preview"
                className="max-h-64 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-white p-2 text-xs text-slate-800"
              >
                {result}
              </pre>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button type="button" onClick={discard} className="btn btn-ghost text-xs">
                  {t('systemInstructionAiWriter.discard')}
                </button>
                <button type="button" onClick={write} disabled={isWriting} className="btn btn-secondary text-xs disabled:opacity-50">
                  {isWriting ? t('systemInstructionAiWriter.writing') : t('systemInstructionAiWriter.rewrite')}
                </button>
                <button type="button" onClick={apply} disabled={isWriting} className="btn btn-primary text-xs disabled:opacity-50">
                  {t('systemInstructionAiWriter.apply')}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
