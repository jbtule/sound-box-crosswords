# Makes the site's icons from full.icon (macOS, needs Icon Composer and Pillow):
#   python3 design/icon/site.py
# Renders the light (Default) iOS icon at 1024 px with Icon Composer's ictool, converts it
# from Display P3 to sRGB (so every browser shows the same color), then writes, at the repo root:
#   icon-512.png, icon-192.png  the manifest's icons: rounded, see-through corners, as drawn
#   apple-touch-icon.png        180 px, square and opaque: iOS rounds it and shows
#                               see-through corners as black, so the corners take the color a
#                               little inside the glass rim (iOS crops them off anyway)
import io
import os
import subprocess
import tempfile

import numpy as np
from PIL import Image, ImageCms

ICTOOL = "/Applications/Icon Composer.app/Contents/Executables/ictool"
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(os.path.dirname(here))

with tempfile.TemporaryDirectory() as tmp:
    png = os.path.join(tmp, "icon.png")
    subprocess.run([ICTOOL, os.path.join(here, "full.icon"), "--export-image", "--output-file", png,
                    "--platform", "iOS", "--rendition", "Default", "--width", "1024", "--height", "1024",
                    "--scale", "1"], check=True, capture_output=True)
    raw = Image.open(png)
    raw.load()

# Display P3 (as rendered) to sRGB, keeping the alpha.
p3 = ImageCms.ImageCmsProfile(io.BytesIO(raw.info["icc_profile"]))
rgb = ImageCms.profileToProfile(raw.convert("RGB"), p3, ImageCms.createProfile("sRGB"), outputMode="RGB")
src = rgb.copy()
src.putalpha(raw.convert("RGBA").getchannel("A"))

for n in (512, 192):  # resized premultiplied, so the rounded edge stays clean
    src.convert("RGBa").resize((n, n), Image.LANCZOS).convert("RGBA").save(os.path.join(root, f"icon-{n}.png"), optimize=True)

# Square and opaque: each row's see-through ends take the color INSET px inside the rim.
a = np.asarray(src).astype(float)
alpha = a[..., 3]
h, w = alpha.shape
INSET = 48
fill = a[..., :3].copy()
for y in range(h):
    solid = np.where(alpha[y] > 250)[0]
    left, right = solid[0], solid[-1]
    fill[y, :left] = a[y, min(left + INSET, w // 2), :3]
    fill[y, right + 1:] = a[y, max(right - INSET, w // 2), :3]
k = alpha[..., None] / 255
square = Image.fromarray((a[..., :3] * k + fill * (1 - k)).clip(0, 255).astype("uint8"), "RGB")
square.resize((180, 180), Image.LANCZOS).save(os.path.join(root, "apple-touch-icon.png"), optimize=True)
print("wrote icon-512.png, icon-192.png, apple-touch-icon.png")
