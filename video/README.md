# Watchboard Video Pipeline

Remotion-based video generation for Watchboard daily breaking news shorts. Produces 15-25 second vertical videos (1080x1920, 9:16) for TikTok, Reels, and YouTube Shorts.

## Quick start

```bash
cd video
npm install

# Preview in Remotion Studio
npm run dev

# Fetch breaking data from tracker files
npm run fetch

# Render to MP4
npm run render
```

## Structure

```
video/
  render.ts                  CLI render script (fetch + bundle + render)
  src/
    Root.tsx                  Remotion root (composition registry)
    Video.tsx                 Main video composition (sequencing)
    components/
      Background.tsx          Animated starfield + grid background
      Intro.tsx               Logo + date intro (3s)
      TrackerSlide.tsx        Single tracker highlight (5s each)
      Outro.tsx               CTA + site URL (5s)
      Headline.tsx            Word-by-word text reveal
      KpiCounter.tsx          Animated number counter
      MapDot.tsx              Pulsing dot on world map SVG
    data/
      types.ts                TypeScript interfaces + sample data
      fetch-breaking.ts       Reads tracker files, outputs breaking.json
    styles/
      global.css              Design tokens
```

## Video timeline (30fps)

| Section   | Frames   | Duration | Content                      |
|-----------|----------|----------|------------------------------|
| Intro     | 0-89     | 3s       | WATCHBOARD logo + date       |
| Tracker 1 | 90-239   | 5s       | Map dot + headline + KPI     |
| Tracker 2 | 240-389  | 5s       | Map dot + headline + KPI     |
| Tracker 3 | 390-539  | 5s       | Map dot + headline + KPI     |
| Outro     | 540-689  | 5s       | Tracker icons + CTA          |

Total: ~23 seconds (690 frames). Adapts automatically for 1-2 trackers.

## Data fetching

`fetch-breaking.ts` reads from `../trackers/*/` to find the top 3 breaking trackers (prioritizes `meta.json#breaking=true`, then most recently updated). Falls back to sample data if tracker files are unavailable.

## Design system

- Background: `#0a0b0e` (near black)
- Cards: `#181b23` with `#2a2d3a` borders
- Accents: red `#e74c3c`, blue `#3498db`, amber `#f39c12`
- Fonts: DM Sans (body), JetBrains Mono (data/labels)

## Requirements

- Node.js 18+
- FFmpeg (for video encoding) -- Remotion handles this automatically on most systems
