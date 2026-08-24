#!/usr/bin/env python3
"""Ghép nhiều ảnh nằm cạnh nhau thành một ảnh so sánh, mỗi ảnh một nhãn.

Vì sao cần: có ô ảnh trong bài hướng dẫn đòi ĐẶT CẠNH NHAU hai màn hình của hai
tài khoản khác nhau — không tài khoản nào tự chụp ra được cả hai. Ghép ở đây là
đặt hai ảnh THẬT kề nhau, không sửa nội dung bên trong ảnh nào.

Nhãn là chữ do công cụ này thêm vào, KHÔNG có trong sản phẩm — nó chỉ nói cho
người đọc biết bên nào là bên nào. Đừng dùng nhãn để mô tả thứ ảnh không có.

  python3 compose.py ra.png a.png "Chủ tài khoản" b.png "Nhân viên"
  python3 compose.py ra.png a.png "A" b.png "B" --gap 60 --box 2:0,300,260,52

`--box <chỉ số ảnh>:x,y,w,h` khoanh đỏ một vùng, toạ độ tính theo ảnh gốc thứ
mấy (đếm từ 1), không phải theo ảnh đã ghép — đỡ phải tự cộng trừ phần dịch.
"""
import argparse
import sys

from PIL import Image, ImageDraw, ImageFont

HIGHLIGHT_COLOR = "#e11d48"
LABEL_COLOR = "#0f172a"
BACKGROUND = "#ffffff"

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/Library/Fonts/Arial Unicode.ttf",
]


def load_font(size):
    """Font có dấu tiếng Việt. Font mặc định của PIL không vẽ được dấu."""
    for candidate in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    print("  ! không tìm thấy font hệ thống — nhãn có thể mất dấu tiếng Việt",
          file=sys.stderr)
    return ImageFont.load_default()


def parse_box(text):
    """'<chỉ số>:x,y,w,h' -> (index, x, y, w, h)."""
    try:
        index_part, rect_part = text.split(":", 1)
        index = int(index_part)
        x, y, w, h = (int(round(float(v))) for v in rect_part.split(","))
    except ValueError:
        raise argparse.ArgumentTypeError(f"'{text}' phải có dạng <chỉ số>:x,y,w,h")
    if index < 1:
        raise argparse.ArgumentTypeError("chỉ số ảnh đếm từ 1")
    return index, x, y, w, h


def main():
    parser = argparse.ArgumentParser(add_help=True)
    parser.add_argument("dest")
    parser.add_argument("parts", nargs="+", metavar="ẢNH NHÃN",
                        help="lần lượt từng cặp: đường dẫn ảnh rồi tới nhãn")
    parser.add_argument("--gap", type=int, default=48, help="khoảng cách giữa hai ảnh")
    parser.add_argument("--pad", type=int, default=32, help="lề quanh ảnh ghép")
    parser.add_argument("--box", type=parse_box, action="append", default=[])
    parser.add_argument("--label-size", type=int, default=0,
                        help="cỡ chữ nhãn (mặc định suy theo chiều cao ảnh)")
    args = parser.parse_args()

    if len(args.parts) % 2 != 0:
        parser.error("mỗi ảnh phải kèm đúng một nhãn")

    pairs = [(args.parts[i], args.parts[i + 1]) for i in range(0, len(args.parts), 2)]
    images = [Image.open(p).convert("RGB") for p, _ in pairs]

    # Nét vẽ và cỡ chữ suy theo ảnh cao nhất, để ảnh chụp ở deviceScaleFactor 2
    # và ảnh chụp tay ở tỉ lệ khác vẫn nhìn cùng độ đậm.
    scale = max(im.height for im in images) / 800
    # Suy theo CHIỀU RỘNG ảnh: nhãn phải cân với cỡ chữ bên trong ảnh chụp, mà
    # cỡ chữ đó tỉ lệ với bề rộng (deviceScaleFactor), không phải với chiều cao —
    # cắt ngắn ảnh không làm chữ trong ảnh nhỏ đi.
    font_size = args.label_size or max(20, round(images[0].width / 15))
    font = load_font(font_size)
    label_h = font_size + round(18 * scale)
    stroke = max(3, round(3 * scale))

    total_w = sum(im.width for im in images) + args.gap * (len(images) - 1) + args.pad * 2
    total_h = max(im.height for im in images) + label_h + args.pad * 2

    canvas = Image.new("RGB", (total_w, total_h), BACKGROUND)
    draw = ImageDraw.Draw(canvas)

    offsets = []
    x = args.pad
    for image, (_, label) in zip(images, pairs):
        draw.text((x, args.pad), label, fill=LABEL_COLOR, font=font)
        top = args.pad + label_h
        canvas.paste(image, (x, top))
        offsets.append((x, top))
        x += image.width + args.gap

    for index, bx, by, bw, bh in args.box:
        if index > len(images):
            print(f"  ! khung trỏ tới ảnh {index} nhưng chỉ có {len(images)} ảnh", file=sys.stderr)
            continue
        ox, oy = offsets[index - 1]
        draw.rounded_rectangle(
            [ox + bx, oy + by, ox + bx + bw, oy + by + bh],
            radius=stroke * 2, outline=HIGHLIGHT_COLOR, width=stroke,
        )

    canvas.save(args.dest)
    print(f"{args.dest}: {canvas.width}x{canvas.height} px · {len(images)} ảnh · {len(args.box)} khung")
    return 0


if __name__ == "__main__":
    sys.exit(main())
