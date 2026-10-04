import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

/**
 * 04/10/2026 — từ điển tiếng Anh (`en.js`, ~470 KB) nạp LƯỜI (PLAN_TACH_BUNDLE_FRONTEND mục 4 / PR-B):
 * `vi` import tĩnh, `en` qua import() động. Mỗi ca dựng lại module (vi.resetModules) vì từ điển đã nạp
 * được giữ ở cấp module — ca sau sẽ thấy `en` sẵn có nếu không reset.
 *
 * `en.js` được mock bằng factory để điều khiển lúc nào import() xong / lỗi:
 *  - gate: chặn import() tới khi test gọi releaseEnglish();
 *  - failNextEnglishImport: factory ném lỗi một lần (chunk 404 sau deploy, mất mạng).
 */
let gate;
let failNextEnglishImport;
let englishImports;

function newGate() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
}

async function freshModules() {
  vi.resetModules();
  vi.doMock('../en.js', async () => {
    englishImports += 1;
    if (gate) await gate.promise;
    if (failNextEnglishImport) {
      failNextEnglishImport = false;
      throw new Error('Failed to fetch dynamically imported module: en');
    }
    return vi.importActual('../en.js');
  });
  const { I18nProvider, useI18n } = await import('../index.jsx');
  const english = await import('../englishDictionary');
  return { I18nProvider, useI18n, english };
}

function makeProbe(useI18n) {
  return function Probe() {
    const { t, locale, changeLocale, toggleLocale, availableLocales } = useI18n();
    return (
      <div data-testid="probe">
        <span data-testid="locale">{locale}</span>
        <span data-testid="save">{t('common.save')}</span>
        <span data-testid="available">{availableLocales.join(',')}</span>
        <button onClick={() => changeLocale('en')}>to-en</button>
        <button onClick={() => changeLocale('vi')}>to-vi</button>
        <button onClick={() => changeLocale('fr')}>to-fr</button>
        <button onClick={() => toggleLocale()}>toggle</button>
      </div>
    );
  };
}

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

let warnSpy;

beforeEach(() => {
  localStorage.clear();
  gate = null;
  failNextEnglishImport = false;
  englishImports = 0;
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  vi.doUnmock('../en.js');
  localStorage.clear();
});

