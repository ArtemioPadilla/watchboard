#!/usr/bin/env tsx
/**
 * generate-stat-card.ts
 *
 * Generates a branded 1200x628 stat card PNG for a tweet.
 * Used for breaking news and data viz tweet types.
 *
 * Usage: npx tsx scripts/generate-stat-card.ts --tracker gaza-war --label "DEATH TOLL" --value "72,285" --delta "+5 today" --out public/_social/cards/gaza-stat.png
 */
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import * as fs from 'fs';
import * as path from 'path';

const WIDTH = 1200;
const HEIGHT = 628;

interface CardOptions {
  tracker: string;
  label: string;
  value: string;
  delta: string;
  outPath: string;
}

function parseArgs(): CardOptions {
  const args = process.argv.slice(2);
  const get = (flag: string): string => {
    const idx = args.indexOf(flag);
    if (idx === -1 || !args[idx + 1]) throw new Error(`Missing ${flag}`);
    return args[idx + 1];
  };
  return {
    tracker: get('--tracker'),
    label: get('--label'),
    value: get('--value'),
    delta: get('--delta'),
    outPath: get('--out'),
  };
}

async function main(): Promise<void> {
  const opts = parseArgs();
  const fontPath = path.resolve('public/fonts/JetBrainsMono-Regular.ttf');
  const fontData = fs.readFileSync(fontPath);

  const trackerUpper = opts.tracker.replace(/-/g, ' ').toUpperCase();

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: WIDTH, height: HEIGHT,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(160deg, #0d1117, #161b22)',
          fontFamily: 'JetBrains Mono', color: '#e6edf3',
          position: 'relative', gap: 8,
        },
        children: [
          { type: 'div', props: { style: { position: 'absolute', top: 16, left: 20, fontSize: 14, fontWeight: 600, color: 'rgba(88,166,255,0.5)', letterSpacing: '0.1em' }, children: 'WATCHBOARD' } },
          { type: 'div', props: { style: { fontSize: 14, color: '#8b949e', letterSpacing: '0.08em' }, children: `${trackerUpper} — ${opts.label}` } },
          { type: 'div', props: { style: { fontSize: 72, fontWeight: 700, color: '#f85149', textShadow: '0 0 40px rgba(248,81,73,0.3)' }, children: opts.value } },
          { type: 'div', props: { style: { fontSize: 18, color: '#e6edf3', fontWeight: 500 }, children: opts.label } },
          { type: 'div', props: { style: { fontSize: 14, color: '#d29922' }, children: opts.delta } },
          { type: 'div', props: { style: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #f85149, #d29922)' } } },
        ],
      },
    },
    {
      width: WIDTH, height: HEIGHT,
      fonts: [
        { name: 'JetBrains Mono', data: fontData, weight: 400, style: 'normal' as const },
        { name: 'JetBrains Mono', data: fontData, weight: 700, style: 'normal' as const },
      ],
    },
  );

  const resvg = new Resvg(svg, { fitTo: { mode: 'width' as const, value: WIDTH } });
  const png = resvg.render().asPng();

  const dir = path.dirname(opts.outPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(opts.outPath, png);
  console.log(`Stat card written to ${opts.outPath} (${png.length} bytes)`);
}

main().catch(console.error);
