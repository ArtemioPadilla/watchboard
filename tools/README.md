# Watchboard Tools

Standalone HTML utilities. Open with the OS file opener — no build, no server, no dependencies.

```bash
open tools/dashboard.html
open tools/video-editor.html
```

---

## `dashboard.html`

(Older utility — see file header.)

---

## `video-editor.html` — TrackerSlide Layout Mockup

Vanilla-JS visual editor that mirrors the layout of `video/src/components/TrackerSlide.tsx` so you can tune **typography, position, colors, sizes, and animation timing** without spinning up Remotion Studio. Useful for fast static-layout iteration; for animation work use `make video` (Remotion Studio).

### What you can edit

| Section | Fields |
|---|---|
| **Background** | gradient angle, top/bottom colors, accent glow opacity |
| **Image card** (popup at 42% top) | top %, width, max-height, border radius/width, glow alpha, shadow blur |
| **Text block** (bottom half) | top % with/without thumbnail, padding L/R/T/B |
| **Tracker name + underline** | font size, weight, letter-spacing, underline width/height/glow |
| **Headline** | font sizes (with/without thumb), weight, color, line-height, max-width |
| **KPI** | label + chevron + value styling, glow alpha (40px and 80px shadows) |
| **Source row** | tier badge + source label sizing, colors, gap |
| **BREAKTHROUGH badge** (day theme) | top, right, padding, radius, font, colors |
| **Animation timing** | spring damping/stiffness/mass, enter/exit duration, per-element delay frames |

### Top bar controls

- **Scale** — preview at 1/4.5 → 1/2 of full 1080×1920 (everything inside is real pixel coords scaled via `transform: scale()`)
- **Theme** — `dark` (breaking brief gradient) vs `day` (progress brief dawn→dusk gradient)
- **Sample** — switch between 3 demo trackers (Cancer Breakthroughs, Iran Conflict, Gaza War)
- **Thumbnail toggle** — show/hide the photo card to test layout in both modes
- **Image card layer toggle** — render with or without the popup image card

### Persistence

Settings persist in `localStorage` between page refreshes. The "Reset" button restores `DEFAULT_SLIDE_STYLE` (which mirrors the production code).

### Exporting your tweaks

Click **Export JSON** (top right). The full SlideStyle object is copied to your clipboard and shown in a fold-out panel at the bottom-left. Paste it back to the maintainer or apply directly to `video/src/data/slide-style.ts` (specifically the `DEFAULT_SLIDE_STYLE` constant).

### How it differs from Remotion Studio

| | `tools/video-editor.html` | `make video` (Remotion Studio) |
|---|---|---|
| Setup | None — just open the file | Requires `make video-prep` and `make video` |
| Animation | Static frame only | Full 30fps timeline with scrubber |
| Globe rendering | None (text + image only) | Real CanvasGlobe with countries + texture |
| Real data | Hardcoded samples | Reads `video/src/data/studio-data.json` (real news + thumbnails) |
| Persistence | localStorage; export JSON manually | Edits in Props panel are transient; copy to `slide-style.ts` to persist |
| Best for | Layout iteration: where things sit, how big, what color | Motion iteration: timing, easing, frame-by-frame inspection |

### What's mocked vs real

The mockup approximates the layout pixel-for-pixel for the **first frame in pose** (post-enter animation). It does NOT show:
- The 3D globe in the upper half
- Spring-based enter/exit animations
- The tracker-name underline grow animation (rendered at final width)

For animation truth, use Remotion Studio. For "where does the headline sit, what size, what spacing" — this is faster.

---

## Editing constants from these tools

Both tools (HTML editor + Remotion Studio Props panel) generate JSON. To make a tweak permanent in production renders, paste your values into the matching default constant:

| Editing | Edit this constant |
|---|---|
| TrackerSlide layout | `DEFAULT_SLIDE_STYLE` in `video/src/data/slide-style.ts` |
| Intro (logo, date, subtitle) | `DEFAULT_INTRO_STYLE` |
| Outro (URL card, stats line) | `DEFAULT_OUTRO_STYLE` |

The renderer reads these directly. No other file needs to change.
