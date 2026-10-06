import sys, glob
from PIL import Image, ImageDraw
files = sorted(glob.glob(sys.argv[1] + "/still-*.png"), key=lambda p: float(p.split("still-")[1][:-4]))
cols = 4; w, h = 360, 640
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * w, rows * h), "white")
for i, f in enumerate(files):
    im = Image.open(f).convert("RGB").resize((w, h))
    d = ImageDraw.Draw(im); d.rectangle((0, 0, 70, 22), fill="black"); d.text((4, 4), f.split("still-")[1][:-4], fill="white")
    sheet.paste(im, ((i % cols) * w, (i // cols) * h))
sheet.save(sys.argv[2])
