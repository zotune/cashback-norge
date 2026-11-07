"""Offline, one-session thumbnail cutouts. Never used for supermarket flyers."""
import io
import json
import os
import sys

os.environ.setdefault("OMP_NUM_THREADS", "1")
from PIL import Image
from rembg import new_session, remove


def main():
    rows = json.load(open(sys.argv[1], encoding="utf-8"))
    session = None
    done = 0
    for row in rows[:1000]:
        try:
            image = Image.open(row["input"]).convert("RGBA")
            # Keep existing transparency and editorial/non-white backgrounds.
            alpha = image.getchannel("A")
            if alpha.getextrema()[0] < 250:
                continue
            w, h = image.size
            edge = [image.getpixel((x, y)) for x, y in
                    [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] +
                    [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]]
            if sum(min(p[:3]) >= 235 for p in edge) / len(edge) < 0.9:
                continue
            if session is None:
                session = new_session("u2netp", providers=["CPUExecutionProvider"])
            result = remove(image, session=session)
            mask = result.getchannel("A")
            # Do not publish an empty silhouette or an effectively unchanged mask.
            histogram = mask.histogram()
            visible = sum(histogram[128:]) / (w * h)
            clear = sum(histogram[:16]) / (w * h)
            if not 0.015 <= visible <= 0.95 or clear < 0.05:
                continue
            result.save(row["output"], "WEBP", quality=80, method=4)
            done += 1
        except Exception as error:
            print(f"Background removal: {os.path.basename(row['input'])}: {error}", file=sys.stderr)
    print(json.dumps({"processed": len(rows), "cutouts": done}))


if __name__ == "__main__":
    main()
