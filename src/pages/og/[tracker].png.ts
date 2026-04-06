/**
 * Dynamic OG card image generator — "war room" style.
 *
 * Produces a 1200x630 PNG per non-draft tracker at build time using satori (SVG)
 * and @resvg/resvg-js (PNG). The card features an earth-texture background cropped
 * to the tracker's geographic region, news photo polaroids, KPI panels, and
 * WATCHBOARD branding on a dark cinematic overlay.
 *
 * IMPORTANT: satori requires every <div> to have explicit `display: 'flex'`.
 * The `el()` helper below enforces this constraint automatically.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — sharp CJS default export
import sharp from 'sharp';
import { loadAllTrackers } from '../../lib/tracker-registry';
import { loadTrackerData } from '../../lib/data';
import type { TrackerConfig } from '../../lib/tracker-config';
import type { TrackerData } from '../../lib/data';

// ── Dimensions ──
const WIDTH = 1200;
const HEIGHT = 630;

// ── KPI color map ──
const KPI_COLORS: Record<string, string> = {
  red: '#f85149',
  amber: '#d29922',
  blue: '#58a6ff',
  green: '#3fb950',
};

// ── Font loader (cached across invocations) ──
let fontDataCache: ArrayBuffer | null = null;

function loadFont(): ArrayBuffer {
  if (fontDataCache) return fontDataCache;
  const fontPath = join(process.cwd(), 'public/fonts/JetBrainsMono-Regular.ttf');
  const buf = readFileSync(fontPath);
  fontDataCache = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return fontDataCache;
}

// ── Date helpers ──
function computeDayCount(startDate: string): number {
  const start = new Date(startDate + 'T00:00:00Z');
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

// ── Satori element factory ──
// Every div in satori MUST have display:'flex'. This helper enforces that.
type SatoriNode = Record<string, unknown>;

function el(
  style: Record<string, unknown>,
  children: SatoriNode[] | SatoriNode | string,
): SatoriNode {
  return {
    type: 'div',
    props: {
      style: { display: 'flex', ...style },
      children,
    },
  };
}

// ── Earth texture background processing ──
const bgCache = new Map<string, string>();

async function processEarthBackground(
  bounds: { lonMin: number; lonMax: number; latMin: number; latMax: number },
): Promise<string> {
  const cacheKey = `${bounds.lonMin},${bounds.lonMax},${bounds.latMin},${bounds.latMax}`;
  if (bgCache.has(cacheKey)) return bgCache.get(cacheKey)!;

  const texturePath = join(process.cwd(), 'public/textures/earth-dark-blend-4k.webp');
  const metadata = await sharp(texturePath).metadata();
  const imgW = metadata.width!;
  const imgH = metadata.height!;

  // Expand bounds to minimum span
  let lonSpan = bounds.lonMax - bounds.lonMin;
  let latSpan = bounds.latMax - bounds.latMin;
  const lonCenter = (bounds.lonMin + bounds.lonMax) / 2;
  const latCenter = (bounds.latMin + bounds.latMax) / 2;
  if (lonSpan < 60) lonSpan = 60;
  if (latSpan < 30) latSpan = 30;

  // Add 15% padding each side
  lonSpan *= 1.3;
  latSpan *= 1.3;

  // Clamp to valid range
  const lonMin = Math.max(-180, lonCenter - lonSpan / 2);
  const lonMax = Math.min(180, lonCenter + lonSpan / 2);
  const latMin = Math.max(-90, latCenter - latSpan / 2);
  const latMax = Math.min(90, latCenter + latSpan / 2);

  // Convert to pixel coordinates (equirectangular projection)
  const x1 = Math.floor(((lonMin + 180) / 360) * imgW);
  const x2 = Math.ceil(((lonMax + 180) / 360) * imgW);
  const y1 = Math.floor(((90 - latMax) / 180) * imgH); // latMax = top of image
  const y2 = Math.ceil(((90 - latMin) / 180) * imgH);

  const cropW = Math.min(x2 - x1, imgW - x1);
  const cropH = Math.min(y2 - y1, imgH - y1);

  const processed = await sharp(texturePath)
    .extract({ left: x1, top: y1, width: cropW, height: cropH })
    .linear(2.0, 0)
    .modulate({ brightness: 1.3 })
    .blur(1.0)
    .resize(1200, 630, { fit: 'cover' })
    .png()
    .toBuffer();

  const dataUri = `data:image/png;base64,${processed.toString('base64')}`;
  bgCache.set(cacheKey, dataUri);
  return dataUri;
}

// ── Thumbnail fetching ──
// Fetches remote image, converts to PNG via sharp for satori compatibility.
async function fetchThumbnailBase64(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const rawBuf = Buffer.from(await res.arrayBuffer());
    // Convert to PNG — satori does not reliably handle webp/avif data URIs
    const pngBuf = await sharp(rawBuf).resize(220, 160, { fit: 'cover' }).png().toBuffer();
    return `data:image/png;base64,${pngBuf.toString('base64')}`;
  } catch {
    return null;
  }
}

// ── Extract thumbnail URLs from timeline data ──
function extractThumbnails(data: TrackerData, max: number): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (let i = data.timeline.length - 1; i >= 0 && urls.length < max; i--) {
    const era = data.timeline[i];
    for (let j = era.events.length - 1; j >= 0 && urls.length < max; j--) {
      const evt = era.events[j];
      for (const m of evt.media ?? []) {
        if (m.thumbnail && !seen.has(m.thumbnail)) {
          seen.add(m.thumbnail);
          urls.push(m.thumbnail);
          if (urls.length >= max) break;
        }
      }
    }
  }
  return urls;
}

// ── Photo layout positions based on count ──
interface PhotoLayout {
  x: number;
  y: number;
  rotation: number;
}

function getPhotoLayouts(count: number): PhotoLayout[] {
  const rotations = [-4, 3, -2, 5];
  if (count === 4) {
    return [
      { x: 540, y: 80, rotation: rotations[0] },
      { x: 780, y: 100, rotation: rotations[1] },
      { x: 580, y: 300, rotation: rotations[2] },
      { x: 820, y: 320, rotation: rotations[3] },
    ];
  }
  if (count === 3) {
    return [
      { x: 560, y: 90, rotation: rotations[0] },
      { x: 800, y: 120, rotation: rotations[1] },
      { x: 660, y: 310, rotation: rotations[2] },
    ];
  }
  if (count === 2) {
    return [
      { x: 600, y: 100, rotation: rotations[0] },
      { x: 780, y: 280, rotation: rotations[1] },
    ];
  }
  if (count === 1) {
    return [{ x: 700, y: 160, rotation: rotations[0] }];
  }
  return [];
}

// ── KPI data shape ──
interface KpiData {
  label: string;
  value: string;
  color: string;
}

// ── Card builder ──
function buildCardMarkup(
  config: TrackerConfig,
  kpis: KpiData[],
  bgDataUri: string | null,
  photoDataUris: string[],
): SatoriNode {
  const accentColor = config.color || '#58a6ff';
  const isLive = config.temporal === 'live';
  const titleText = config.shortName || config.name;
  const descText =
    config.description.length > 70
      ? config.description.slice(0, 67) + '...'
      : config.description;
  const topKpis = kpis.slice(0, 3);

  const children: SatoriNode[] = [];

  // ── Background image (earth texture or solid) ──
  if (bgDataUri) {
    children.push(
      el(
        {
          position: 'absolute',
          top: '0',
          left: '0',
          width: '1200px',
          height: '630px',
          backgroundImage: `url(${bgDataUri})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        },
        [],
      ),
    );
  }

  // ── Overlay layers ──
  // Left dark panel (0-504px)
  children.push(
    el(
      {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '504px',
        height: '630px',
        backgroundColor: 'rgba(13,17,23,0.92)',
      },
      [],
    ),
  );

  // Gradient transition zone (504-696px) — simulated with multiple strips
  // satori does not support CSS gradients, so we use 4 strips with decreasing opacity
  const gradientStrips = [
    { left: 504, width: 48, opacity: 0.88 },
    { left: 552, width: 48, opacity: 0.76 },
    { left: 600, width: 48, opacity: 0.6 },
    { left: 648, width: 48, opacity: 0.45 },
  ];
  for (const strip of gradientStrips) {
    children.push(
      el(
        {
          position: 'absolute',
          top: '0',
          left: `${strip.left}px`,
          width: `${strip.width}px`,
          height: '630px',
          backgroundColor: `rgba(13,17,23,${strip.opacity})`,
        },
        [],
      ),
    );
  }

  // Right light overlay (696-1200px)
  children.push(
    el(
      {
        position: 'absolute',
        top: '0',
        left: '696px',
        width: '504px',
        height: '630px',
        backgroundColor: 'rgba(13,17,23,0.35)',
      },
      [],
    ),
  );

  // ── Top accent line ──
  children.push(
    el(
      {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '1200px',
        height: '4px',
        backgroundColor: accentColor,
      },
      [],
    ),
  );

  // ── Photo polaroids (right side) ──
  const layouts = getPhotoLayouts(photoDataUris.length);
  for (let i = 0; i < photoDataUris.length; i++) {
    const layout = layouts[i];
    const photoUri = photoDataUris[i];
    // Outer div = white border polaroid effect
    children.push(
      el(
        {
          position: 'absolute',
          left: `${layout.x}px`,
          top: `${layout.y}px`,
          width: '226px',
          height: '166px',
          backgroundColor: '#ffffff',
          padding: '3px',
          transform: `rotate(${layout.rotation}deg)`,
          border: '2px solid rgba(0,0,0,0.3)',
        },
        [
          el(
            {
              width: '220px',
              height: '160px',
              backgroundImage: `url(${photoUri})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            },
            [],
          ),
        ],
      ),
    );
  }

  // ── Left content panel ──
  const leftContentChildren: SatoriNode[] = [];

  // Title
  leftContentChildren.push(
    el(
      {
        fontSize: '42px',
        fontWeight: 700,
        color: '#ffffff',
        lineHeight: 1.15,
        maxWidth: '420px',
      },
      titleText,
    ),
  );

  // Day badge (live trackers only)
  if (isLive) {
    const dayCount = computeDayCount(config.startDate);
    leftContentChildren.push(
      el(
        {
          backgroundColor: accentColor,
          color: '#ffffff',
          fontSize: '18px',
          fontWeight: 700,
          padding: '4px 14px',
          borderRadius: '6px',
          marginTop: '8px',
          alignSelf: 'flex-start',
        },
        `DAY ${dayCount}`,
      ),
    );
  }

  // Description
  leftContentChildren.push(
    el(
      {
        fontSize: '16px',
        color: '#c9d1d9',
        lineHeight: 1.4,
        marginTop: '8px',
        maxWidth: '420px',
      },
      descText,
    ),
  );

  // KPI stack
  if (topKpis.length > 0) {
    const kpiBoxes = topKpis.map((kpi, idx) =>
      el(
        {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: 'rgba(22,27,34,0.85)',
          borderRadius: '8px',
          padding: '12px 16px',
          width: '420px',
          height: '80px',
          borderLeft: idx === 0 ? `3px solid ${accentColor}` : '3px solid #30363d',
        },
        [
          el(
            {
              fontSize: '40px',
              fontWeight: 700,
              color: KPI_COLORS[kpi.color] || '#e6edf3',
              lineHeight: 1.1,
              flexShrink: 0,
            },
            kpi.value,
          ),
          el(
            {
              fontSize: '14px',
              color: '#b0b8c4',
              textTransform: 'uppercase',
              marginLeft: '12px',
              flex: '1',
              lineHeight: 1.2,
            },
            kpi.label,
          ),
        ],
      ),
    );

    leftContentChildren.push(
      el(
        {
          flexDirection: 'column',
          marginTop: '20px',
          gap: '8px',
        },
        kpiBoxes,
      ),
    );
  }

  // Tags row
  const tags: SatoriNode[] = [];
  if (config.domain) {
    tags.push(
      el(
        {
          fontSize: '12px',
          color: '#6e7681',
          backgroundColor: 'rgba(48,54,61,0.6)',
          padding: '4px 10px',
          borderRadius: '4px',
          textTransform: 'uppercase',
        },
        config.domain.replace(/-/g, ' '),
      ),
    );
  }
  if (config.region) {
    tags.push(
      el(
        {
          fontSize: '12px',
          color: '#6e7681',
          backgroundColor: 'rgba(48,54,61,0.6)',
          padding: '4px 10px',
          borderRadius: '4px',
          textTransform: 'uppercase',
        },
        config.region.replace(/-/g, ' '),
      ),
    );
  }
  if (isLive) {
    tags.push(
      el(
        {
          fontSize: '12px',
          color: '#6e7681',
          backgroundColor: 'rgba(48,54,61,0.6)',
          padding: '4px 10px',
          borderRadius: '4px',
          textTransform: 'uppercase',
        },
        'LIVE',
      ),
    );
  }
  if (tags.length > 0) {
    leftContentChildren.push(
      el(
        {
          flexDirection: 'row',
          marginTop: '12px',
          gap: '8px',
        },
        tags,
      ),
    );
  }

  children.push(
    el(
      {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '504px',
        height: '575px',
        flexDirection: 'column',
        padding: '60px 0 0 48px',
      },
      leftContentChildren,
    ),
  );

  // ── Bottom bar ──
  children.push(
    el(
      {
        position: 'absolute',
        bottom: '0',
        left: '0',
        width: '1200px',
        height: '55px',
        backgroundColor: 'rgba(13,17,23,0.95)',
        padding: '0 48px',
        alignItems: 'center',
        justifyContent: 'space-between',
      },
      [
        el(
          {
            fontSize: '14px',
            color: '#6e7681',
          },
          `${config.sections.length} SECTIONS`,
        ),
        el(
          {
            alignItems: 'center',
            gap: '8px',
          },
          [
            el(
              {
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: '#f85149',
              },
              [],
            ),
            el(
              {
                fontSize: '36px',
                fontWeight: 700,
                color: '#d0d7de',
                letterSpacing: '3px',
              },
              'WATCHBOARD',
            ),
          ],
        ),
      ],
    ),
  );

  // ── Root container ──
  return el(
    {
      position: 'relative',
      width: '1200px',
      height: '630px',
      backgroundColor: '#0d1117',
      fontFamily: 'JetBrains Mono',
    },
    children,
  );
}

// ── Static paths ──
export const getStaticPaths: GetStaticPaths = () => {
  const trackers = loadAllTrackers();
  return trackers
    .filter((t) => t.status !== 'draft')
    .map((t) => ({
      params: { tracker: t.slug },
      props: { config: t },
    }));
};

// ── GET handler ──
export const GET: APIRoute = async ({ props }) => {
  const config = props.config as TrackerConfig;

  let kpis: KpiData[] = [];
  let photoDataUris: string[] = [];
  let bgDataUri: string | null = null;

  try {
    const data = loadTrackerData(config.slug, config.eraLabel);
    kpis = data.kpis.map((k) => ({
      label: k.label,
      value: k.value,
      color: k.color,
    }));

    // Extract and fetch thumbnails
    const thumbnailUrls = extractThumbnails(data, 4);
    const fetched = await Promise.all(thumbnailUrls.map(fetchThumbnailBase64));
    photoDataUris = fetched.filter((uri): uri is string => uri !== null);
  } catch {
    // Data loading failure is non-fatal; card renders without KPIs or photos
  }

  // Process earth texture background if tracker has map bounds
  const mapBounds = config.map?.bounds;
  if (mapBounds) {
    try {
      bgDataUri = await processEarthBackground({
        lonMin: mapBounds.lonMin,
        lonMax: mapBounds.lonMax,
        latMin: mapBounds.latMin,
        latMax: mapBounds.latMax,
      });
    } catch {
      // Background processing failure is non-fatal; falls back to solid dark bg
    }
  }

  const fontData = loadFont();
  const fonts = [
    {
      name: 'JetBrains Mono',
      data: fontData,
      weight: 400 as const,
      style: 'normal' as const,
    },
  ];

  let markup = buildCardMarkup(config, kpis, bgDataUri, photoDataUris);

  let svg: string;
  try {
    svg = await satori(markup as unknown as React.ReactNode, {
      width: WIDTH,
      height: HEIGHT,
      fonts,
    });
  } catch (err) {
    // Fallback: render a minimal card without photos or background
    console.error(`[og] satori failed for ${config.slug}, retrying minimal:`, err);
    markup = buildCardMarkup(config, kpis, null, []);
    svg = await satori(markup as unknown as React.ReactNode, {
      width: WIDTH,
      height: HEIGHT,
      fonts,
    });
  }

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: WIDTH },
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  return new Response(Buffer.from(pngBuffer), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
