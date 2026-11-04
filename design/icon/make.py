# Draws the app icon as flat SVG layers for Apple's Icon Composer, which adds the glass,
# highlights, shadows and corner mask itself:  python3 design/icon/make.py
# Same idea as the first icon (an Image Playground render): a crossword crossing whose
# empty box is outlined in orange, with sound waves coming off it, on graph paper.
# Writes, back to front: 1-background.svg, 2-boxes.svg, 3-empty-box.svg, 4-waves.svg, plus
# icon-all-layers.svg (all four, for previewing). Colors are the app's (styles.css).
import math
import os

W = 1024                 # Icon Composer canvas
S, C, R = 176, 156, 30   # grid step, box size, corner radius
cx, cy = 512, 560        # the crossing (the empty box)
BG, GRID = "#e9f0f7", "#cfdcea"
GREEN, PURPLE = "#9fdcbf", "#c9b6f5"   # the two syllable bands
WHITE, EDGE, ORANGE = "#ffffff", "#b4c4d7", "#ef7d22"


def svg(body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {W}" width="{W}" height="{W}">\n{body}\n</svg>\n'


def box(x, y, fill, edge=None, size=C, sw=6):
    h = size / 2
    e = f' stroke="{edge}" stroke-width="{sw}"' if edge else ""
    return f'  <rect x="{x - h:g}" y="{y - h:g}" width="{size}" height="{size}" rx="{R}" fill="{fill}"{e}/>'


def arc(r, deg):
    a = math.radians(deg)
    x, y1, y2 = cx + r * math.cos(a), cy - r * math.sin(a), cy + r * math.sin(a)
    return f'  <path d="M{x:.1f} {y1:.1f} A{r} {r} 0 0 1 {x:.1f} {y2:.1f}" fill="none" stroke="{ORANGE}" stroke-width="40" stroke-linecap="round"/>'


# Paper: full bleed (Icon Composer masks it), lines on the box grid's half steps.
paper = [f'  <rect width="{W}" height="{W}" fill="{BG}"/>']
for i in range(-12, 13):
    x, y = cx + i * S / 2, cy + i * S / 2
    if 0 < x < W:
        paper.append(f'  <line x1="{x:g}" y1="0" x2="{x:g}" y2="{W}" stroke="{GRID}" stroke-width="3"/>')
    if 0 < y < W:
        paper.append(f'  <line x1="0" y1="{y:g}" x2="{W}" y2="{y:g}" stroke="{GRID}" stroke-width="3"/>')
background = "\n".join(paper)

# The across word comes in from the left (green | purple purple); the down word is
# green, purple, white above the crossing and white below (still to fill).
across = [(cx - 3 * S, GREEN, None), (cx - 2 * S, PURPLE, None), (cx - S, PURPLE, None)]
down = [(cy - 3 * S, GREEN, None), (cy - 2 * S, PURPLE, None), (cy - S, WHITE, EDGE),
        (cy + S, WHITE, EDGE), (cy + 2 * S, WHITE, EDGE)]
boxes = "\n".join([box(x, cy, f, e) for x, f, e in across] + [box(cx, y, f, e) for y, f, e in down])

empty = box(cx, cy, WHITE, ORANGE, size=C + 8, sw=26)
waves = "\n".join([arc(170, 34), arc(255, 40), arc(340, 44)])

here = os.path.dirname(os.path.abspath(__file__))
layers = {"1-background.svg": background, "2-boxes.svg": boxes, "3-empty-box.svg": empty, "4-waves.svg": waves}
for name, body in {**layers, "icon-all-layers.svg": "\n".join(layers.values())}.items():
    with open(os.path.join(here, name), "w") as f:
        f.write(svg(body))
