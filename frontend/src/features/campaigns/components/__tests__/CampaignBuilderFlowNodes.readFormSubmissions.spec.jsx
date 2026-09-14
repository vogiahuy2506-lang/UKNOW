import { describe, it, expect } from 'vitest';
import { getNodeConfigs, nodeConfigs, getAllNodeConfigs } from '../CampaignBuilderFlowNodes';

describe('CampaignBuilderFlowNodes - node read_form_submissions đã đăng ký (PR-6b)', () => {
  it('getNodeConfigs(t).data (bảng chọn node) có read_form_submissions', () => {
    const t = (key) => key;
    const { data } = getNodeConfigs(t);
    const entry = data.find((n) => n.type === 'read_form_submissions');
    expect(entry).toBeDefined();
    expect(entry.name).toBe('campaignNodes.readFormSubmissions');
  });

  it('nodeConfigs.data (registry tĩnh icon/màu) có read_form_submissions', () => {
    const entry = nodeConfigs.data.find((n) => n.type === 'read_form_submissions');
    expect(entry).toBeDefined();
    expect(entry.icon).toBeDefined();
  });

  it('getAllNodeConfigs() bao gồm read_form_submissions', () => {
    const all = getAllNodeConfigs();
    expect(all.some((n) => n.type === 'read_form_submissions')).toBe(true);
  });
});
