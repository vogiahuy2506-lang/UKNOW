import { describe, expect, it } from 'vitest';
import {
  createCampaignNodeSnapshot,
  createPastedCampaignNode,
  isEditableClipboardTarget,
} from '../campaignNodeClipboard';

const buildSourceNode = () => ({
  id: 'read_sheet-1',
  type: 'task',
  position: { x: 100, y: 200 },
  data: {
    label: 'Lấy dữ liệu Excel',
    nodeType: 'read_sheet',
    config: {
      sheetUrl: 'https://docs.google.com/spreadsheets/d/example/edit',
      sheetName: 'Khách hàng',
      headerRow: 1,
      columns: [{ key: 'email', label: 'Email' }],
    },
  },
});

describe('campaign node clipboard', () => {
  it('chụp một bản config độc lập tại thời điểm copy', () => {
    const sourceNode = buildSourceNode();
    const snapshot = createCampaignNodeSnapshot(sourceNode);

    sourceNode.data.config.columns[0].label = 'Đã đổi sau khi copy';

    expect(snapshot.data.config).toMatchObject({
      sheetName: 'Khách hàng',
      columns: [{ key: 'email', label: 'Email' }],
    });
  });

  it('paste thành node ID mới, lệch vị trí và giữ toàn bộ cấu hình Excel', () => {
    const sourceNode = buildSourceNode();
    const snapshot = createCampaignNodeSnapshot(sourceNode);
    const pasted = createPastedCampaignNode({
      snapshot,
      nodes: [sourceNode],
      pasteSequence: 2,
      copyLabel: 'Lấy dữ liệu Excel (Bản sao)',
      idFactory: () => 'read_sheet-copy-2',
    });

    expect(pasted).toMatchObject({
      id: 'read_sheet-copy-2',
      type: 'task',
      position: { x: 180, y: 280 },
      selected: true,
      data: {
        label: 'Lấy dữ liệu Excel (Bản sao)',
        nodeType: 'read_sheet',
        config: {
          sheetUrl: 'https://docs.google.com/spreadsheets/d/example/edit',
          sheetName: 'Khách hàng',
          headerRow: 1,
        },
      },
    });

    pasted.data.config.columns[0].label = 'Bản sao chỉnh riêng';
    expect(snapshot.data.config.columns[0].label).not.toBe('Bản sao chỉnh riêng');
  });

  it('tự đánh số khi tên bản sao đã tồn tại', () => {
    const sourceNode = buildSourceNode();
    const pasted = createPastedCampaignNode({
      snapshot: createCampaignNodeSnapshot(sourceNode),
      nodes: [
        sourceNode,
        { data: { label: 'Lấy dữ liệu Excel (Bản sao)' } },
        { data: { label: 'Lấy dữ liệu Excel (Bản sao) 2' } },
      ],
      pasteSequence: 3,
      copyLabel: 'Lấy dữ liệu Excel (Bản sao)',
      idFactory: () => 'read_sheet-copy-3',
    });

    expect(pasted.data.label).toBe('Lấy dữ liệu Excel (Bản sao) 3');
  });

  it('không chiếm phím tắt khi người dùng đang nhập nội dung', () => {
    const input = document.createElement('input');
    const richText = document.createElement('div');
    richText.setAttribute('contenteditable', 'true');
    const child = document.createElement('span');
    richText.appendChild(child);

    expect(isEditableClipboardTarget(input)).toBe(true);
    expect(isEditableClipboardTarget(child)).toBe(true);
    expect(isEditableClipboardTarget(document.body)).toBe(false);
  });
});
