/**
 * Bất biến được khoá ở đây: TỆP ĐÍNH KÈM KHÔNG BAO GIỜ ĐƯỢC VÔ HÌNH.
 *
 * Thẻ wizard và khung soạn tin cùng đọc một state `uploadedFiles`, nên phải có đúng
 * một nơi hiển thị chip tại mỗi thời điểm. Thẻ tự tính rồi báo lên cha qua
 * `onShowingFilesChange`; cha ẩn chip của khung soạn tin khi nhận `true`.
 *
 * Đúng sáu dòng logic đó đã hỏng hai lần trong hai lượt review ngày 24/08/2026:
 *
 *   Lần 1 — thẻ hiện chip nhưng khung soạn tin không ẩn → file hiện HAI lần.
 *   Lần 2 — cha ẩn chip chỉ vì "có thẻ ask_campaign_details", không cần biết thẻ có
 *           thật sự hiện chip không → người dùng đính kèm lúc chưa chọn option thì
 *           file BIẾN MẤT khỏi cả hai nơi, mà vẫn được gửi đi. Nặng hơn lần 1.
 *
 * Điều kiện phụ thuộc ba thứ rời nhau (`isActive`, option đang chọn, `uploadedFiles`)
 * nên đọc code thấy đúng là chưa đủ — lần 2 cũng đọc thấy đúng.
 *
 * Nếu phải sửa lại cách hiển thị, giữ nguyên các assert dưới đây: chúng mô tả hành vi
 * người dùng cần, không phải cách cài đặt.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AskCampaignDetailsCard } from '../AiChatbotCards';

/** t() trả về key để test không phụ thuộc bản dịch. */
const t = (key) => key;

const FILE = { tempId: 'tmp-1', originalName: 'Bao_cao_Task_16.pdf', contentType: 'application/pdf' };

/** Câu hỏi "Chiến dịch này nói về gì?" — đúng hình dạng buildCampaignBriefQuestion trả về. */
const briefData = {
  questions: [{
    id: 'campaignBrief',
    label: 'Chiến dịch này nói về gì?',
    wizardGate: 'campaignBrief',
    inputType: 'campaign_brief',
    options: [
      { value: 'single_product', label: '1 sản phẩm / dịch vụ' },
      { value: 'attached_file', label: 'Dùng dữ liệu từ file đính kèm' },
      { value: 'custom_topic', label: 'Nội dung khác (cảm ơn, thông báo, …)' },
    ],
    courseOptions: [],
  }],
};

/** Câu hỏi "Danh sách người nhận lấy từ đâu?" — đúng hình dạng buildDataSourceQuestion. */
const dataSourceData = {
  questions: [{
    id: 'dataSource',
    label: 'Danh sách người nhận lấy từ đâu?',
    wizardGate: 'dataSource',
    options: [
      { value: 'db', label: 'Danh sách khách hàng' },
      { value: 'sheet', label: 'File Excel / Google Sheet' },
    ],
  }],
};

/** Giá trị cuối cùng cha nhận được — cha chỉ quan tâm cái này. */
const lastReported = (spy) => (spy.mock.calls.length ? spy.mock.calls.at(-1)[0] : undefined);

const renderCard = (props = {}) => {
  const onShowingFilesChange = vi.fn();
  const utils = render(
    <AskCampaignDetailsCard
      data={briefData}
      onSubmit={vi.fn()}
      onAttachClick={vi.fn()}
      onRemoveFile={vi.fn()}
      onShowingFilesChange={onShowingFilesChange}
      uploadedFiles={[]}
      t={t}
      {...props}
    />
  );
  return { onShowingFilesChange, ...utils };
};

