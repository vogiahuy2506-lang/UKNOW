import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { I18nProvider } from '../../../../i18n';
import { NodeConfigReadSheetSection } from '../NodeConfigModalReadSheetSection';

/**
 * PLAN_TU_NHAN_TEN_SHEET_DAU_TIEN_2026-09-15, Việc 3: dòng "Tự nhận từ file (tab đầu tiên)"
 * chỉ hiện khi `sheetNameSource === 'auto'`; người dùng gõ/sửa ô Tên Sheet phải bỏ cờ đó.
 */
function Harness({ initial = {} }) {
  const [formData, setFormData] = useState({
    label: '',
    sheetUrl: 'https://docs.google.com/spreadsheets/d/abc/edit',
    sheetName: '',
    headerRow: 1,
    dataStartRow: 2,
    columns: [],
    ...initial,
  });
  return (
    <div>
      <NodeConfigReadSheetSection
        formData={formData}
        setFormData={setFormData}
        selectedReadSheetSection="config"
        setSelectedReadSheetSection={() => {}}
        handleCheckSheetConnection={() => {}}
        isCheckingSheet={false}
      />
      <pre data-testid="form-data-json">{JSON.stringify(formData)}</pre>
    </div>
  );
}

function renderHarness(initial = {}) {
  return render(
    <I18nProvider>
      <Harness initial={initial} />
    </I18nProvider>
  );
}

const readFormData = () => JSON.parse(screen.getByTestId('form-data-json').textContent);

describe('NodeConfigModalReadSheetSection — tự nhận tên sheet đầu tiên', () => {
  it('sheetNameSource "auto" -> hiện dòng "Tự nhận từ file"', () => {
    renderHarness({ sheetName: 'Khách tháng 9', sheetNameSource: 'auto' });

    expect(screen.getByText('Tự nhận từ file (tab đầu tiên)')).toBeInTheDocument();
  });

  it('không có sheetNameSource (tên gõ tay/để trống) -> KHÔNG hiện dòng "Tự nhận từ file"', () => {
    renderHarness({ sheetName: 'Tên tự gõ' });

    expect(screen.queryByText('Tự nhận từ file (tab đầu tiên)')).not.toBeInTheDocument();
  });

  it('gõ vào ô Tên Sheet khi đang auto -> mất dòng "Tự nhận…" và formData không còn sheetNameSource "auto"', () => {
    renderHarness({ sheetName: 'Khách tháng 9', sheetNameSource: 'auto' });

    expect(screen.getByText('Tự nhận từ file (tab đầu tiên)')).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/tab đầu tiên/i);
    fireEvent.change(input, { target: { value: 'Khách tháng 9 sửa tay' } });

    expect(screen.queryByText('Tự nhận từ file (tab đầu tiên)')).not.toBeInTheDocument();
    const fd = readFormData();
    expect(fd.sheetName).toBe('Khách tháng 9 sửa tay');
    expect(fd.sheetNameSource).not.toBe('auto');
  });
});
