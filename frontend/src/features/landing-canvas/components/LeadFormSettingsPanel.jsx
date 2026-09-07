import { useState } from 'react';
import { useI18n } from '../../../i18n';
import LeadFormConfigPanel from '../../landing-pages/components/LeadFormConfigPanel.jsx';
import LeadFormStylePanel from './LeadFormStylePanel.jsx';

/**
 * Tab Lead Form trong Settings Modal.
 * Bao gồm 2 phần:
 *  - Cấu hình trường (LeadFormConfigPanel) — có xem trước form.
 *  - Style + snippet HTML/iframe để copy (LeadFormStylePanel).
 * Theme được lưu vào form.leadFormConfig.theme nên cả 2 panel dùng chung nguồn.
 * nameMode ('split' | 'single') được chia sẻ giữa style panel (toggle) và preview trong config panel.
 */
export default function LeadFormSettingsPanel({ form, setForm, t, editingId }) {
  const tc = useI18n('landingCanvas.leadFormSettingsPanel');
  const [nameMode, setNameMode] = useState('single'); // 'split' | 'single' — mặc định 1 ô Họ và tên

  return (
    <div className="space-y-7">
      <section>
        <p className="text-[15px] text-gray-500 mb-4 leading-relaxed">
          {tc('configHelp')}
        </p>
        <LeadFormConfigPanel
          form={form}
          setForm={setForm}
          t={t}
          nameMode={nameMode}
        />
      </section>

      <section className="border-t border-gray-100 pt-6">
        <h4 className="text-[18px] font-semibold text-gray-800 mb-2">{tc('styleTitle')}</h4>
        <p className="text-[15px] text-gray-500 mb-5 leading-relaxed">
          {tc('styleHelp')}
        </p>
        <LeadFormStylePanel
          form={form}
          setForm={setForm}
          slug={form?.slug}
          editingId={editingId}
          nameMode={nameMode}
          onNameModeChange={setNameMode}
        />
      </section>
    </div>
  );
}
