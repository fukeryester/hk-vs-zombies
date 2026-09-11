from pathlib import Path
import random
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance, ImageChops

ROOT = Path(__file__).resolve().parent
IMG_DIR = ROOT / "src" / "img"
SIZE = 512

HK_SOURCES = ["base_finance.png", "base_slum.png", "base_police.png"]
ZOM_SOURCES = ["base_zomclassic.png", "base_zomghost.png", "base_zombio.png"]

SPECS = {
    "build_hk_income": dict(side="hk", kind="income", accent="#f4bf59", glow="#ffd67c"),
    "build_hk_pop": dict(side="hk", kind="pop", accent="#d9a76a", glow="#ffd790"),
    "build_hk_tech_a": dict(side="hk", kind="tech_a", accent="#6cc5ff", glow="#8fdcff"),
    "build_hk_tech_b": dict(side="hk", kind="tech_b", accent="#4db1ff", glow="#a2ebff"),
    "build_hk_tech_c": dict(side="hk", kind="tech_c", accent="#58cfff", glow="#b6f7ff"),
    "build_zom_income": dict(side="zom", kind="income", accent="#97d15f", glow="#c9ff6d"),
    "build_zom_pop": dict(side="zom", kind="pop", accent="#94b868", glow="#d5ff8c"),
    "build_zom_tech_a": dict(side="zom", kind="tech_a", accent="#76e26a", glow="#b4ff95"),
    "build_zom_tech_b": dict(side="zom", kind="tech_b", accent="#58c45d", glow="#a9ffb4"),
    "build_zom_tech_c": dict(side="zom", kind="tech_c", accent="#7fe7b4", glow="#c5fff0"),
}


def load_sources(names):
    out = []
    for name in names:
        out.append(Image.open(IMG_DIR / name).convert("RGBA"))
    return out


def fit_crop(img, size, seed):
    rng = random.Random(seed)
    scale = rng.uniform(1.0, 1.45)
    w = int(size[0] * scale)
    h = int(size[1] * scale)
    resized = img.resize((w, h), Image.Resampling.LANCZOS)
    left = max(0, rng.randint(0, max(0, w - size[0])))
    top = max(0, rng.randint(0, max(0, h - size[1])))
    return resized.crop((left, top, left + size[0], top + size[1]))


def make_texture(side, seed):
    rng = random.Random(seed)
    sources = load_sources(HK_SOURCES if side == "hk" else ZOM_SOURCES)
    base = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    for i in range(4):
        crop = fit_crop(sources[i % len(sources)], (SIZE, SIZE), seed * 17 + i * 23)
        crop = ImageEnhance.Color(crop).enhance(0.6 if side == "hk" else 0.75)
        crop = ImageEnhance.Brightness(crop).enhance(0.74 if side == "hk" else 0.68)
        crop.putalpha(int(110 + i * 28))
        base.alpha_composite(crop)
    noise = Image.effect_noise((SIZE, SIZE), 18).convert("L").filter(ImageFilter.GaussianBlur(0.6))
    if side == "hk":
        tint = Image.new("RGBA", (SIZE, SIZE), (120, 82, 50, 255))
    else:
        tint = Image.new("RGBA", (SIZE, SIZE), (72, 56, 44, 255))
    tint.putalpha(noise.point(lambda p: int(p * 0.24)))
    base.alpha_composite(tint)
    return base


def poly(draw, pts, fill):
    draw.polygon([(int(x), int(y)) for x, y in pts], fill=fill)


def rounded_rect(draw, box, radius, fill):
    draw.rounded_rectangle([int(v) for v in box], radius=radius, fill=fill)


def shape_mask(kind):
    m = Image.new("L", (SIZE, SIZE), 0)
    d = ImageDraw.Draw(m)
    ground = 430
    if kind == "income":
        poly(d, [(90, ground), (96, 320), (170, 275), (352, 275), (418, 328), (425, ground)], 255)
        poly(d, [(72, 317), (193, 227), (344, 227), (442, 315)], 255)
        poly(d, [(135, ground), (150, 250), (250, 205), (362, 238), (386, ground)], 255)
    elif kind == "pop":
        poly(d, [(118, ground), (118, 245), (186, 190), (298, 182), (370, 228), (385, ground)], 255)
        poly(d, [(102, 246), (213, 152), (318, 152), (402, 244)], 255)
        poly(d, [(200, 182), (200, 110), (295, 110), (295, 182)], 255)
    elif kind == "tech_a":
        poly(d, [(180, ground), (188, 190), (324, 190), (338, ground)], 255)
        poly(d, [(172, 214), (205, 132), (301, 132), (348, 214)], 255)
    elif kind == "tech_b":
        poly(d, [(172, ground), (180, 132), (330, 132), (344, ground)], 255)
        poly(d, [(203, 132), (226, 72), (296, 72), (316, 132)], 255)
        poly(d, [(160, 176), (206, 104), (307, 104), (358, 176)], 255)
    elif kind == "tech_c":
        poly(d, [(164, ground), (180, 108), (334, 108), (348, ground)], 255)
        poly(d, [(220, 108), (242, 52), (288, 52), (311, 108)], 255)
        poly(d, [(242, 52), (256, 20), (274, 20), (289, 52)], 255)
        poly(d, [(150, 176), (202, 82), (309, 82), (366, 176)], 255)
    return m.filter(ImageFilter.GaussianBlur(0.8))


