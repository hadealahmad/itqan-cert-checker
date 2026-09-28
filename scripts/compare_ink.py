#!/usr/bin/env python3
"""
Compare ink bands between the Figma reference render and our Chromium render.

Figma's TEXT node bounding box is derived from font ascent/descent, while the
line box uses lineHeightPx. Which one `absoluteBoundingBox.y` refers to is not
documented, so measure the actual ink instead of trusting either number.

Usage: python3 compare_ink.py <reference.png> <render.png>
"""
import sys
import numpy as np
from PIL import Image

# x ranges we care about, to isolate one element at a time
REGIONS = {
    "witness":   (560, 1360),
    "recipient": (560, 1360),
    "body":      (380, 1540),
    "signer":    (700, 1220),
    "role":      (700, 1220),
    "certnum":   (90,  620),
    "gregdate":  (1380, 1830),
    "hijri":     (1380, 1830),
}


def bands(path, xr, threshold=200):
    """Return [(y0, y1)] row ranges containing dark pixels within x range xr."""
    img = Image.open(path).convert("L")
    a = np.asarray(img)[:, xr[0]:xr[1]]
    dark = (a < threshold).sum(axis=1)
    rows = dark > 2
    out, start = [], None
    for i, on in enumerate(rows):
        if on and start is None:
            start = i
        elif not on and start is not None:
            if i - start >= 3:
                out.append((start, i - 1))
            start = None
    if start is not None:
        out.append((start, len(rows) - 1))
    return out


def main():
    ref, ren = sys.argv[1], sys.argv[2]
    print(f"{'region':<10} {'reference bands':<34} {'render bands':<34} {'Δ first':>8}")
    print("-" * 92)
    for name, xr in REGIONS.items():
        rb = bands(ref, xr)
        nb = bands(ren, xr)
        delta = ""
        if rb and nb:
            delta = f"{nb[0][0] - rb[0][0]:+d}"
        fmt = lambda bs: ",".join(f"{a}-{b}" for a, b in bs) or "-"
        print(f"{name:<10} {fmt(rb):<34} {fmt(nb):<34} {delta:>8}")


if __name__ == "__main__":
    main()
