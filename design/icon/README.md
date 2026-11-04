# App icon source

Flat SVG layers of the app icon, for Apple's Icon Composer. Same idea as the Image
Playground render the site uses now (`apple-touch-icon.png`, `icon-192.png`, `icon-512.png`):
a crossword crossing whose empty box is outlined in orange, with sound waves, on graph paper.

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

Not part of the site: nothing here is deployed. Exported icons replace the PNGs at the root.
