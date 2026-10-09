"""Draws the Extension Sorter marketplace icon (128x128 transparent PNG).

The icon reuses the activity bar motif: a list on the left and a clock on the
right - "installed extensions, ordered by time".

Run from the project root so that only ASCII relative paths reach Pillow:

    python3 scripts/generate-icon.py
"""

from PIL import Image, ImageDraw

SIZE = 128
SUPERSAMPLE = 4
CANVAS = SIZE * SUPERSAMPLE
OUTPUT = "resources/icon.png"

BACKGROUND_TOP = (76, 154, 245)
BACKGROUND_BOTTOM = (31, 111, 235)
WHITE = (255, 255, 255, 255)

CORNER_RADIUS = 112
BAR_X = 104
BAR_WIDTHS = (312, 232, 152)
BAR_TOP = 104
BAR_HEIGHT = 56
BAR_GAP = 40

CLOCK_CENTER = (400, 392)
CLOCK_RADIUS = 72
CLOCK_STROKE = 24
CLOCK_HAND_STROKE = 18


def mix(start, end, ratio):
    return tuple(round(a + (b - a) * ratio) for a, b in zip(start, end))


def build_background():
    """Rounded square with a vertical gradient."""
    gradient = Image.new("RGBA", (CANVAS, CANVAS))
    pixels = gradient.load()
    for y in range(CANVAS):
        color = mix(BACKGROUND_TOP, BACKGROUND_BOTTOM, y / (CANVAS - 1))
        for x in range(CANVAS):
            pixels[x, y] = (color[0], color[1], color[2], 255)

    mask = Image.new("L", (CANVAS, CANVAS), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, CANVAS - 1, CANVAS - 1), radius=CORNER_RADIUS, fill=255
    )

    background = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    background.paste(gradient, (0, 0), mask)
    return background


def draw_bars(draw):
    for index, width in enumerate(BAR_WIDTHS):
        top = BAR_TOP + index * (BAR_HEIGHT + BAR_GAP)
        draw.rounded_rectangle(
            (BAR_X, top, BAR_X + width, top + BAR_HEIGHT),
            radius=BAR_HEIGHT // 2,
            fill=WHITE,
        )


def draw_clock(draw):
    """Ring plus two hands, round caps drawn as small circles."""
    cx, cy = CLOCK_CENTER
    radius = CLOCK_RADIUS
    hand_half = CLOCK_HAND_STROKE // 2

    draw.ellipse(
        (cx - radius, cy - radius, cx + radius, cy + radius),
        outline=WHITE,
        width=CLOCK_STROKE,
    )

    minute_hand_end = (cx, cy - 44)
    hour_hand_end = (cx + 36, cy + 8)
    draw.line((cx, cy, minute_hand_end[0], minute_hand_end[1]), fill=WHITE, width=CLOCK_HAND_STROKE)
    draw.line((cx, cy, hour_hand_end[0], hour_hand_end[1]), fill=WHITE, width=CLOCK_HAND_STROKE)
    for point in (minute_hand_end, hour_hand_end, (cx, cy)):
        draw.ellipse(
            (point[0] - hand_half, point[1] - hand_half, point[0] + hand_half, point[1] + hand_half),
            fill=WHITE,
        )


def main():
    icon = build_background()
    draw = ImageDraw.Draw(icon)
    draw_bars(draw)
    draw_clock(draw)

    resampling = getattr(Image, "Resampling", Image)
    icon = icon.resize((SIZE, SIZE), resampling.LANCZOS)
    icon.save(OUTPUT)
    print(f"wrote {OUTPUT} ({icon.width}x{icon.height})")


if __name__ == "__main__":
    main()
