"""Generate Shopify App Store assets for InvoiceGen."""
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets')
os.makedirs(OUT, exist_ok=True)

def make_icon():
    size = 1200
    img = Image.new('RGB', (size, size), '#1f3c88')
    draw = ImageDraw.Draw(img)

    margin = 220
    rect = [margin, margin + 40, size - margin, size - margin + 20]
    draw.rounded_rectangle(rect, radius=60, fill='white')

    lx1, lx2 = margin + 80, size - margin - 80
    rows = [
        (340, lx2 - lx1, '#1f3c88'),
        (430, int((lx2 - lx1) * 0.6), '#e0e6f8'),
        (490, int((lx2 - lx1) * 0.8), '#e0e6f8'),
        (550, int((lx2 - lx1) * 0.7), '#e0e6f8'),
        (700, lx2 - lx1, '#1f3c88'),
    ]
    for y, w, c in rows:
        draw.rounded_rectangle([lx1, y, lx1 + w, y + 28], radius=8, fill=c)

    fold = 80
    draw.polygon([
        size - margin - fold, margin + 40,
        size - margin, margin + 40 + fold,
        size - margin - fold, margin + 40 + fold,
    ], fill='#e0e6f8')

    img.save(os.path.join(OUT, 'icon-1200.png'))
    print('icon-1200.png saved')

def make_card():
    w, h = 592, 348
    img = Image.new('RGB', (w, h), '#1f3c88')
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([40, 40, w - 40, h - 40], radius=20, fill='white')
    draw.rounded_rectangle([70, 70, 300, 100], radius=6, fill='#1f3c88')
    for i, (lw, col) in enumerate([(320, '#e0e6f8'), (260, '#e0e6f8'), (300, '#e0e6f8'), (320, '#1f3c88')]):
        y = 130 + i * 36
        draw.rounded_rectangle([70, y, 70 + lw, y + 18], radius=5, fill=col)
    draw.rounded_rectangle([70, 260, 160, 295], radius=8, fill='#1f3c88')
    img.save(os.path.join(OUT, 'app-card-592x348.png'))
    print('app-card-592x348.png saved')

make_icon()
make_card()
print('Done:', os.path.abspath(OUT))
