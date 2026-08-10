import { describe, expect, it } from '@jest/globals';

// Mirror token helper behavior used by searchPublishedChunksByKeyword
function keywordTokens(question = '') {
  return String(question || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 8);
}

describe('help keyword tokens', () => {
  it('extracts meaningful tokens', () => {
    const tokens = keywordTokens('Làm sao kết nối Zalo OA?');
    expect(tokens).toEqual(expect.arrayContaining(['lam', 'sao', 'ket', 'noi', 'zalo']));
  });

  it('drops short noise', () => {
    expect(keywordTokens('ok')).toEqual([]);
  });
});
