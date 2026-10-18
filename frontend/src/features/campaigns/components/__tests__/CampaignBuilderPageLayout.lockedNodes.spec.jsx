import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReactFlowProvider } from 'reactflow';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../../i18n';
import CampaignBuilderPageLayout from '../CampaignBuilderPageLayout';
import { getAllowedActionNodeTypesByCampaignType } from '../../utils/campaignBuilderFlow';

/**
 * PLAN_KENH_KHONG_AN_KHOA_VA_GOI_Y_MUA_2026-10-11 — palette trình dựng: bước của kênh chưa dùng được vẫn HIỆN nhưng mờ + khoá,
 * không kéo thả được (không `draggable`, không gọi onDragStart), bấm gọi onLockedNodeClick(kênh); bước kênh dùng được kéo bình thường.
 */
vi.mock('../../../../components/campaigns/CampaignExecutionLogWorkspace', () => ({ default: () => null }));

// reactflow đo khung canvas bằng ResizeObserver (jsdom không có) — chỉ cần giả lập rỗng để vẽ được palette.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function renderPalette(props = {}) {
  const onDragStart = vi.fn();
  const onLockedNodeClick = vi.fn();
  const allowed = getAllowedActionNodeTypesByCampaignType('mixed', { telegramEnabled: true, whatsappEnabled: true, zaloEnabled: true });
  render(
    <MemoryRouter>
      <I18nProvider>
        <ReactFlowProvider>
          <CampaignBuilderPageLayout
            campaignName="Chiến dịch thử"
            campaignStatus="draft"
            campaignType="mixed"
            isDirty={false}
            builderSidebarWidth={260}
            searchTerm=""
            setSearchTerm={vi.fn()}
            toggleCategory={vi.fn()}
            expandedCategories={['Triggers', 'Zalo', 'Data', 'Logic', 'Actions']}
            filterNodes={(list) => list}
            allowedActionNodeTypes={allowed}
            allowedDataNodeTypes={null}
            zaloEnabled
            onDragStart={onDragStart}
            onLockedNodeClick={onLockedNodeClick}
            nodes={[]}
            edges={[]}
            getAllowedActionNodeTypesByCampaignType={() => allowed}
            getAllowedDataNodeTypesByCampaignType={() => null}
            isTriggerNodeType={(type) => String(type || '').includes('trigger')}
            nodeTypes={{}}
            edgeTypes={{}}
            {...props}
          />
        </ReactFlowProvider>
      </I18nProvider>
    </MemoryRouter>
  );
  return { onDragStart, onLockedNodeClick };
}

describe('CampaignBuilderPageLayout — khối "Sắp có" trên bảng khối (PLAN_TAG_KHACH_HANG PR-T2)', () => {
  it('Điều kiện + Cập nhật thông tin: thẻ mờ nhãn "Sắp có", KHÔNG draggable, có title giải thích; Gắn tag kéo thả bình thường', () => {
    const { onDragStart } = renderPalette({ lockedNodeChannels: {} });
    for (const type of ['condition', 'update_attribute']) {
      const item = screen.getByTestId(`palette-node-${type}`);
      expect(item).toHaveAttribute('data-coming-soon', 'true');
      expect(item).toHaveAttribute('aria-disabled', 'true');
      expect(item).not.toHaveAttribute('draggable');
      expect(item.getAttribute('title')).toMatch(/sắp có/i);
      expect(screen.getByTestId(`palette-coming-soon-${type}`)).toHaveTextContent('Sắp có');
      fireEvent.dragStart(item);
    }
    expect(onDragStart).not.toHaveBeenCalled();
    const tag = screen.getByTestId('palette-node-tag_contact');
    expect(tag).toHaveAttribute('draggable', 'true');
    expect(tag).not.toHaveAttribute('data-coming-soon');
  });
});

describe('CampaignBuilderPageLayout — bước của kênh bị khoá trên palette', () => {
  it('không khoá gì: mọi bước kéo thả được (draggable), không có aria-disabled', () => {
    renderPalette({ lockedNodeChannels: {} });
    for (const type of ['send_email', 'send_telegram', 'send_whatsapp', 'send_zalo_personal', 'select_zalo_account']) {
      const item = screen.getByTestId(`palette-node-${type}`);
      expect(item).toHaveAttribute('draggable', 'true');
      expect(item).not.toHaveAttribute('aria-disabled');
    }
  });

  it('bước Telegram bị khoá: vẫn hiện, mờ, KHÔNG draggable; bấm gọi onLockedNodeClick("telegram"), kéo không kích hoạt onDragStart; bước kênh khác vẫn kéo được', () => {
    const { onDragStart, onLockedNodeClick } = renderPalette({ lockedNodeChannels: { send_telegram: 'telegram' } });
    const locked = screen.getByTestId('palette-node-send_telegram');
    expect(locked).toHaveAttribute('aria-disabled', 'true');
    expect(locked).toHaveAttribute('data-locked-channel', 'telegram');
    expect(locked).not.toHaveAttribute('draggable');
    expect(locked.className).toContain('opacity-60');

    fireEvent.dragStart(locked);
    expect(onDragStart).not.toHaveBeenCalled();
    fireEvent.click(locked);
    expect(onLockedNodeClick).toHaveBeenCalledWith('telegram');
    fireEvent.keyDown(locked, { key: 'Enter' });
    expect(onLockedNodeClick).toHaveBeenCalledTimes(2);

    const free = screen.getByTestId('palette-node-send_whatsapp');
    expect(free).toHaveAttribute('draggable', 'true');
    fireEvent.dragStart(free);
    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(onDragStart.mock.calls[0][1]).toBe('send_whatsapp');
  });

  it('Zalo bị khoá: cả khối gửi Zalo lẫn khối Chọn tài khoản Zalo trong mục Zalo đều khoá; Email không bị ảnh hưởng', () => {
    renderPalette({
      lockedNodeChannels: {
        send_zalo_personal: 'zalo', send_zalo_friend_request: 'zalo', send_zalo_group: 'zalo', select_zalo_account: 'zalo',
      },
    });
    for (const type of ['send_zalo_personal', 'send_zalo_friend_request', 'send_zalo_group', 'select_zalo_account']) {
      expect(screen.getByTestId(`palette-node-${type}`)).toHaveAttribute('aria-disabled', 'true');
    }
    expect(screen.getByTestId('palette-node-send_email')).toHaveAttribute('draggable', 'true');
  });
});
