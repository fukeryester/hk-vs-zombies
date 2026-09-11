"""
Process AI-generated sprite sheets — v4 (valley split + largest-blob per frame):
  1. Chroma-key → transparent
  2. Find valleys between characters → split columns
  3. Per column: label connected components, keep only the largest blob
  4. Pack into clean horizontal strip
"""
import os
from PIL import Image
import numpy as np
from scipy import ndimage

ASSETS = r"C:\Users\lefengliang\.cursor\projects\e-Project-WebGame-HKVSZombie\assets"
OUT    = r"e:\Project\WebGame\HKVSZombie\src\img\anim"

SHEETS = [
    ("hk_melee_cheap_walk.png",   "hk_melee_cheap_walk",  6, "green"),
    ("hk_melee_tank_walk.png",    "hk_melee_tank_walk",   6, "green"),
    ("hk_melee_fast_walk.png",    "hk_melee_fast_walk",   6, "green"),
    ("hk_ranged_light_walk.png",  "hk_ranged_light_walk", 6, "green"),
    ("hk_ranged_aoe_walk.png",    "hk_ranged_aoe_walk",   6, "green"),
    ("hk_ranged_heavy_walk.png",  "hk_ranged_heavy_walk", 6, "green"),
    ("hk_support_walk.png",       "hk_support_walk",      6, "green"),
    ("zom_normal_walk.png",  "zom_normal_walk",  6, "green"),
    ("zom_hopper_walk.png",  "zom_hopper_walk",  6, "magenta"),
    ("zom_banshee_walk.png", "zom_banshee_walk", 6, "magenta"),
    ("zom_giant_walk.png",   "zom_giant_walk",   6, "magenta"),
    ("zom_cata_walk.png",    "zom_cata_walk",    6, "magenta"),
    ("zom_toxic_walk.png",   "zom_toxic_walk",   6, "magenta"),
    ("zom_ghost_walk.png",   "zom_ghost_walk",   6, "magenta"),
]


def chroma_key(img, mode="green"):
    """Aggressive chroma key with fringe cleanup."""
    arr = np.array(img.convert("RGBA")).copy()
    r = arr[:,:,0].astype(float)
    g = arr[:,:,1].astype(float)
    b = arr[:,:,2].astype(float)

    if mode == "green":
        mask = (g - np.maximum(r, b)) > 40
        fringe = (g > 100) & (g > r * 0.9) & (g > b * 0.9) & (~mask)
        mask |= fringe
    else:
        mask = (((r + b) / 2 - g) > 40)
        fringe = (r > 100) & (b > 100) & (g < 120) & (~mask)
        mask |= fringe

    arr[mask] = [0, 0, 0, 0]
    return arr


def halo_eat(arr, passes=3):
    """Remove bright pixels on transparency boundary."""
    for _ in range(passes):
        alpha = arr[:,:,3]
        transparent = alpha < 10
        dilated = ndimage.binary_dilation(transparent, iterations=1)
        fringe = dilated & ~transparent
        brightness = arr[:,:,0].astype(int) + arr[:,:,1].astype(int) + arr[:,:,2].astype(int)
        arr[fringe & (brightness > 500)] = [0, 0, 0, 0]
    return arr


