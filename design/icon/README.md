# App icon source

The app icon's source: flat SVG layers for Apple's Icon Composer, and the Icon Composer design
made from them. A crossword crossing whose empty box is outlined in orange, with sound waves,
on graph paper (the idea of the first icon, an Image Playground render).

| File | Layer (back to front) |
| --- | --- |
| `1-background.svg` | Paper and grid lines, full bleed |
| `2-boxes.svg` | The mint, purple and white boxes |
| `3-empty-box.svg` | The empty box, orange outline |
| `4-waves.svg` | Three sound waves |
| `icon-all-layers.svg` | All four together, for previewing |

`full.icon` is the Icon Composer document made from them: the finished design, with light
(blue), dark (navy) and tinted versions, glass, a neutral shadow and some translucency. Open it
in Icon Composer to change it. It keeps its own copies of the layers in `full.icon/Assets/`, so
after rerunning `make.py`, copy the changed SVGs there (or re-add them in Icon Composer).

All are 1024 × 1024 with no shading or rounded corners: Icon Composer adds the glass,
highlights, shadows and mask. Colors are the app's (`styles.css`). The layers are made by
`make.py` (`python3 design/icon/make.py`); change it and rerun rather than editing the SVGs.

Nothing here is deployed. `site.py` makes the site's icons from `full.icon` (macOS, with Icon
Composer and Pillow: `python3 design/icon/site.py`): `icon-512.png` and `icon-192.png`
(rounded, see-through corners) and `apple-touch-icon.png` (180 px, square and opaque, since iOS
rounds it and shows see-through corners as black), converted from Display P3 to sRGB.
