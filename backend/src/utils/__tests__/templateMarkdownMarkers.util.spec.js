import { convertMarkdownMarkersKeepingVariables } from '../templateMarkdownMarkers.util.js';

describe('convertMarkdownMarkersKeepingVariables', () => {
  it('hai biến có gạch dưới trong cùng một đoạn KHÔNG bị _..._ nuốt thành <em>', () => {
    const html = '<p>Kính gửi {{ten_khach}}, email {{email_khach}}, sđt {{so_dien_thoai}}</p>';
    expect(convertMarkdownMarkersKeepingVariables(html)).toBe(html);
  });

  it('vẫn đổi đậm/nghiêng ngoài biến', () => {
    expect(convertMarkdownMarkersKeepingVariables('**Chào** _bạn_ {{ten_khach}} và *anh*'))
      .toBe('<strong>Chào</strong> <em>bạn</em> {{ten_khach}} và <em>anh</em>');
  });

  it('nghiêng bao quanh biến vẫn hoạt động, biến còn nguyên', () => {
    expect(convertMarkdownMarkersKeepingVariables('_xin chào {{ten_khach}} nhé_'))
      .toBe('<em>xin chào {{ten_khach}} nhé</em>');
  });

  it('chuỗi rỗng / null', () => {
    expect(convertMarkdownMarkersKeepingVariables(null)).toBe('');
  });
});
