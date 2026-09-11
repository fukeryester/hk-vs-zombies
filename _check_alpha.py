"""Diagnose sprite alpha halo issue: check if 'transparent' background pixels
truly have alpha=0 or have low but nonzero alpha (causing rectangular tint bleed).
"""
from pathlib import Path
import numpy as np
from PIL import Image

ANIM = Path(r"e:\Project\WebGame\HKVSZombie\src\img\anim")

for path in sorted(ANIM.glob("*.png")):
    img = np.array(Image.open(path).convert("RGBA"))
    alpha = img[:, :, 3]
    total = alpha.size
    zero = int((alpha == 0).sum())
    low = int(((alpha > 0) & (alpha < 20)).sum())
    mid = int(((alpha >= 20) & (alpha < 200)).sum())
    high = int((alpha >= 200).sum())
    print(f"{path.name:34s} zero={zero/total*100:5.1f}%  low(1-19)={low/total*100:5.2f}%  mid(20-199)={mid/total*100:5.1f}%  high(>=200)={high/total*100:5.1f}%")
