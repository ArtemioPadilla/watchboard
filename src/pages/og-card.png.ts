/**
 * Site-wide OG card — replaces the legacy public/og-card.png that still
 * showed the old Iran-Conflict-only branding.
 *
 * Generated at build time via satori → resvg. Reflects the actual current
 * state (tracker count) so it doesn't drift when new trackers ship.
 *
 * Per-tracker pages override this via /og/<slug>.png; this is the fallback
 * for everything else (home, /feeds/, /about/, /metrics/, etc.).
 */
import type { APIRoute } from 'astro';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadAllTrackers } from '../lib/tracker-registry';

const WIDTH = 1200;
const HEIGHT = 630;

let regularFont: ArrayBuffer | null = null;
let boldFont: ArrayBuffer | null = null;

function loadFont(file: string): ArrayBuffer {
  const buf = readFileSync(join(process.cwd(), 'public/fonts', file));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

type SatoriNode = Record<string, unknown>;
function el(style: Record<string, unknown>, children: SatoriNode[] | SatoriNode | string): SatoriNode {
  return { type: 'div', props: { style: { display: 'flex', ...style }, children } };
}

export const GET: APIRoute = async () => {
  if (!regularFont) regularFont = loadFont('JetBrainsMono-Regular.ttf');
  if (!boldFont) boldFont = loadFont('JetBrainsMono-Regular.ttf'); // reuse if no bold variant

  const trackers = loadAllTrackers();
  const activeCount = trackers.filter((t) => t.status === 'active').length;

  const card = el(
    {
      width: WIDTH,
      height: HEIGHT,
      flexDirection: 'column',
      backgroundColor: '#0d1117',
      color: '#e6edf3',
      fontFamily: 'JetBrains Mono',
      position: 'relative',
    },
    [
      // Top accent gradient strip
      el(
        {
          width: '100%',
          height: 4,
          background: 'linear-gradient(90deg, #f85149 0%, #d29922 50%, #58a6ff 100%)',
        },
        [],
      ),
      // Main content column
      el(
        {
          flex: 1,
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 80px',
          gap: 24,
        },
        [
          // Live indicator
          el(
            { flexDirection: 'row', alignItems: 'center', gap: 12, color: '#3fb950', fontSize: 22, letterSpacing: 2 },
            [
              el({ width: 12, height: 12, borderRadius: 6, backgroundColor: '#3fb950' }, []),
              el({}, '● MULTI-TOPIC INTELLIGENCE DASHBOARD'),
            ],
          ),
          // Wordmark
          el(
            { fontSize: 120, fontWeight: 700, color: '#e6edf3', letterSpacing: -2, marginTop: -8 },
            'WATCHBOARD',
          ),
          // Tagline
          el(
            { fontSize: 32, color: '#9498a8', lineHeight: 1.3, maxWidth: 920 },
            'Sourced data, interactive maps, contested-claims tracking — across conflicts, history, science, and culture.',
          ),
          // Stats row
          el(
            { flexDirection: 'row', alignItems: 'center', gap: 32, marginTop: 16, fontSize: 24 },
            [
              el({ flexDirection: 'row', alignItems: 'baseline', gap: 8 }, [
                el({ fontSize: 44, fontWeight: 700, color: '#58a6ff' }, String(activeCount)),
                el({ color: '#8b949e', letterSpacing: 1 }, 'ACTIVE TRACKERS'),
              ]),
              el({ width: 1, height: 32, backgroundColor: '#30363d' }, []),
              el({ color: '#8b949e' }, 'updated daily'),
            ],
          ),
        ],
      ),
      // Footer
      el(
        {
          padding: '20px 80px',
          borderTop: '1px solid #30363d',
          fontSize: 18,
          color: '#8b949e',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        [el({}, 'watchboard.dev'), el({ color: '#58a6ff' }, '/feeds — RSS · /api — JSON · /metrics — status')],
      ),
    ],
  );

  const svg = await satori(card as never, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: 'JetBrains Mono', data: regularFont, weight: 400, style: 'normal' },
      { name: 'JetBrains Mono', data: boldFont, weight: 700, style: 'normal' },
    ],
  });

  const png = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } }).render().asPng();

  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
