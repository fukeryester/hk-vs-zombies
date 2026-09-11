from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps, ImageEnhance

ROOT = Path(__file__).resolve().parent
IMG_DIR = ROOT / "src" / "img"
OUT_DIR = IMG_DIR / "achievements"
OUT_DIR.mkdir(parents=True, exist_ok=True)

SIZE = 256

ACHIEVEMENTS = {
    "first_win":         dict(title="WIN",  subtitle="首胜",   key="hk_tank",          bg=("#ffcf68", "#b85d12")),
    "blitz_win":         dict(title="3M",   subtitle="速攻",   key="hk_runner",        bg=("#ffe16e", "#d56e16")),
    "killer_thirty":     dict(title="30",   subtitle="连斩",   key="zom_giant",        bg=("#ff7d6e", "#7f1010")),
    "six_buildings":     dict(title="6B",   subtitle="地产",   key="build_hk_tech_b",  bg=("#72c9ff", "#224f9c")),
    "civ_win_hk_finance":dict(title="IPO",  subtitle="金融",   key="base_finance",     bg=("#8fd4ff", "#2457a8")),
    "civ_win_hk_slum":   dict(title="SLUM", subtitle="贫民",   key="base_slum",        bg=("#ffbf74", "#8c4f11")),
    "civ_win_hk_police": dict(title="WPD",  subtitle="差馆",   key="base_police",      bg=("#7fe0ab", "#1f6b47")),
    "civ_win_zom_classic":dict(title="CLASS",subtitle="尸潮",  key="base_zomclassic",  bg=("#d89494", "#5b1717")),
    "civ_win_zom_ghost": dict(title="GHOST",subtitle="怪谈",   key="base_zomghost",    bg=("#ceb1ff", "#492073")),
    "civ_win_zom_bio":   dict(title="BIO",  subtitle="实验",   key="base_zombio",      bg=("#8ef3a3", "#155935")),
    "veteran":           dict(title="50",   subtitle="老兵",   key="hk_peasant",       bg=("#f2c772", "#7f5220")),
    "warlord":           dict(title="10W",  subtitle="军阀",   key="hk_ranged_heavy",  bg=("#ffb16c", "#913112")),
    "rich_10k":          dict(title="10K",  subtitle="财源",   key="build_hk_income",  bg=("#ffe26e", "#8c5b0c")),
    "legend":            dict(title="LEG",  subtitle="传奇",   key="zom_lady",         bg=("#ff8db6", "#7a1d51")),
}


def load_font(size, bold=False):
    candidates = [
        "C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/simhei.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            pass
    return ImageFont.load_default()


def gradient(bg0, bg1):
    base = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    dr = ImageDraw.Draw(base)
    c0 = hex_to_rgb(bg0)
    c1 = hex_to_rgb(bg1)
    for y in range(SIZE):
        t = y / max(1, SIZE - 1)
        c = tuple(int(c0[i] * (1 - t) + c1[i] * t) for i in range(3))
        dr.line((0, y, SIZE, y), fill=c + (255,), width=1)
    return base


def fit_subject(key):
    img = Image.open(IMG_DIR / f"{key}.png").convert("RGBA")
    alpha = img.getchannel("A")
    bbox = alpha.getbbox()
    if bbox:
        img = img.crop(bbox)
    scale = 0.68 if "base_" in key else 0.56
    target = int(SIZE * scale)
    ratio = img.width / img.height
    if ratio >= 1:
        w = target
        h = max(1, int(target / ratio))
    else:
        h = target
        w = max(1, int(target * ratio))
    return img.resize((w, h), Image.Resampling.LANCZOS)


def make_icon(spec, locked=False):
    bg = gradient(*spec["bg"])
    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((32, 24, SIZE - 32, SIZE - 48), fill=(255, 240, 180, 88))
    glow = glow.filter(ImageFilter.GaussianBlur(18))
    bg.alpha_composite(glow)

    # frame
    d = ImageDraw.Draw(bg)
    d.rounded_rectangle((8, 8, SIZE - 8, SIZE - 8), radius=28, outline=(28, 18, 12, 255), width=8)
    d.rounded_rectangle((18, 18, SIZE - 18, SIZE - 18), radius=22, outline=(255, 234, 180, 180), width=3)

    # subject
    subject = fit_subject(spec["key"])
    shadow = Image.new("RGBA", bg.size, (0, 0, 0, 0))
    shadow.paste((0, 0, 0, 120), (SIZE // 2 - subject.width // 2 + 6, 46), subject)
    shadow = shadow.filter(ImageFilter.GaussianBlur(6))
    bg.alpha_composite(shadow)
    bg.alpha_composite(subject, (SIZE // 2 - subject.width // 2, 36))

    # ribbon
    d = ImageDraw.Draw(bg)
    d.rounded_rectangle((24, SIZE - 76, SIZE - 24, SIZE - 24), radius=18, fill=(18, 10, 8, 210))
    d.rectangle((28, SIZE - 74, SIZE - 28, SIZE - 66), fill=(255, 232, 160, 90))

    title_font = load_font(34, bold=True)
    sub_font = load_font(18, bold=True)
    tw = d.textlength(spec["title"], font=title_font)
    d.text(((SIZE - tw) / 2, SIZE - 70), spec["title"], font=title_font, fill=(255, 236, 180, 255))
    sw = d.textlength(spec["subtitle"], font=sub_font)
    d.text(((SIZE - sw) / 2, SIZE - 38), spec["subtitle"], font=sub_font, fill=(255, 216, 126, 255))

    # corner emblem
    d.ellipse((20, 20, 68, 68), fill=(255, 238, 186, 220), outline=(88, 54, 26, 255), width=3)
    d.text((34, 28), "★", font=load_font(22, bold=True), fill=(126, 72, 18, 255))

    if locked:
        bg = ImageOps.grayscale(bg).convert("RGBA")
        veil = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 96))
        bg.alpha_composite(veil)
        d = ImageDraw.Draw(bg)
        d.rounded_rectangle((24, 24, SIZE - 24, SIZE - 24), radius=22, outline=(180, 180, 180, 170), width=4)
        lock_font = load_font(22, bold=True)
        d.rounded_rectangle((88, 18, 168, 48), radius=12, fill=(28, 28, 28, 220))
        d.text((102, 22), "LOCK", font=lock_font, fill=(230, 230, 230, 240))

    return bg


def hex_to_rgb(s):
    s = s.lstrip("#")
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def main():
    for aid, spec in ACHIEVEMENTS.items():
        make_icon(spec, locked=False).save(OUT_DIR / f"{aid}_unlock.png", optimize=True)
        make_icon(spec, locked=True).save(OUT_DIR / f"{aid}_locked.png", optimize=True)
        print("wrote", aid)


if __name__ == "__main__":
    main()
