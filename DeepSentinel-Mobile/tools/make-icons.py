"""
Generates every launcher, splash and favicon asset in ../assets.

    python tools/make-icons.py

The mark is three arcs closing around a filled core: one arc per detector, in
that detector's colour from src/theme/tokens.ts, and the core in the editorial
accent — the same thing the Case screen's "Model contributions" card shows, so
the launcher icon and the evidence panel say the same thing.

It is a script rather than a checked-in drawing because the palette is shared
with the web dashboard and will move. When tokens.ts changes, change the
constants below and re-run; committing the output keeps the build free of a
Python dependency.
"""
import math
import pathlib

from PIL import Image, ImageDraw

SS = 4  # drawn at 4x and reduced, which is where the antialiasing comes from

# Straight from src/theme/tokens.ts. Keep in step.
CANVAS = (6, 9, 26)      # bg.canvas          #06091A
ROSE = (220, 38, 73)     # modality.behavioral
TEAL = (15, 155, 142)    # modality.graph
AMBER = (194, 116, 10)   # modality.temporal
ACCENT = (45, 212, 191)  # accent.base        #2DD4BF

DETECTORS = (ROSE, TEAL, AMBER)

GAP_DEG = 20             # breathing room between arcs; below ~14 they merge at 48px
RING_RADIUS = 0.375      # of the mark box, to the middle of the stroke
RING_WIDTH = 0.115
CORE_RADIUS = 0.165

ASSETS = pathlib.Path(__file__).resolve().parent.parent / "assets"


def draw_mark(d: ImageDraw.ImageDraw, size: int, mono: bool = False) -> None:
    """The mark, filling a `size` px box.

    `mono` flattens it to white for Android 13 themed icons, which discard
    colour and tint the alpha channel with the user's wallpaper palette.
    """
    c = size / 2
    mid, w = size * RING_RADIUS, size * RING_WIDTH
    outer = mid + w / 2
    box = [c - outer, c - outer, c + outer, c + outer]
    span = (360 - GAP_DEG * len(DETECTORS)) / len(DETECTORS)

    angle = -90 + GAP_DEG / 2
    for detector in DETECTORS:
        colour = (255, 255, 255) if mono else detector
        d.arc(box, angle, angle + span, fill=colour, width=round(w))
        for end in (angle, angle + span):
            # Pillow's arc caps are square; round them by hand so the ring
            # reads as three strokes rather than three cut segments.
            px = c + mid * math.cos(math.radians(end))
            py = c + mid * math.sin(math.radians(end))
            d.ellipse([px - w / 2, py - w / 2, px + w / 2, py + w / 2], fill=colour)
        angle += span + GAP_DEG

    r = size * CORE_RADIUS
    d.ellipse([c - r, c - r, c + r, c + r],
              fill=(255, 255, 255) if mono else ACCENT)


def render(size: int, *, scale: float, background: bool, mono: bool = False) -> Image.Image:
    """One asset: the mark at `scale` of the canvas, centred."""
    big = size * SS
    img = Image.new("RGBA", (big, big), (*CANVAS, 255) if background else (0, 0, 0, 0))
    inner = round(big * scale)
    layer = Image.new("RGBA", (inner, inner), (0, 0, 0, 0))
    draw_mark(ImageDraw.Draw(layer), inner, mono)
    img.alpha_composite(layer, ((big - inner) // 2, (big - inner) // 2))
    return img.resize((size, size), Image.LANCZOS)


# scale is the reason each of these differs:
#   0.70  iOS rounds the corners off its own, so the mark stays clear of them.
#   0.62  Android's adaptive safe zone is 66 of 108dp; anything outside can be
#         cropped by whichever mask the launcher applies.
#   0.38  the splash uses resizeMode "contain", so the image fits to the screen
#         width — the padding here is what keeps the mark from filling it.
ASSET_SPEC = {
    "icon.png": dict(size=1024, scale=0.70, background=True),
    "android-icon-foreground.png": dict(size=1024, scale=0.62, background=False),
    "android-icon-monochrome.png": dict(size=1024, scale=0.62, background=False, mono=True),
    "splash-icon.png": dict(size=1024, scale=0.38, background=False),
    "favicon.png": dict(size=48, scale=0.78, background=True),
}


def main() -> None:
    for name, spec in ASSET_SPEC.items():
        render(**spec).save(ASSETS / name)
        print(f"{name:32} {spec['size']}px")

    # Flat, deliberately: adaptive backgrounds are parallax-shifted behind the
    # foreground, and any detail in one draws attention to the movement.
    plain = Image.new("RGBA", (1024, 1024), (*CANVAS, 255))
    plain.save(ASSETS / "android-icon-background.png")
    print(f"{'android-icon-background.png':32} 1024px")


if __name__ == "__main__":
    main()