def add_texture_building(spec_name, spec):
    seed = sum(ord(c) for c in spec_name)
    rng = random.Random(seed)
    side = spec["side"]
    kind = spec["kind"]
    accent = spec["accent"]
    glow = spec["glow"]

    tex = make_texture(side, seed)
    mask = shape_mask(kind)
    out = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    body = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    body.paste(tex, (0, 0), mask)
    out.alpha_composite(body)

    # overall shading to keep a sprite-like silhouette
    shade = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ds = ImageDraw.Draw(shade)
    ds.rectangle((0, 0, SIZE, SIZE), fill=(0, 0, 0, 40))
    grad = Image.new("L", (1, SIZE), 0)
    for y in range(SIZE):
        grad.putpixel((0, y), int(40 + 120 * (y / SIZE)))
    grad = grad.resize((SIZE, SIZE))
    dark = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    dark.putalpha(ImageChops.multiply(grad, mask))
    out.alpha_composite(dark)

    overlay = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    rubble_y = 432
    for i in range(18):
        x = 85 + i * 18 + rng.randint(-10, 10)
        y = rubble_y + rng.randint(-6, 18)
        r = rng.randint(10, 22)
        d.ellipse((x - r, y - r // 3, x + r, y + r // 3), fill=(44, 28, 20, 110))

    # windows / runes / scaffolds
    if kind in ("income", "pop"):
        cols = 4 if kind == "income" else 3
        rows = 2 if kind == "income" else 3
        start_x = 142 if kind == "income" else 156
        start_y = 290 if kind == "income" else 230
        step_x = 52
        step_y = 44
        for yy in range(rows):
            for xx in range(cols):
                x0 = start_x + xx * step_x + rng.randint(-3, 3)
                y0 = start_y + yy * step_y + rng.randint(-3, 3)
                rounded_rect(d, (x0, y0, x0 + 26, y0 + 18), 3, (*hex_to_rgb(glow), 160))
        if kind == "income":
            rounded_rect(d, (175, 355, 338, 385), 5, (*hex_to_rgb(accent), 175))
        else:
            rounded_rect(d, (215, 114, 290, 156), 8, (*hex_to_rgb(accent), 190))
    else:
        levels = {"tech_a": 2, "tech_b": 3, "tech_c": 4}[kind]
        base_y = {"tech_a": 322, "tech_b": 290, "tech_c": 272}[kind]
        width = {"tech_a": 92, "tech_b": 96, "tech_c": 100}[kind]
        for i in range(levels):
            y0 = base_y - i * 58
            x0 = 256 - width // 2 + i * 2
            rounded_rect(d, (x0, y0, x0 + width, y0 + 18), 4, (*hex_to_rgb(glow), 170))
            d.line((x0 - 10, y0 + 8, x0 + width + 10, y0 + 8), fill=(*hex_to_rgb(accent), 150), width=2)
        if kind == "tech_c":
            d.line((256, 20, 256, 76), fill=(*hex_to_rgb(glow), 210), width=5)
            d.ellipse((246, 6, 266, 26), fill=(*hex_to_rgb(glow), 220))

    if side == "hk":
        # steel braces
        for off in range(0, 5):
            x0 = 140 + off * 44
            d.line((x0, 408 - off * 28, x0 + 40, 240 - off * 12), fill=(25, 20, 18, 160), width=3)
        d.line((96, 320, 418, 320), fill=(24, 18, 14, 120), width=4)
    else:
        # bone / fungus spikes
        for off in range(6):
            x = 138 + off * 44 + rng.randint(-5, 5)
            poly(d, [(x, 420), (x + 8, 376 - rng.randint(0, 50)), (x + 18, 420)], (*hex_to_rgb(accent), 135))
        for off in range(4):
            x = 168 + off * 56
            d.ellipse((x, 260 + off * 16, x + 70, 308 + off * 16), fill=(*hex_to_rgb(glow), 60))

    out.alpha_composite(overlay)

    # outline
    outline_mask = mask.filter(ImageFilter.FIND_EDGES).point(lambda p: 255 if p > 20 else 0)
    outline = Image.new("RGBA", (SIZE, SIZE), (20, 12, 10, 0))
    outline.putalpha(outline_mask)
    outline = outline.filter(ImageFilter.MaxFilter(3))
    out.alpha_composite(outline)

    # sharpen a bit
    out = out.filter(ImageFilter.UnsharpMask(radius=1.2, percent=120, threshold=2))

    # crop to content
    alpha = out.getchannel("A")
    bbox = alpha.getbbox()
    if bbox:
        l, t, r, b = bbox
        pad = 18
        l = max(0, l - pad); t = max(0, t - pad)
        r = min(SIZE, r + pad); b = min(SIZE, b + pad)
        out = out.crop((l, t, r, b))

    out.save(IMG_DIR / f"{spec_name}.png")


def hex_to_rgb(s):
    s = s.lstrip("#")
    return tuple(int(s[i:i+2], 16) for i in (0, 2, 4))


def main():
    for name, spec in SPECS.items():
        add_texture_building(name, spec)
        print("wrote", name)


if __name__ == "__main__":
    main()
