#!/usr/bin/env python3
"""Khoanh đỏ lên ảnh chụp tay, cho khớp với ảnh do bộ chụp tự động sinh ra.

Vì sao cần: một số ô trong bài hướng dẫn không tự động hoá được (ảnh Google
Sheet, mã QR PayOS, ảnh ghép hai màn hình). Những ảnh đó chụp tay, nhưng vẫn
phải có khung khoanh đỏ cùng màu, cùng độ dày với phần còn lại — nếu không,
bài viết nhìn chắp vá.

Màu và bo góc lấy đúng theo `HIGHLIGHT_COLOR` trong lib/shotHelpers.js.

  python3 annotate.py vao.png ra.png --box 120,300,480,64
  python3 annotate.py vao.png ra.png --box 10,20,100,40 --box 10,90,100,40
  python3 annotate.py vao.png ra.png --crop 0,0,1440,600 --box 100,80,220,48

Toạ độ tính bằng PIXEL CỦA ẢNH GỐC, gốc toạ độ ở góc trên bên trái. Chạy không
kèm tuỳ chọn nào thì chỉ in kích thước ảnh — tiện để ước lượng trước khi vẽ.

Thứ tự xử lý: cắt (--crop) TRƯỚC, rồi mới vẽ khung. Nên toạ độ --box tính theo
ảnh ĐÃ CẮT. Làm ngược lại thì mỗi lần đổi vùng cắt phải tính lại mọi khung.
"""
import argparse
import sys

from PIL import Image, ImageDraw

HIGHLIGHT_COLOR = "#e11d48"


def parse_rect(text):
    """'x,y,w,h' -> (x, y, w, h)."""
    try:
        parts = [int(round(float(p))) for p in text.split(",")]
    except ValueError:
        raise argparse.ArgumentTypeError(f"'{text}' không phải dạng x,y,w,h")
    if len(parts) != 4:
        raise argparse.ArgumentTypeError(f"'{text}' cần đúng 4 số: x,y,w,h")
    if parts[2] <= 0 or parts[3] <= 0:
        raise argparse.ArgumentTypeError(f"'{text}' có chiều rộng/cao <= 0")
    return tuple(parts)


def main():
    parser = argparse.ArgumentParser(add_help=True)
    parser.add_argument("source")
    parser.add_argument("dest", nargs="?")
    parser.add_argument("--box", type=parse_rect, action="append", default=[],
                        help="khung chữ nhật bo góc, x,y,w,h — lặp lại được")
    parser.add_argument("--crop", type=parse_rect,
                        help="cắt ảnh trước khi vẽ, x,y,w,h")
    parser.add_argument("--width", type=int, default=0,
                        help="độ dày nét (mặc định: tự tính theo bề rộng ảnh)")
    parser.add_argument("--radius", type=int, default=0,
                        help="bo góc (mặc định: tự tính theo độ dày nét)")
    args = parser.parse_args()

    image = Image.open(args.source).convert("RGB")
    if args.crop:
        x, y, w, h = args.crop
        image = image.crop((x, y, x + w, y + h))

    if not args.box:
        print(f"{args.source}: {image.width}x{image.height} px"
              + (" (sau khi cắt)" if args.crop else ""))
        if not args.dest:
            return 0

    # Ảnh chụp tự động dùng deviceScaleFactor 2, nét vẽ 3px trên toạ độ CSS —
    # tức 6px thật. Ảnh chụp tay có thể ở tỉ lệ khác, nên suy nét theo bề rộng
    # để nhìn cùng độ đậm khi hai loại ảnh nằm cạnh nhau trong bài.
    stroke = args.width or max(3, round(image.width / 480))
    radius = args.radius or stroke * 2

    draw = ImageDraw.Draw(image)
    for x, y, w, h in args.box:
        if x < 0 or y < 0 or x + w > image.width or y + h > image.height:
            print(f"  ! khung {x},{y},{w},{h} vượt ra ngoài ảnh "
                  f"{image.width}x{image.height} — vẫn vẽ, nhưng kiểm lại toạ độ",
                  file=sys.stderr)
        draw.rounded_rectangle(
            [x, y, x + w, y + h],
            radius=radius, outline=HIGHLIGHT_COLOR, width=stroke,
        )

    if not args.dest:
        print("Thiếu đường dẫn ảnh ra — không ghi gì.", file=sys.stderr)
        return 1

    image.save(args.dest)
    print(f"{args.dest}: {image.width}x{image.height} px · {len(args.box)} khung · nét {stroke}px")
    return 0


if __name__ == "__main__":
    sys.exit(main())
