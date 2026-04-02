#!/usr/bin/env tsx
/**
 * Generates a 1280x640 social preview PNG for the GitHub repository.
 * Uses satori (SVG) + @resvg/resvg-js (PNG) — same stack as OG cards.
 *
 * Usage: npx tsx scripts/generate-social-preview.ts
 * Output: public/social-preview.png
 */

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import * as fs from 'fs';
import * as path from 'path';

const WIDTH = 1280;
const HEIGHT = 640;

async function main() {
  const fontPath = path.resolve('public/fonts/JetBrainsMono-Regular.ttf');
  const fontData = fs.readFileSync(fontPath);

  const pills = ['48 Trackers', '3D Globe', 'Nightly AI Updates', 'OSINT'];

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: WIDTH,
          height: HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0d1117',
          fontFamily: 'JetBrains Mono',
          color: '#e6edf3',
          position: 'relative',
        },
        children: [
          // Top accent bar
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 4,
                background: 'linear-gradient(90deg, #58a6ff, #a371f7, #f778ba)',
              },
            },
          },
          // Title
          {
            type: 'div',
            props: {
              style: {
                fontSize: 72,
                fontWeight: 700,
                letterSpacing: '0.05em',
                marginBottom: 16,
              },
              children: 'WATCHBOARD',
            },
          },
          // Subtitle
          {
            type: 'div',
            props: {
              style: {
                fontSize: 28,
                color: '#8b949e',
                marginBottom: 48,
              },
              children: 'AI-Powered Intelligence Dashboards',
            },
          },
          // Feature pills
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                gap: 16,
              },
              children: pills.map((label) => ({
                type: 'div',
                props: {
                  style: {
                    border: '2px solid #58a6ff',
                    borderRadius: 24,
                    padding: '10px 24px',
                    fontSize: 20,
                    color: '#58a6ff',
                  },
                  children: label,
                },
              })),
            },
          },
          // URL
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                bottom: 32,
                fontSize: 18,
                color: '#484f58',
              },
              children: 'watchboard.dev',
            },
          },
        ],
      },
    },
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        {
          name: 'JetBrains Mono',
          data: fontData,
          weight: 400,
          style: 'normal' as const,
        },
        {
          name: 'JetBrains Mono',
          data: fontData,
          weight: 700,
          style: 'normal' as const,
        },
      ],
    }
  );

  const resvg = new Resvg(svg, { fitTo: { mode: 'width' as const, value: WIDTH } });
  const png = resvg.render().asPng();

  const outPath = path.resolve('public/social-preview.png');
  fs.writeFileSync(outPath, png);
  console.log(`Social preview written to ${outPath} (${png.length} bytes)`);
}

main().catch(console.error);