describe('AskCampaignDetailsCard — báo lên cha khi nào thẻ đang hiện chip file', () => {
  beforeEach(() => vi.clearAllMocks());

  it('CHƯA chọn option mà đã có tệp → báo false để khung soạn tin còn hiện chip', () => {
    // Đây chính là ca "tàng hình" của lần sửa thứ 2. Thẻ không vẽ chip, nên nếu nó
    // báo true thì file biến mất khỏi cả hai nơi.
    const { onShowingFilesChange } = renderCard({ uploadedFiles: [FILE] });
    expect(lastReported(onShowingFilesChange)).toBe(false);
  });

  it('chọn "Dùng dữ liệu từ file đính kèm" + có tệp → báo true', () => {
    const { onShowingFilesChange } = renderCard({ uploadedFiles: [FILE] });
    fireEvent.click(screen.getByText('Dùng dữ liệu từ file đính kèm'));
    expect(lastReported(onShowingFilesChange)).toBe(true);
  });

  it('chọn option cần file nhưng CHƯA đính kèm → vẫn báo false', () => {
    // Không có tệp thì thẻ chẳng vẽ chip nào; báo true là nói dối cha.
    const { onShowingFilesChange } = renderCard({ uploadedFiles: [] });
    fireEvent.click(screen.getByText('Dùng dữ liệu từ file đính kèm'));
    expect(lastReported(onShowingFilesChange)).toBe(false);
  });

  it('đổi từ "file đính kèm" sang option khác → quay lại false, file không bị nuốt', () => {
    const { onShowingFilesChange } = renderCard({ uploadedFiles: [FILE] });
    fireEvent.click(screen.getByText('Dùng dữ liệu từ file đính kèm'));
    expect(lastReported(onShowingFilesChange)).toBe(true);

    fireEvent.click(screen.getByText('1 sản phẩm / dịch vụ'));
    expect(lastReported(onShowingFilesChange)).toBe(false);
  });

  it('chọn nguồn người nhận "File Excel / Google Sheet" + có tệp → báo true', () => {
    const { onShowingFilesChange } = renderCard({ data: dataSourceData, uploadedFiles: [FILE] });
    fireEvent.click(screen.getByText('File Excel / Google Sheet'));
    expect(lastReported(onShowingFilesChange)).toBe(true);
  });

  it('thẻ cũ (isActive=false) KHÔNG được báo true, dù option đang là file đính kèm', () => {
    // Lịch sử chat giữ lại mọi thẻ cũ. Cha chỉ có MỘT biến trạng thái, nên thẻ đã tắt
    // mà còn báo true là ẩn nhầm chip của lượt đang làm.
    const { onShowingFilesChange } = renderCard({ uploadedFiles: [FILE], isActive: false });
    expect(onShowingFilesChange.mock.calls.every(([value]) => value === false)).toBe(true);
  });

  it('chọn "file đính kèm" mà chưa có tệp → nút Tiếp tục bị TẮT và nói rõ lý do', () => {
    // Cho bấm rồi mới nhắc là dở: người dùng phải đi một vòng mới biết mình thiếu gì.
    renderCard({ uploadedFiles: [] });
    fireEvent.click(screen.getByText('Dùng dữ liệu từ file đính kèm'));

    const submit = screen.getByRole('button', { name: /attachFileRequired/i });
    expect(submit).toBeDisabled();
  });

  it('có tệp rồi thì nút Tiếp tục mở lại', () => {
    const { rerender } = renderCard({ uploadedFiles: [] });
    fireEvent.click(screen.getByText('Dùng dữ liệu từ file đính kèm'));
    expect(screen.getByRole('button', { name: /attachFileRequired/i })).toBeDisabled();

    rerender(
      <AskCampaignDetailsCard
        data={briefData}
        onSubmit={vi.fn()}
        onAttachClick={vi.fn()}
        onRemoveFile={vi.fn()}
        onShowingFilesChange={vi.fn()}
        uploadedFiles={[FILE]}
        t={t}
      />
    );
    expect(screen.queryByRole('button', { name: /attachFileRequired/i })).toBeNull();
  });

  it('nguồn "File Excel / Google Sheet" chưa có tệp thì KHÔNG bị chặn', () => {
    // Option này có hai đường hợp lệ: tải tệp HOẶC dán link Google Sheet vào khung chat.
    // Tắt nút ở đây là chặn nhầm người đã có sẵn link.
    renderCard({ data: dataSourceData, uploadedFiles: [] });
    fireEvent.click(screen.getByText('File Excel / Google Sheet'));

    expect(screen.queryByRole('button', { name: /attachFileRequired/i })).toBeNull();
  });

  it('thẻ bị gỡ khỏi màn hình → trả cha về false', () => {
    const { onShowingFilesChange, unmount } = renderCard({ uploadedFiles: [FILE] });
    fireEvent.click(screen.getByText('Dùng dữ liệu từ file đính kèm'));
    expect(lastReported(onShowingFilesChange)).toBe(true);

    unmount();
    expect(lastReported(onShowingFilesChange)).toBe(false);
  });
});
