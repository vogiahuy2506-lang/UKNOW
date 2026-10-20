import { describe, expect, it } from '@jest/globals';
import {
  collectBlockAttachments,
  collectSellerBlockFiles,
  keepOwnedBlockAttachments,
  keepOwnedBlockAttachmentsInFlowJson,
  keepOwnedBlockAttachmentsInNodes,
  mapBlockAttachmentLists,
  remapBlockAttachments,
  remapBlockAttachmentsInFlowJson,
} from '../marketplaceBlockAttachments.util.js';

/**
 * Tệp đính kèm CẤP KHỐI của chiến dịch Marketplace (PLAN_GOM_MUC_NHE 3d): `config.attachments` (email), `zaloGroupAttachments` (Zalo nhóm),
 * `steps[].attachments` (Telegram / WhatsApp). Hàm thuần: chỉ giữ tệp của người bán lúc đăng, đổi sang tệp của người mua lúc mua.
 */
const SELLER = 7;
const OTHER = 8;
const att = (key, extra = {}) => ({ key, url: `https://old/${key}`, name: key.split('/').pop(), size: 10, ...extra });

describe('mapBlockAttachmentLists / collectBlockAttachments', () => {
  it('thấy đủ ba chỗ: attachments, zaloGroupAttachments, steps[].attachments', () => {
    const config = {
      attachments: [att(`uploads/${SELLER}/a.pdf`)],
      zaloGroupAttachments: [att(`uploads/${SELLER}/b.pdf`)],
      steps: [{ attachments: [att(`uploads/${SELLER}/c.pdf`)] }, { content: 'khong co tep' }, { attachments: [att(`uploads/${SELLER}/d.pdf`)] }],
    };
    expect(collectBlockAttachments(config).map((a) => a.key.split('/').pop())).toEqual(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf']);
  });

  it('không đổi gì → GIỮ NGUYÊN tham chiếu; config không phải object → trả nguyên', () => {
    const config = { attachments: [att(`uploads/${SELLER}/a.pdf`)], steps: [{ attachments: [] }] };
    expect(mapBlockAttachmentLists(config, (list) => list)).toBe(config);
    expect(mapBlockAttachmentLists(null, (list) => list)).toBeNull();
    expect(mapBlockAttachmentLists('x', (list) => list)).toBe('x');
    expect(collectBlockAttachments({ foo: 1 })).toEqual([]);
  });
});

describe('keepOwnedBlockAttachments (đăng bán)', () => {
  it('chỉ giữ tệp trong uploads/<người bán>/; khoá chủ khác, khoá gần giống (uploads/70/…), phần tử rác bị bỏ; không sửa object gốc', () => {
    const config = {
      attachments: [att(`uploads/${SELLER}/a.pdf`), att(`uploads/${OTHER}/cua-nguoi-khac.pdf`), att(`uploads/${SELLER}0/gan-giong.pdf`), null, 'rac'],
      zaloGroupAttachments: [att(`uploads/${OTHER}/x.pdf`)],
      steps: [{ content: 'hi', attachments: [att(`uploads/${SELLER}/c.pdf`), att(`uploads/${OTHER}/y.pdf`)] }],
    };
    const before = JSON.stringify(config);
    const kept = keepOwnedBlockAttachments(config, SELLER);
    expect(kept.attachments.map((a) => a.key)).toEqual([`uploads/${SELLER}/a.pdf`]);
    expect(kept.zaloGroupAttachments).toEqual([]);
    expect(kept.steps[0].attachments.map((a) => a.key)).toEqual([`uploads/${SELLER}/c.pdf`]);
    expect(kept.steps[0].content).toBe('hi');
    expect(JSON.stringify(config)).toBe(before);
  });

  it('chuẩn hoá khoá từ URL (tệp chỉ có url) và áp cho snapshot.nodes + flow_json', () => {
    const onlyUrl = { url: `https://api.example.com/file/${'x'}/uploads/${SELLER}/f.pdf`, name: 'f.pdf' };
    const kept = keepOwnedBlockAttachments({ attachments: [onlyUrl] }, SELLER);
    expect(kept.attachments[0].key).toBe(`uploads/${SELLER}/f.pdf`);

    const nodes = [
      { id: 1, nodeSubtype: 'send_email', config: { attachments: [att(`uploads/${OTHER}/z.pdf`)] } },
      { id: 2, nodeSubtype: 'manual_trigger', config: {} },
      { id: 3, nodeSubtype: 'send_email' },
    ];
    const out = keepOwnedBlockAttachmentsInNodes(nodes, SELLER);
    expect(out[0].config.attachments).toEqual([]);
    expect(out[1]).toBe(nodes[1]); // không đổi → giữ tham chiếu
    expect(out[2]).toBe(nodes[2]);

    const flow = { nodes: [{ id: 'n', data: { nodeType: 'send_email', config: { attachments: [att(`uploads/${OTHER}/z.pdf`), att(`uploads/${SELLER}/ok.pdf`)] } } }], edges: [] };
    const flowOut = keepOwnedBlockAttachmentsInFlowJson(flow, SELLER);
    expect(flowOut.nodes[0].data.config.attachments.map((a) => a.key)).toEqual([`uploads/${SELLER}/ok.pdf`]);
  });
});

describe('remapBlockAttachments (mua)', () => {
  const NEW = (name) => att(`uploads/9/111_${name}`, { url: `https://new/${name}` });

  it('đổi sang tệp của người mua theo bản đồ; tệp không có trong bản đồ (không thuộc người bán / không chép được) bị bỏ — không để lại khoá người bán', () => {
    const keyMap = new Map([[`uploads/${SELLER}/a.pdf`, NEW('a.pdf')], [`uploads/${SELLER}/c.pdf`, NEW('c.pdf')]]);
    const config = {
      attachments: [att(`uploads/${SELLER}/a.pdf`), att(`uploads/${OTHER}/b.pdf`)],
      steps: [{ attachments: [att(`uploads/${SELLER}/c.pdf`), att(`uploads/${SELLER}/khong-chep.pdf`)] }],
    };
    const out = remapBlockAttachments(config, SELLER, keyMap);
    expect(out.attachments.map((a) => a.key)).toEqual(['uploads/9/111_a.pdf']);
    expect(out.steps[0].attachments.map((a) => a.key)).toEqual(['uploads/9/111_c.pdf']);
    expect(JSON.stringify(out)).not.toContain(`uploads/${SELLER}/`);
    expect(JSON.stringify(out)).not.toContain(`uploads/${OTHER}/`);
  });

  it('bản đồ rỗng/thiếu → mọi tệp cấp khối bị bỏ (danh sách rỗng); khối không có tệp giữ nguyên tham chiếu; áp cho flow_json', () => {
    const config = { attachments: [att(`uploads/${SELLER}/a.pdf`)] };
    expect(remapBlockAttachments(config, SELLER, new Map()).attachments).toEqual([]);
    expect(remapBlockAttachments(config, SELLER, undefined).attachments).toEqual([]);
    const plain = { emailSubject: 'x' };
    expect(remapBlockAttachments(plain, SELLER, new Map())).toBe(plain);

    const flow = { nodes: [{ id: 'n', data: { nodeType: 'send_email', config } }], edges: [] };
    const out = remapBlockAttachmentsInFlowJson(flow, SELLER, new Map([[`uploads/${SELLER}/a.pdf`, NEW('a.pdf')]]));
    expect(out.nodes[0].data.config.attachments[0].key).toBe('uploads/9/111_a.pdf');
  });
});

describe('collectSellerBlockFiles (gom nguồn lúc mua)', () => {
  it('mỗi khoá của người bán MỘT lần dù nhiều khối / flowJson dùng chung; đếm tệp ngoài không gian người bán', () => {
    const shared = att(`uploads/${SELLER}/chung.pdf`);
    const snapshot = {
      nodes: [
        { id: 1, nodeSubtype: 'send_email', config: { attachments: [shared, att(`uploads/${OTHER}/la.pdf`)] } },
        { id: 2, nodeSubtype: 'send_telegram', config: { steps: [{ attachments: [shared, att(`uploads/${SELLER}/rieng.pdf`)] }] } },
        { id: 3, nodeSubtype: 'send_zalo_group', config: JSON.stringify({ zaloGroupAttachments: [att(`uploads/${SELLER}/nhom.pdf`)] }) },
      ],
      flowJson: { nodes: [{ id: 'n', data: { nodeType: 'send_email', config: { attachments: [shared] } } }], edges: [] },
    };
    const { files, skipped } = collectSellerBlockFiles(snapshot, SELLER);
    expect([...files.keys()].sort()).toEqual([`uploads/${SELLER}/chung.pdf`, `uploads/${SELLER}/nhom.pdf`, `uploads/${SELLER}/rieng.pdf`]);
    expect(skipped).toBe(1);
  });

  it('snapshot rỗng / thiếu → không có tệp', () => {
    expect(collectSellerBlockFiles({}, SELLER)).toEqual({ files: new Map(), skipped: 0 });
    expect(collectSellerBlockFiles(undefined, SELLER).files.size).toBe(0);
  });
});
