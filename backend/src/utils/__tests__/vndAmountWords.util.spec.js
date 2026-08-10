import { vndAmountToVietnameseWords } from '../vndAmountWords.util.js';

describe('vndAmountToVietnameseWords', () => {
  it('zero', () => {
    expect(vndAmountToVietnameseWords(0)).toBe('Không đồng');
  });

  it('548900', () => {
    const s = vndAmountToVietnameseWords(548900);
    expect(s.toLowerCase()).toContain('năm trăm');
    expect(s.toLowerCase()).toContain('đồng');
  });

  it('110000', () => {
    const s = vndAmountToVietnameseWords(110000);
    expect(s.toLowerCase()).toContain('một trăm mười nghìn');
  });
});
