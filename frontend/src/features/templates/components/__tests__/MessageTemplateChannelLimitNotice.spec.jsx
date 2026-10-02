import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '../../../../i18n';
import MessageTemplateChannelLimitNotice from '../MessageTemplateChannelLimitNotice';

const images = (count) => Array.from({ length: count }, (_, index) => ({ name: `anh${index}.jpg`, size: 100 }));
const renderNotice = (attachments) => render(
  <I18nProvider>
    <MessageTemplateChannelLimitNotice attachments={attachments} />
  </I18nProvider>
);

describe('MessageTemplateChannelLimitNotice', () => {
  it('mẫu 6 ảnh: hiện dòng nhắc kèm đúng con số trần', () => {
    renderNotice(images(6));
    const warning = screen.getByTestId('channel-limit-warning');
    expect(warning).toHaveTextContent('Telegram/WhatsApp chỉ gửi được tối đa 5 ảnh, 3 tài liệu, tổng 20 MB mỗi tin');
    expect(warning).toHaveTextContent('tệp vượt sẽ bị chặn khi gửi');
    expect(warning).toHaveTextContent('Mẫu vẫn dùng bình thường cho Zalo');
  });

  it('mẫu 1 ảnh: không hiện gì', () => {
    renderNotice(images(1));
    expect(screen.queryByTestId('channel-limit-warning')).toBeNull();
  });

  it('mẫu không có tệp: không hiện gì', () => {
    renderNotice([]);
    expect(screen.queryByTestId('channel-limit-warning')).toBeNull();
  });
});