def find_valleys(alpha, num_frames):
    """Find split points between characters via vertical alpha projection."""
    h, w = alpha.shape
    proj = np.sum(alpha > 10, axis=0).astype(float)
    kernel = np.ones(max(3, w // 100)) / max(3, w // 100)
    proj_smooth = np.convolve(proj, kernel, mode='same')

    expected_spacing = w / num_frames
    splits = [0]
    for i in range(1, num_frames):
        ex = int(i * expected_spacing)
        lo = max(0, ex - int(expected_spacing * 0.35))
        hi = min(w, ex + int(expected_spacing * 0.35))
        window = proj_smooth[lo:hi]
        min_idx = np.argmin(window) + lo
        splits.append(min_idx)
    splits.append(w)
    return [(splits[i], splits[i+1]) for i in range(num_frames)]


def largest_blob_only(frame_arr):
    """
    Keep only the largest connected component in frame_arr.
    Uses moderate dilation to connect body parts before labeling,
    then masks original pixels.
    """
    opaque = frame_arr[:,:,3] > 10
    if not opaque.any():
        return frame_arr

    # Dilate to connect hand/weapon to body (4 iterations ~ 8px)
    struct = ndimage.generate_binary_structure(2, 2)
    connected = ndimage.binary_dilation(opaque, structure=struct, iterations=4)
    labels, n = ndimage.label(connected)
    if n <= 1:
        return frame_arr

    # Find largest component by pixel count
    sizes = ndimage.sum(opaque, labels, range(1, n + 1))
    biggest_label = np.argmax(sizes) + 1

    # Keep only original opaque pixels that fall under the largest component
    keep_mask = (labels == biggest_label) & opaque
    result = np.zeros_like(frame_arr)
    result[keep_mask] = frame_arr[keep_mask]
    return result


def find_content_bbox(arr4):
    """Bounding box of non-transparent pixels."""
    alpha = arr4[:,:,3]
    rows = np.any(alpha > 10, axis=1)
    cols = np.any(alpha > 10, axis=0)
    if not rows.any() or not cols.any():
        h, w = arr4.shape[:2]
        return (0, 0, w, h)
    rmin, rmax = np.where(rows)[0][[0,-1]]
    cmin, cmax = np.where(cols)[0][[0,-1]]
    return (cmin, rmin, cmax + 1, rmax + 1)


def process_sheet(src_path, out_key, num_frames, chroma):
    img = Image.open(src_path).convert("RGBA")
    w, h = img.size
    print(f"  {out_key}: {img.size} → ", end="")

    # 1. Chroma key + halo
    arr = chroma_key(img, chroma)
    arr = halo_eat(arr)
    arr[arr[:,:,3] == 0, :3] = 0

    # 2. Find valley-based split points
    alpha = arr[:,:,3]
    frame_ranges = find_valleys(alpha, num_frames)

    # 3. For each frame column: extract, keep largest blob only
    clean_frames = []
    global_top, global_bottom = h, 0
    max_content_w = 0

    for (left, right) in frame_ranges:
        col = arr[:, left:right, :].copy()
        col = largest_blob_only(col)
        bbox = find_content_bbox(col)
        clean_frames.append((col, bbox))
        if bbox[1] < global_top: global_top = bbox[1]
        if bbox[3] > global_bottom: global_bottom = bbox[3]
        cw = bbox[2] - bbox[0]
        if cw > max_content_w: max_content_w = cw

    # 4. Pack strip
    pad = 4
    global_top = max(0, global_top - pad)
    global_bottom = min(h, global_bottom + pad)
    content_h = global_bottom - global_top
    cell_w = max_content_w + pad * 2

    strip = Image.new("RGBA", (cell_w * num_frames, content_h), (0, 0, 0, 0))
    for i, (col, bbox) in enumerate(clean_frames):
        cropped = col[global_top:global_bottom, bbox[0]:bbox[2], :]
        cropped_img = Image.fromarray(cropped)
        cw = cropped.shape[1]
        offset_x = (cell_w - cw) // 2
        strip.paste(cropped_img, (i * cell_w + offset_x, 0), cropped_img)

    sarr = np.array(strip)
    sarr[sarr[:,:,3] == 0, :3] = 0
    strip = Image.fromarray(sarr)

    out_path = os.path.join(OUT, out_key + ".png")
    strip.save(out_path, optimize=True)
    sz = os.path.getsize(out_path)
    print(f"{strip.size}, {num_frames}f × {cell_w}×{content_h}, {sz//1024}KB")


def main():
    os.makedirs(OUT, exist_ok=True)
    for src_name, out_key, nf, chroma in SHEETS:
        src_path = os.path.join(ASSETS, src_name)
        if not os.path.exists(src_path):
            print(f"  SKIP {out_key}: not found")
            continue
        process_sheet(src_path, out_key, nf, chroma)
    print("\nDone!")

if __name__ == "__main__":
    main()
