"""Turn the generated pose strips into readable walk and attack cycles.

The image model kept character identity well, but produced poses that were too
similar. This pass preserves those painted frames and adds strong key-pose
changes (weight shift, body lean, squash and lunge) that remain visible after
the sprites are scaled down in game.
"""
from pathlib import Path

from PIL import Image


ROOT = Path(r"e:\Project\WebGame\HKVSZombie")
ANIM = ROOT / "src" / "img" / "anim"

KEYS = [
    "hk_melee_cheap",
    "hk_melee_tank",
    "hk_melee_fast",
    "hk_ranged_light",
    "hk_ranged_aoe",
    "hk_ranged_heavy",
    "hk_support",
    "zom_normal",
    "zom_hopper",
    "zom_banshee",
    "zom_giant",
    "zom_cata",
    "zom_toxic",
    "zom_ghost",
]

# Six deliberately different contact/down/passing/up poses.
WALK = [
    (-4.0, -7,  0, 1.05, 0.98),
    (-1.0, -2, 14, 0.97, 1.03),
    ( 4.0,  7,  3, 1.05, 0.98),
    ( 1.0,  2, 14, 0.97, 1.03),
    (-3.0, -6,  4, 1.03, 0.99),
    ( 3.0,  6, 10, 0.99, 1.01),
]

# Anticipation -> strike/recoil -> follow-through -> recovery.
ATTACK_MELEE = [
    (-7.0, -18,  8, 0.97, 1.03),
    (-10.0, -26, 10, 0.94, 1.05),
    ( 3.0,   5,  3, 1.03, 0.98),
    (11.0,  30, -2, 1.10, 0.94),
    ( 6.0,  20,  2, 1.06, 0.97),
    ( 0.0,   0,  7, 1.00, 1.00),
]
ATTACK_RANGED = [
    (-3.0, -10,  5, 0.99, 1.01),
    (-1.0,  -3,  2, 1.01, 0.99),
    ( 5.0,  10,  7, 0.96, 1.03),
    (-5.0, -14,  9, 1.04, 0.97),
    ( 2.0,   5,  5, 0.99, 1.01),
    ( 0.0,   0,  7, 1.00, 1.00),
]

RANGED = {
    "hk_ranged_light", "hk_ranged_aoe", "hk_ranged_heavy", "hk_support",
    "zom_banshee", "zom_cata", "zom_toxic", "zom_ghost",
}


def transform(frame, pose, out_w, out_h):
    angle, dx, dy, sx, sy = pose
    w = max(1, round(frame.width * sx))
    h = max(1, round(frame.height * sy))
    shaped = frame.resize((w, h), Image.Resampling.BICUBIC)
    shaped = shaped.rotate(angle, Image.Resampling.BICUBIC, expand=True)
    canvas = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 0))
    x = (out_w - shaped.width) // 2 + dx
    y = out_h - shaped.height - 18 + dy
    canvas.alpha_composite(shaped, (x, y))
    return canvas


def make_cycle(source, poses):
    frames = 6
    fw = source.width // frames
    raw = [source.crop((i * fw, 0, (i + 1) * fw, source.height))
           for i in range(frames)]
    out_w = fw + 80
    out_h = source.height + 50
    cooked = [
        transform(raw[i], poses[i], out_w, out_h)
        for i in range(frames)
    ]
    strip = Image.new("RGBA", (out_w * frames, out_h), (0, 0, 0, 0))
    for i, frame in enumerate(cooked):
        strip.alpha_composite(frame, (i * out_w, 0))
    return strip


def main():
    for key in KEYS:
        walk_path = ANIM / f"{key}_walk.png"
        source = Image.open(walk_path).convert("RGBA")
        walk = make_cycle(source, WALK)
        attack_poses = ATTACK_RANGED if key in RANGED else ATTACK_MELEE
        attack = make_cycle(source, attack_poses)
        walk.save(walk_path, optimize=True)
        attack.save(ANIM / f"{key}_attack.png", optimize=True)
        print(
            f"{key}: walk={walk.width // 6}x{walk.height}, "
            f"attack={attack.width // 6}x{attack.height}"
        )


if __name__ == "__main__":
    main()
