#!/usr/bin/env tsx
/**
 * Generates a 400x400 profile image with a radar/crosshair icon.
 * Military-style OSINT theme on dark background.
 */

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import * as fs from 'fs';
import * as path from 'path';

const SIZE = 400;

async function main() {
  const fontPath = path.resolve('public/fonts/JetBrainsMono-Regular.ttf');
  const fontData = fs.readFileSync(fontPath);

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: SIZE,
          height: SIZE,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0d1117',
          position: 'relative',
          overflow: 'hidden',
        },
        children: [
          // Outer radar ring
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                width: 300,
                height: 300,
                borderRadius: '50%',
                border: '2px solid #1a3a5c',
              },
            },
          },
          // Middle radar ring
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                width: 200,
                height: 200,
                borderRadius: '50%',
                border: '1.5px solid #1a3a5c',
              },
            },
          },
          // Inner radar ring
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                width: 100,
                height: 100,
                borderRadius: '50%',
                border: '1px solid #1a3a5c',
              },
            },
          },
          // Vertical crosshair line
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: 30,
                left: SIZE / 2 - 0.5,
                width: 1,
                height: SIZE - 60,
                backgroundColor: '#1a3a5c',
              },
            },
          },
          // Horizontal crosshair line
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: SIZE / 2 - 0.5,
                left: 30,
                width: SIZE - 60,
                height: 1,
                backgroundColor: '#1a3a5c',
              },
            },
          },
          // Radar sweep (triangle/wedge shape simulated with a gradient box)
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                width: 150,
                height: 150,
                top: SIZE / 2 - 150,
                left: SIZE / 2,
                background: 'linear-gradient(225deg, rgba(88, 166, 255, 0.25) 0%, rgba(88, 166, 255, 0) 70%)',
                transformOrigin: 'bottom left',
                transform: 'rotate(-20deg)',
              },
            },
          },
          // Center dot (bright)
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: '#58a6ff',
                boxShadow: '0 0 12px #58a6ff, 0 0 24px rgba(88,166,255,0.4)',
              },
            },
          },
          // Blip 1 (upper right area)
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: '#58a6ff',
                top: 115,
                left: 255,
                boxShadow: '0 0 8px #58a6ff',
              },
            },
          },
          // Blip 2 (lower left)
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                width: 4,
                height: 4,
                borderRadius: '50%',
                backgroundColor: '#3b82f6',
                top: 260,
                left: 135,
                boxShadow: '0 0 6px #3b82f6',
              },
            },
          },
          // Blip 3 (upper left faint)
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                width: 4,
                height: 4,
                borderRadius: '50%',
                backgroundColor: 'rgba(88,166,255,0.5)',
                top: 140,
                left: 110,
                boxShadow: '0 0 4px rgba(88,166,255,0.3)',
              },
            },
          },
          // "W" letter at bottom
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                bottom: 28,
                fontSize: 24,
                fontWeight: 700,
                color: '#58a6ff',
                letterSpacing: '0.15em',
                fontFamily: 'JetBrains Mono',
              },
              children: 'WATCHBOARD',
            },
          },
          // Top label
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: 28,
                fontSize: 11,
                color: '#484f58',
                letterSpacing: '0.2em',
                fontFamily: 'JetBrains Mono',
              },
              children: 'OSINT DASHBOARD',
            },
          },
        ],
      },
    },
    {
      width: SIZE,
      height: SIZE,
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

  const resvg = new Resvg(svg, { fitTo: { mode: 'width' as const, value: SIZE } });
  const png = resvg.render().asPng();

  const outPath = path.resolve('public/profile-image.png');
  fs.writeFileSync(outPath, png);
  console.log(`Profile image written to ${outPath} (${png.length} bytes)`);
}

main().catch(console.error);
