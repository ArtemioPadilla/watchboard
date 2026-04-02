#!/usr/bin/env tsx
/**
 * Generates a 1500x500 X/Twitter header banner.
 * Extends the radar/OSINT theme from the profile image.
 */

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import * as fs from 'fs';
import * as path from 'path';

const WIDTH = 1500;
const HEIGHT = 500;

async function main() {
  const fontPath = path.resolve('public/fonts/JetBrainsMono-Regular.ttf');
  const fontData = fs.readFileSync(fontPath);

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: WIDTH,
          height: HEIGHT,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0d1117',
          fontFamily: 'JetBrains Mono',
          color: '#e6edf3',
          position: 'relative',
          overflow: 'hidden',
        },
        children: [
          // Subtle grid lines (horizontal)
          ...Array.from({ length: 8 }, (_, i) => ({
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: i * 70,
                left: 0,
                width: WIDTH,
                height: 1,
                backgroundColor: 'rgba(26, 58, 92, 0.3)',
              },
            },
          })),
          // Subtle grid lines (vertical)
          ...Array.from({ length: 15 }, (_, i) => ({
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: 0,
                left: 100 + i * 100,
                width: 1,
                height: HEIGHT,
                backgroundColor: 'rgba(26, 58, 92, 0.2)',
              },
            },
          })),
          // Radar ring (left side, partial)
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                width: 400,
                height: 400,
                borderRadius: '50%',
                border: '1.5px solid rgba(26, 58, 92, 0.6)',
                left: -50,
                top: 50,
              },
            },
          },
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                width: 250,
                height: 250,
                borderRadius: '50%',
                border: '1px solid rgba(26, 58, 92, 0.5)',
                left: 25,
                top: 125,
              },
            },
          },
          // Radar ring (right side, partial)
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                width: 350,
                height: 350,
                borderRadius: '50%',
                border: '1px solid rgba(26, 58, 92, 0.4)',
                right: -80,
                top: 75,
              },
            },
          },
          // Sweep gradient (left radar)
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                width: 200,
                height: 200,
                left: 100,
                top: 50,
                background: 'linear-gradient(200deg, rgba(88, 166, 255, 0.15) 0%, rgba(88, 166, 255, 0) 60%)',
                transform: 'rotate(10deg)',
              },
            },
          },
          // Blips scattered
          ...[
            { top: 120, left: 180, size: 5, opacity: 0.9 },
            { top: 280, left: 320, size: 4, opacity: 0.6 },
            { top: 160, left: 1250, size: 5, opacity: 0.8 },
            { top: 340, left: 1100, size: 3, opacity: 0.5 },
            { top: 90, left: 900, size: 4, opacity: 0.4 },
            { top: 380, left: 750, size: 3, opacity: 0.3 },
          ].map(blip => ({
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                width: blip.size,
                height: blip.size,
                borderRadius: '50%',
                backgroundColor: `rgba(88, 166, 255, ${blip.opacity})`,
                top: blip.top,
                left: blip.left,
                boxShadow: `0 0 ${blip.size * 2}px rgba(88, 166, 255, ${blip.opacity * 0.5})`,
              },
            },
          })),
          // Top accent bar
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 3,
                background: 'linear-gradient(90deg, #58a6ff, #a371f7, #f778ba, #58a6ff)',
              },
            },
          },
          // Center content
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: 14,
                      color: '#484f58',
                      letterSpacing: '0.3em',
                      marginBottom: 12,
                    },
                    children: 'OSINT INTELLIGENCE PLATFORM',
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: 56,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      color: '#e6edf3',
                    },
                    children: 'WATCHBOARD',
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: 18,
                      color: '#8b949e',
                      marginTop: 12,
                    },
                    children: '48 AI-Powered Intelligence Dashboards',
                  },
                },
                // Feature pills row
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      gap: 12,
                      marginTop: 28,
                    },
                    children: ['3D Globe', 'Interactive Maps', 'Source Tiers', 'Nightly Updates'].map(label => ({
                      type: 'div',
                      props: {
                        style: {
                          border: '1px solid rgba(88, 166, 255, 0.4)',
                          borderRadius: 16,
                          padding: '6px 16px',
                          fontSize: 13,
                          color: '#58a6ff',
                        },
                        children: label,
                      },
                    })),
                  },
                },
              ],
            },
          },
          // Bottom URL
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                bottom: 16,
                right: 24,
                fontSize: 12,
                color: '#484f58',
              },
              children: 'artemiop.com/watchboard',
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

  const outPath = path.resolve('public/header-image.png');
  fs.writeFileSync(outPath, png);
  console.log(`Header image written to ${outPath} (${png.length} bytes)`);
}

main().catch(console.error);
