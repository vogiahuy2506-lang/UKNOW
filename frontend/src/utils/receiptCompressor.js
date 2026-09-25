/**
 * Nén ảnh chuyển khoản phía trình duyệt trước khi gửi (PR-5):
 * - Canvas scale cạnh dài tối đa 1600px
 * - Xuất JPEG chất lượng ~0.8
 * - Báo lỗi nếu trình duyệt không đọc được (như HEIC) để hướng dẫn chụp màn hình
 *
 * @param {File} file
 * @returns {Promise<{ blob: Blob, previewUrl: string }>}
 */
export async function compressReceiptImage(file) {
  if (!file) {
    throw new Error('EMPTY_FILE');
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('FILE_READ_ERROR'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('HEIC_OR_UNSUPPORTED'));
    image.src = dataUrl;
  });

  let width = img.width || 0;
  let height = img.height || 0;
  if (!width || !height) {
    throw new Error('HEIC_OR_UNSUPPORTED');
  }

  const MAX_DIM = 1600;
  if (width > MAX_DIM || height > MAX_DIM) {
    if (width > height) {
      height = Math.round((height * MAX_DIM) / width);
      width = MAX_DIM;
    } else {
      width = Math.round((width * MAX_DIM) / height);
      height = MAX_DIM;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('CANVAS_UNSUPPORTED');
  }

  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result);
        else reject(new Error('CANVAS_BLOB_ERROR'));
      },
      'image/jpeg',
      0.8
    );
  });

  const previewUrl = URL.createObjectURL(blob);
  return { blob, previewUrl };
}
