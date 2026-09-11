"""
Process AI-generated sprite sheets:
  1. Chroma-key green (#00ff00) or magenta (#ff00ff) → transparent
  2. Find content bounding box, crop tight
  3. Split into N equal-width frames
  4. Re-pack as horizontal strip with tight per-frame bounding boxes
  5. Save to src/img/anim/
"""
import os, sys
from PIL import Image
import numpy as np

ASSETS = r"C:\Users\lefengliang\.cursor\projects\e-Project-WebGame-HKVSZombie\assets"
OUT    = r"e:\Project\WebGame\HKVSZombie\src\img\anim"

SHEETS = [
    # (source_filename, output_key, num_frames, chroma)
    # HK
    ("hk_melee_cheap_walk.png",   "hk_melee_cheap_walk",  6, "green"),
    ("hk_melee_tank_walk.png",    "hk_melee_tank_walk",   6, "green"),
    ("hk_melee_fast_walk.png",    "hk_melee_fast_walk",   6, "green"),
    ("hk_ranged_light_walk.png",  "hk_ranged_light_walk", 6, "green"),
    ("hk_ranged_aoe_walk.png",    "hk_ranged_aoe_walk",   6, "green"),
    ("hk_ranged_heavy_walk.png",  "hk_ranged_heavy_walk", 6, "green"),
    ("hk_support_walk.png",       "hk_support_walk",      6, "green"),
    # Zombies
    ("zom_normal_walk.png",  "zom_normal_walk",  6, "green"),
    ("zom_hopper_walk.png",  "zom_hopper_walk",  6, "magenta"),
    ("zom_banshee_walk.png", "zom_banshee_walk", 6, "magenta"),
    ("zom_giant_walk.png",   "zom_giant_walk",   6, "magenta"),
    ("zom_cata_walk.png",    "zom_cata_walk",    6, "magenta"),
    ("zom_toxic_walk.png",   "zom_toxic_walk",   6, "magenta"),
    ("zom_ghost_walk.png",   "zom_ghost_walk",   6, "magenta"),
]

def chroma_key(img, mode="green", threshold=80):
    """Replace chroma key background with transparency."""
    arr = np.array(img.convert("RGBA")).copy()
    r, g, b, a = arr[:,:,0], arr[:,:,1], arr[:,:,2], arr[:,:,3]
    if mode == "green":
        # #00ff00 with tolerance
        mask = (g.astype(int) - np.maximum(r, b).astype(int)) > threshold
    else:  # magenta
        # #ff00ff with tolerance
        mask = (((r.astype(int) + b.astype(int)) / 2 - g.astype(int)) > threshold)
    arr[mask] = [0, 0, 0, 0]
    return Image.fromarray(arr)

def find_content_bbox(img):
    """Find bounding box of non-transparent pixels."""
    arr = np.array(img)
    alpha = arr[:,:,3]
    rows = np.any(alpha > 10, axis=1)
    cols = np.any(alpha > 10, axis=0)
    if not rows.any() or not cols.any():
        return (0, 0, img.width, img.height)
    rmin, rmax = np.where(rows)[0][[0,-1]]
    cmin, cmax = np.where(cols)[0][[0,-1]]
    return (cmin, rmin, cmax + 1, rmax + 1)

def halo_eat(arr, passes=2):
    """Remove semi-transparent halo pixels near transparent edges."""
    from scipy import ndimage
    alpha = arr[:,:,3].copy()
    transparent = alpha < 10
    for _ in range(passes):
        dilated = ndimage.binary_dilation(transparent, iterations=1)
        fringe = dilated & ~transparent
        r, g, b = arr[:,:,0], arr[:,:,1], arr[:,:,2]
        bright = fringe & (r.astype(int) + g.astype(int) + b.astype(int) > 580)
        arr[bright] = [0, 0, 0, 0]
        transparent = arr[:,:,3] < 10
    return arr

def process_sheet(src_path, out_key, num_frames, chroma):
    """Process one sprite sheet."""
    img = Image.open(src_path).convert("RGBA")
    print(f"  {out_key}: {img.size} → ", end="")

    # 1. Chroma key
    img = chroma_key(img, chroma)

    # 2. Try halo eating (skip if no scipy)
    try:
        arr = np.array(img)
        arr = halo_eat(arr)
        img = Image.fromarray(arr)
    except ImportError:
        pass

    # 3. Split into N equal raw frames
    frame_w = img.width // num_frames
    raw_frames = []
    for i in range(num_frames):
        f = img.crop((i * frame_w, 0, (i + 1) * frame_w, img.height))
        raw_frames.append(f)

    # 4. Find tight content bbox across ALL frames for consistent sizing
    global_top = img.height
    global_bottom = 0
    global_max_w = 0
    frame_bboxes = []
    for f in raw_frames:
        bbox = find_content_bbox(f)
        frame_bboxes.append(bbox)
        if bbox[1] < global_top: global_top = bbox[1]
        if bbox[3] > global_bottom: global_bottom = bbox[3]
        fw = bbox[2] - bbox[0]
        if fw > global_max_w: global_max_w = fw

    # Add small padding
    pad = 2
    global_top = max(0, global_top - pad)
    global_bottom = min(img.height, global_bottom + pad)
    global_max_w = min(frame_w, global_max_w + pad * 2)

    content_h = global_bottom - global_top
    out_fw = global_max_w

    # 5. Re-pack frames centered horizontally within uniform frame width
    strip = Image.new("RGBA", (out_fw * num_frames, content_h), (0, 0, 0, 0))
    for i, f in enumerate(raw_frames):
        bbox = frame_bboxes[i]
        cropped = f.crop((bbox[0], global_top, bbox[2], global_bottom))
        # Center horizontally
        cw = cropped.width
        offset_x = (out_fw - cw) // 2
        strip.paste(cropped, (i * out_fw + offset_x, 0), cropped)

    # 6. Zero RGB where alpha=0 (halo prevention)
    sarr = np.array(strip)
    mask = sarr[:,:,3] == 0
    sarr[mask, :3] = 0
    strip = Image.fromarray(sarr)

    # 7. Save
    out_path = os.path.join(OUT, out_key + ".png")
    strip.save(out_path, optimize=True)
    sz = os.path.getsize(out_path)
    print(f"{strip.size}, {num_frames}f × {out_fw}×{content_h}, {sz//1024}KB")

def main():
    os.makedirs(OUT, exist_ok=True)
    for src_name, out_key, nf, chroma in SHEETS:
        src_path = os.path.join(ASSETS, src_name)
        if not os.path.exists(src_path):
            print(f"  SKIP {out_key}: {src_path} not found")
            continue
        process_sheet(src_path, out_key, nf, chroma)
    print("\nDone!")

if __name__ == "__main__":
    main()
