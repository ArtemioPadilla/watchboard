/**
 * Dynamic OG card image generator.
 *
 * Produces a 1200x630 PNG per non-draft tracker at build time using satori (SVG)
 * and @resvg/resvg-js (PNG). The card shows the tracker name, top 3 KPIs,
 * a day count or year range, and WATCHBOARD branding — all on a dark background
 * matching the site theme.
 *
 * IMPORTANT: satori requires every <div> to have explicit `display: 'flex'`.
 * The `el()` helper below enforces this constraint automatically.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadAllTrackers } from '../../lib/tracker-registry';
import { loadTrackerData } from '../../lib/data';
import type { TrackerConfig } from '../../lib/tracker-config';

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

function computeYearRange(startDate: string, endDate?: string): string {
  const startYear = startDate.slice(0, 4);
  if (endDate) {
    const endYear = endDate.slice(0, 4);
    return startYear === endYear ? startYear : `${startYear} - ${endYear}`;
  }
  return `${startYear} - PRESENT`;
}

// ── KPI color map ──
const KPI_COLORS: Record<string, string> = {
  red: '#f85149',
  amber: '#d29922',
  blue: '#58a6ff',
  green: '#3fb950',
};

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

// ── KPI data shape ──
interface KpiData {
  label: string;
  value: string;
  color: string;
}

// ── Card builder ──
function buildCardMarkup(config: TrackerConfig, kpis: KpiData[]): SatoriNode {
  const accentColor = config.color || '#58a6ff';
  const isLive = config.temporal === 'live';
  const dateLabel = isLive
    ? `DAY ${computeDayCount(config.startDate)}`
    : computeYearRange(config.startDate, config.endDate);
  const topKpis = kpis.slice(0, 3);
  const titleText = config.shortName || config.name;
  const descText =
    config.description.length > 140
      ? config.description.slice(0, 137) + '...'
      : config.description;

  // KPI boxes
  const kpiChildren = topKpis.map((kpi) =>
    el(
      {
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: BG_SUBTLE,
        border: `1px solid ${BORDER_COLOR}`,
        borderRadius: '12px',
        padding: '20px 28px',
        minWidth: '200px',
        flex: '1',
      },
      [
        el(
          {
            fontSize: '36px',
            fontWeight: 700,
            color: KPI_COLORS[kpi.color] || TEXT_PRIMARY,
            lineHeight: 1.1,
          },
          kpi.value,
        ),
        el(
          {
            fontSize: '14px',
            color: TEXT_SECONDARY,
            marginTop: '8px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          },
          kpi.label,
        ),
      ],
    ),
  );

  // Fallback tags when no KPIs
  const tagChildren: SatoriNode[] = [];
  if (config.domain) {
    tagChildren.push(
      el(
        {
          backgroundColor: BG_SUBTLE,
          border: `1px solid ${BORDER_COLOR}`,
          borderRadius: '8px',
          padding: '12px 24px',
          fontSize: '20px',
          color: TEXT_SECONDARY,
          textTransform: 'uppercase',
          letterSpacing: '1px',
        },
        config.domain.replace(/-/g, ' '),
      ),
    );
  }
  if (config.region) {
    tagChildren.push(
      el(
        {
          backgroundColor: BG_SUBTLE,
          border: `1px solid ${BORDER_COLOR}`,
          borderRadius: '8px',
          padding: '12px 24px',
          fontSize: '20px',
          color: TEXT_SECONDARY,
          textTransform: 'uppercase',
          letterSpacing: '1px',
        },
        config.region.replace(/-/g, ' '),
      ),
    );
  }

  const middleSection =
    topKpis.length > 0
      ? el({ gap: '20px', flex: '1', alignItems: 'center' }, kpiChildren)
      : el({ gap: '16px', flex: '1', alignItems: 'center', flexWrap: 'wrap' }, tagChildren);

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
      // Top accent line
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

      // Header: initial badge + title + date badge
      el(
        {
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
        },
        [
          el(
            {
              alignItems: 'center',
              gap: '16px',
              flex: '1',
            },
            [
              // Colored circle with first initial (replaces emoji icon
              // which satori cannot render without an emoji font)
              el(
                {
                  width: '52px',
                  height: '52px',
                  borderRadius: '50%',
                  backgroundColor: accentColor,
                  color: '#ffffff',
                  fontSize: '24px',
                  fontWeight: 700,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                },
                titleText.charAt(0).toUpperCase(),
              ),
              el(
                {
                  fontSize: '42px',
                  fontWeight: 700,
                  color: TEXT_PRIMARY,
                  lineHeight: 1.15,
                  flex: '1',
                },
                titleText,
              ),
            ],
          ),
          el(
            {
              backgroundColor: accentColor,
              color: '#ffffff',
              padding: '8px 20px',
              borderRadius: '8px',
              fontSize: '22px',
              fontWeight: 700,
              letterSpacing: '1px',
              flexShrink: 0,
            },
            dateLabel,
          ),
        ],
      ),

      // Description
      el(
        {
          fontSize: '18px',
          color: TEXT_SECONDARY,
          lineHeight: 1.4,
          marginBottom: '36px',
          maxWidth: '900px',
        },
        descText,
      ),

      // KPIs or tags
      middleSection,

      // Bottom bar
      el(
        {
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginTop: '24px',
        },
        [
          el(
            {
              fontSize: '14px',
              color: BRANDING_COLOR,
              letterSpacing: '1px',
            },
            `${config.sections.length} SECTIONS`,
          ),
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
  try {
    const data = loadTrackerData(config.slug, config.eraLabel);
    kpis = data.kpis.map((k) => ({
      label: k.label,
      value: k.value,
      color: k.color,
    }));
  } catch {
    // Data loading failure is non-fatal; card renders without KPIs
  }

  const fontData = loadFont();
  const markup = buildCardMarkup(config, kpis);

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
