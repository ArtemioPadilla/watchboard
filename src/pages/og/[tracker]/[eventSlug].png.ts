/**
 * Per-event OG card image generator.
 *
 * Produces a 1200x630 PNG per timeline event at build time using satori (SVG)
 * and @resvg/resvg-js (PNG). The card shows the event headline, tracker name +
 * initial circle, formatted date, source tier badges, and WATCHBOARD branding.
 *
 * IMPORTANT: satori requires every <div> to have explicit `display: 'flex'`.
 * The `el()` helper below enforces this constraint automatically.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadAllTrackers } from '../../../lib/tracker-registry';
import { loadTrackerData } from '../../../lib/data';
import { flattenTimelineEvents } from '../../../lib/timeline-utils';
import { eventToSlug } from '../../../lib/event-slug';
import type { TrackerConfig } from '../../../lib/tracker-config';
import type { FlatEvent } from '../../../lib/timeline-utils';

// ── Dimensions ──
const WIDTH = 1200;
const HEIGHT = 630;

// ── Colors ──
const BG_COLOR = '#0d1117';
const BG_SUBTLE = '#161b22';
const TEXT_PRIMARY = '#e6edf3';
const TEXT_SECONDARY = '#8b949e';
const BORDER_COLOR = '#30363d';
const BRANDING_COLOR = '#484f58';

// ── Tier colors ──
const TIER_COLORS: Record<number, string> = {
  1: '#f85149',
  2: '#58a6ff',
  3: '#d29922',
  4: '#8b949e',
};

const TIER_LABELS: Record<number, string> = {
  1: 'Official',
  2: 'Major Outlet',
  3: 'Institutional',
  4: 'Unverified',
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

// ── Date formatter ──
function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const monthLabel = months[parseInt(month, 10) - 1] ?? month;
  return `${monthLabel} ${parseInt(day, 10)}, ${year}`;
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

// ── Card builder ──
function buildCardMarkup(config: TrackerConfig, event: FlatEvent): SatoriNode {
  const accentColor = config.color || '#58a6ff';
  const trackerTitle = config.shortName || config.name;

  // Truncate headline to 3 lines worth (~120 chars)
  const headline =
    event.title.length > 120 ? event.title.slice(0, 117) + '...' : event.title;

  // Collect unique tiers from event sources (max 3)
  const seenTiers = new Set<number>();
  const tierBadges: number[] = [];
  for (const src of event.sources) {
    const t = src.tier as number;
    if (!seenTiers.has(t)) {
      seenTiers.add(t);
      tierBadges.push(t);
    }
    if (tierBadges.length >= 3) break;
  }

  const tierBadgeNodes: SatoriNode[] = tierBadges.map((tier) =>
    el(
      {
        alignItems: 'center',
        gap: '8px',
        backgroundColor: BG_SUBTLE,
        border: `1px solid ${BORDER_COLOR}`,
        borderRadius: '8px',
        padding: '8px 16px',
      },
      [
        el(
          {
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: TIER_COLORS[tier] ?? TEXT_SECONDARY,
            flexShrink: 0,
          },
          [],
        ),
        el(
          {
            fontSize: '14px',
            color: TIER_COLORS[tier] ?? TEXT_SECONDARY,
            letterSpacing: '0.5px',
          },
          `T${tier} · ${TIER_LABELS[tier] ?? 'Unknown'}`,
        ),
      ],
    ),
  );

  // Root container
  return el(
    {
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      backgroundColor: BG_COLOR,
      padding: '48px 56px',
      fontFamily: 'JetBrains Mono',
    },
    [
      // Top accent bar
      el(
        {
          position: 'absolute',
          top: '0',
          left: '0',
          width: '100%',
          height: '4px',
          backgroundColor: accentColor,
        },
        [],
      ),

      // Header: tracker initial circle + tracker name (left), date badge (right)
      el(
        {
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '32px',
        },
        [
          el(
            {
              alignItems: 'center',
              gap: '16px',
              flex: '1',
            },
            [
              // Colored initial circle
              el(
                {
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: accentColor,
                  color: '#ffffff',
                  fontSize: '22px',
                  fontWeight: 700,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                },
                trackerTitle.charAt(0).toUpperCase(),
              ),
              el(
                {
                  fontSize: '20px',
                  color: TEXT_SECONDARY,
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                },
                trackerTitle,
              ),
            ],
          ),
          // Date badge
          el(
            {
              backgroundColor: BG_SUBTLE,
              border: `1px solid ${BORDER_COLOR}`,
              color: TEXT_SECONDARY,
              padding: '8px 20px',
              borderRadius: '8px',
              fontSize: '16px',
              letterSpacing: '1px',
              flexShrink: 0,
            },
            formatDate(event.resolvedDate),
          ),
        ],
      ),

      // Event headline (center, large)
      el(
        {
          flex: '1',
          alignItems: 'flex-start',
          justifyContent: 'center',
          flexDirection: 'column',
        },
        [
          el(
            {
              fontSize: '52px',
              fontWeight: 700,
              color: TEXT_PRIMARY,
              lineHeight: 1.2,
              maxWidth: '1080px',
            },
            headline,
          ),
        ],
      ),

      // Bottom bar: tier badges (left) + WATCHBOARD branding (right)
      el(
        {
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginTop: '24px',
        },
        [
          // Tier badges
          el(
            {
              gap: '12px',
              alignItems: 'center',
              flexWrap: 'wrap',
            },
            tierBadgeNodes.length > 0 ? tierBadgeNodes : el({ display: 'flex' }, []),
          ),

          // WATCHBOARD branding
          el({ alignItems: 'center', gap: '8px' }, [
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
                fontSize: '18px',
                fontWeight: 700,
                color: BRANDING_COLOR,
                letterSpacing: '3px',
              },
              'WATCHBOARD',
            ),
          ]),
        ],
      ),
    ],
  );
}

// ── Static paths ──
export const getStaticPaths: GetStaticPaths = () => {
  const trackers = loadAllTrackers();
  const paths: { params: { tracker: string; eventSlug: string }; props: { config: TrackerConfig; event: FlatEvent } }[] = [];

  for (const t of trackers.filter((t) => t.status !== 'draft')) {
    let data;
    try {
      data = loadTrackerData(t.slug, t.eraLabel);
    } catch {
      continue;
    }
    const flatEvents = flattenTimelineEvents(data.timeline);
    for (const ev of flatEvents) {
      paths.push({
        params: { tracker: t.slug, eventSlug: eventToSlug(ev.resolvedDate, ev.id) },
        props: { config: t, event: ev },
      });
    }
  }

  return paths;
};

// ── GET handler ──
export const GET: APIRoute = async ({ props }) => {
  const config = props.config as TrackerConfig;
  const event = props.event as FlatEvent;

  const fontData = loadFont();
  const markup = buildCardMarkup(config, event);

  const svg = await satori(markup as unknown as React.ReactNode, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      {
        name: 'JetBrains Mono',
        data: fontData,
        weight: 400,
        style: 'normal',
      },
    ],
  });

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