describe('I18nProvider — từ điển tiếng Anh nạp lười', () => {
  it('khởi động tiếng Việt: render ngay bằng chuỗi VI, KHÔNG nạp en; availableLocales cố định [vi, en]', async () => {
    const { I18nProvider, useI18n, english } = await freshModules();
    const Probe = makeProbe(useI18n);
    render(<I18nProvider><Probe /></I18nProvider>);

    expect(screen.getByTestId('save')).toHaveTextContent('Lưu');
    expect(screen.getByTestId('locale')).toHaveTextContent('vi');
    expect(screen.getByTestId('available')).toHaveTextContent('vi,en');
    expect(english.getLoadedEnglish()).toBeNull();
    expect(englishImports).toBe(0);
  });

  it('khởi động với locale en đã lưu: hiện màn chờ (chưa render con) rồi chuỗi EN khi nạp xong', async () => {
    localStorage.setItem('uknow_locale', 'en');
    gate = newGate();
    const { I18nProvider, useI18n } = await freshModules();
    const Probe = makeProbe(useI18n);
    render(<I18nProvider><Probe /></I18nProvider>);

    expect(screen.queryByTestId('probe')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();

    await act(async () => { gate.release(); });

    expect(await screen.findByTestId('save')).toHaveTextContent('Save');
    expect(screen.getByTestId('locale')).toHaveTextContent('en');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByTestId('available')).toHaveTextContent('vi,en');
  });

  it('đổi vi → en lần đầu: nạp xong mới đổi (t() trả EN, locale en, đã lưu); lần sau đổi tức thì không nạp lại', async () => {
    gate = newGate();
    const { I18nProvider, useI18n, english } = await freshModules();
    const Probe = makeProbe(useI18n);
    render(<I18nProvider><Probe /></I18nProvider>);
    expect(screen.getByTestId('available')).toHaveTextContent('vi,en'); // en chưa nạp mà menu vẫn đủ hai ngôn ngữ

    fireEvent.click(screen.getByText('to-en'));
    // en chưa về: vẫn tiếng Việt, không có khoảnh khắc locale=en mà thiếu chuỗi
    expect(screen.getByTestId('locale')).toHaveTextContent('vi');
    expect(screen.getByTestId('save')).toHaveTextContent('Lưu');

    await act(async () => { gate.release(); });
    await waitFor(() => expect(screen.getByTestId('save')).toHaveTextContent('Save'));
    expect(screen.getByTestId('locale')).toHaveTextContent('en');
    expect(localStorage.getItem('uknow_locale')).toBe('en');
    expect(english.getLoadedEnglish()).not.toBeNull();

    fireEvent.click(screen.getByText('to-vi'));
    expect(screen.getByTestId('save')).toHaveTextContent('Lưu');
    fireEvent.click(screen.getByText('to-en'));
    expect(screen.getByTestId('save')).toHaveTextContent('Save'); // đồng bộ, không chờ
    expect(englishImports).toBe(1);
  });

  it('bấm EN rồi VI ngay khi en đang nạp: nạp xong KHÔNG ghi đè về EN', async () => {
    gate = newGate();
    const { I18nProvider, useI18n, english } = await freshModules();
    const Probe = makeProbe(useI18n);
    render(<I18nProvider><Probe /></I18nProvider>);

    fireEvent.click(screen.getByText('to-en'));
    fireEvent.click(screen.getByText('to-vi'));
    await act(async () => {
      gate.release();
      // Chờ import() thật sự xong (dùng chung lượt đang bay) — không thì ca này đạt rỗng vì khẳng định chạy trước khi en về.
      await english.loadEnglishDictionary();
    });
    await flush();
    expect(english.getLoadedEnglish()).not.toBeNull();

    expect(screen.getByTestId('locale')).toHaveTextContent('vi');
    expect(screen.getByTestId('save')).toHaveTextContent('Lưu');
  });

  it('locale lạ vẫn bị bỏ qua như trước (chỉ vi/en có từ điển)', async () => {
    const { I18nProvider, useI18n } = await freshModules();
    const Probe = makeProbe(useI18n);
    render(<I18nProvider><Probe /></I18nProvider>);

    fireEvent.click(screen.getByText('to-fr'));
    await flush();

    expect(screen.getByTestId('locale')).toHaveTextContent('vi');
    expect(englishImports).toBe(0);
  });

  it('en nạp LỖI lúc khởi động: ở lại tiếng Việt + console.warn, không trắng trang, GIỮ lựa chọn en đã lưu', async () => {
    localStorage.setItem('uknow_locale', 'en');
    failNextEnglishImport = true;
    const { I18nProvider, useI18n } = await freshModules();
    const Probe = makeProbe(useI18n);
    render(<I18nProvider><Probe /></I18nProvider>);

    expect(await screen.findByTestId('save')).toHaveTextContent('Lưu');
    expect(screen.getByTestId('locale')).toHaveTextContent('vi');
    expect(warnSpy).toHaveBeenCalled();
    expect(localStorage.getItem('uknow_locale')).toBe('en'); // lỗi mạng thoáng qua không xoá lựa chọn của người dùng
  });

  it('en nạp LỖI khi đổi vi → en: ở lại VI + console.warn; thử lại sau đó nạp được', async () => {
    failNextEnglishImport = true;
    const { I18nProvider, useI18n } = await freshModules();
    const Probe = makeProbe(useI18n);
    render(<I18nProvider><Probe /></I18nProvider>);

    fireEvent.click(screen.getByText('to-en'));
    await waitFor(() => expect(warnSpy).toHaveBeenCalled());
    expect(screen.getByTestId('locale')).toHaveTextContent('vi');
    expect(screen.getByTestId('save')).toHaveTextContent('Lưu');
    expect(localStorage.getItem('uknow_locale')).toBe('vi');

    fireEvent.click(screen.getByText('toggle')); // ý định đã trả về vi → toggle thử sang en lần nữa
    await waitFor(() => expect(screen.getByTestId('save')).toHaveTextContent('Save'));
    expect(englishImports).toBe(2);
  });

  it('getLoadedDictionary: en chưa nạp → từ điển vi (không ném); nạp rồi → en; locale lạ → vi', async () => {
    const { english } = await freshModules();
    const viDictionary = (await import('../vi.js')).default;

    expect(english.getLoadedDictionary('en')).toBe(viDictionary);
    expect(english.getLoadedDictionary('vi')).toBe(viDictionary);

    const enDictionary = await english.loadEnglishDictionary();
    expect(english.getLoadedDictionary('en')).toBe(enDictionary);
    expect(english.getLoadedDictionary('fr')).toBe(viDictionary);
    expect(enDictionary.common.save).toBe('Save');
  });
});
