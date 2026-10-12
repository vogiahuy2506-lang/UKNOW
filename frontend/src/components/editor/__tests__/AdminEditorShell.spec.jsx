import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { I18nProvider } from '../../../i18n';
import {
  AdminEditorShell,
  EditorTopbar,
  EditorSettingsModal,
  TopbarSaveButton,
  TopbarSettingsButton,
  TopbarToolsMenu,
} from '../AdminEditorShell';

const wrap = (ui) => render(<I18nProvider>{ui}</I18nProvider>);

describe('AdminEditorShell', () => {
  it('thanh trên + vùng soạn; nút Cài đặt mở modal, Esc đóng', () => {
    const onClose = vi.fn();
    const onOpen = vi.fn();
    wrap(
      <AdminEditorShell topbar={<EditorTopbar title="Soạn email" right={<TopbarSettingsButton onClick={onOpen} />} />}>
        <div>vùng soạn</div>
        <EditorSettingsModal open onClose={onClose}><div>cấu hình</div></EditorSettingsModal>
      </AdminEditorShell>
    );
    expect(screen.getByTestId('admin-editor-shell')).toBeInTheDocument();
    expect(screen.getByText('vùng soạn')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cài đặt' }));
    expect(onOpen).toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent('cấu hình');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('EditorSettingsModal: tiêu đề / dải tab / chân KHÔNG co lại (shrink-0) khi thân dài; thân là vùng cuộn duy nhất; dải tab không có cuộn dọc', () => {
    wrap(
      <EditorSettingsModal
        open
        onClose={() => {}}
        tabs={[{ key: 'a', label: 'Kênh gửi' }, { key: 'b', label: 'Đối tượng' }]}
        activeTab="a"
        footer={<button type="button">Xong</button>}
      >
        <div style={{ height: 4000 }}>nội dung rất dài</div>
      </EditorSettingsModal>,
    );
    const dlg = screen.getByRole('dialog');
    const tabs = screen.getByTestId('editor-settings-tabs');
    expect(tabs).toHaveClass('shrink-0');
    expect(tabs).toHaveClass('overflow-y-hidden');
    expect(dlg.firstElementChild).toHaveClass('shrink-0'); // khối tiêu đề
    expect(screen.getByRole('button', { name: 'Xong' }).parentElement).toHaveClass('shrink-0'); // chân
    const body = screen.getByText('nội dung rất dài').parentElement;
    expect(body).toHaveClass('flex-1', 'min-h-0', 'overflow-y-auto');
  });

  it('menu Công cụ: mở, bấm mục gọi onClick rồi tự đóng', () => {
    const onReset = vi.fn();
    wrap(<TopbarToolsMenu items={[{ key: 'reset', label: 'Khôi phục mặc định', onClick: onReset }]} />);
    fireEvent.click(screen.getByRole('button', { name: /Công cụ/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Khôi phục mặc định/ }));
    expect(onReset).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('nút Lưu: đang lưu thì khoá và đổi nhãn', () => {
    const { rerender } = wrap(<TopbarSaveButton onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeEnabled();
    rerender(<I18nProvider><TopbarSaveButton onClick={() => {}} saving /></I18nProvider>);
    expect(screen.getByRole('button', { name: 'Đang lưu...' })).toBeDisabled();
  });
});
