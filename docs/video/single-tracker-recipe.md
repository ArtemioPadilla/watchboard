# Single-Tracker Video Recipe

> Generate a focused video about one artist, event, or topic — instead of the daily 3-tracker brief.
> Approved look: BTS ARIRANG World Tour (V11, 2026-05-17) 🎉

## Quick Start

```bash
# 1. Write your breaking.json (see template below)
# 2. Render
cd video
SKIP_FETCH=1 npx tsx render.ts --mode positive --theme day
# Output: video/output/watchboard-YYYY-MM-DD-progress.mp4
```

`SKIP_FETCH=1` skips the automatic tracker selection and uses `video/src/data/breaking.json` as-is.

---

## breaking.json Template

```json
{
  "date": "2026-05-16",
  "title": "ARTIST NAME",
  "subtitle": "TOUR / EVENT NAME",
  "trackers": [
    {
      "slug": "artist-city1",
      "name": "City Name",
      "icon": "🎤",
      "headline": "Short description of the event — key fact",
      "kpiLabel": "FANS",
      "kpiValue": 50000,
      "kpiPrefix": "",
      "kpiSuffix": "+",
      "sourceTier": 2,
      "sourceLabel": "Billboard / Live Nation",
      "mapCenter": [19.43, -99.13],
      "thumbnailUrls": [],
      "thumbnailBase64": "data:image/jpeg;base64,...",
      "thumbnailAspectRatio": 1.5,
      "mapEnabled": true,
      "seriesLabel": "ARTIST · TOUR NAME",
      "events": []
    }
  ],
  "totalTrackers": 3
}
```

Repeat the tracker object for each city/stop. The globe rotates to each `mapCenter`.

---

## Embedding Thumbnails

```python
import base64
from PIL import Image
import io

def img_to_b64(path, max_w=1000):
    """Returns (base64_data_url, aspect_ratio)"""
    img = Image.open(path).convert('RGB')
    w, h = img.size
    ratio = round(w / h, 4)
    if w > max_w:
        img = img.resize((max_w, int(h * max_w / w)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, 'JPEG', quality=88)
    b64 = 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()
    return b64, ratio
```

`thumbnailAspectRatio` makes the image card resize to the exact photo proportions — no black bars, no cropping.

---

## Themes

| Flag | Theme | Best for |
|------|-------|----------|
| `--mode positive --theme day` | Sunrise gradient, gold accents | Music, culture, sports, science |
| `--mode conflict --theme dark` | Dark starfield, red accents | Conflicts, geopolitics |

---

## New Fields Added to `BreakingTracker`

| Field | Type | Purpose |
|-------|------|---------|
| `seriesLabel` | `string` | Shown above the city/tracker name (e.g. `"BTS · ARIRANG WORLD TOUR"`) |
| `thumbnailAspectRatio` | `number` | `width/height` — card height derived from this, no black bars |
| `mapEnabled` | `boolean` | `false` → use `TimelineSlide` instead of globe |
| `events` | `TrackerEvent[]` | Events shown in `TimelineSlide` |

## New Fields Added to `BreakingData`

| Field | Type | Purpose |
|-------|------|---------|
| `title` | `string` | Replaces "WATCHBOARD" in Intro (e.g. `"BTS"`) |
| `subtitle` | `string` | Replaces "PROGRESS BRIEF" in Intro (e.g. `"ARIRANG WORLD TOUR 2026"`) |

---

## New Component: `TimelineSlide`

Used when `tracker.mapEnabled === false` and `tracker.events.length > 0`.
Shows: tracker name + headline + up to 4 events with dates, animated in cascade.
Good for: artist discographies, historical timelines, non-geographic topics.

---

## Post Caption Structure (English)

```
🎤 ARTIST NAME — TOUR/EVENT NAME

[Context line: Day X since debut / milestone]

🇲🇽 **City 1** — [key fact]. [stat].
🇺🇸 **City 2** — [key fact]. [stat].
🎰 **City 3** — [key fact]. [stat].

[Bold headline stat]

Track every milestone at watchboard.dev 🌍

#Artist #TourName #Genre #Platform #Year
```

---

## Good Image Sources

| Source | CDN / Download |
|--------|---------------|
| Billboard | `wp-content/uploads/` — direct download works |
| Rolling Stone (AU) | `images-r2-1.thebrag.com` — direct download works |
| Herald Korea | `wimg.heraldcorp.com` — direct download works |
| KQED | og:image scraping works |

---

## Example: BTS ARIRANG World Tour (2026-05-16)

- 3 stops: Mexico City → Stanford, CA → Las Vegas
- Globe rotates to each venue coordinates
- Billboard photo (BTS + Sheinbaum) for CDMX
- KQED photo for Stanford
- Rolling Stone concert photo for Vegas
- Post: 136K fans CDMX · Stanford Stadium history · $1.8B tour projection · FIFA World Cup halftime confirmed
