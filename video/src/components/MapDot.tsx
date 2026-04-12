import React from 'react';
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';

interface MapDotProps {
  /** [lat, lng] coordinates for the pulsing dot */
  center: [number, number];
  /** Frame at which the map appears */
  startFrame: number;
  accentColor: string;
}

/**
 * Simplified world map SVG with a pulsing dot at the given coordinates.
 * Uses Plate Carree projection: x maps to longitude, y maps to latitude.
 * viewBox covers -180 to 180 longitude, -90 to 90 latitude (inverted Y).
 */
export const MapDot: React.FC<MapDotProps> = ({ center, startFrame, accentColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const localFrame = frame - startFrame;

  const entryProgress = spring({
    frame: Math.max(0, localFrame),
    fps,
    config: { damping: 16, stiffness: 100, mass: 1 },
  });

  const mapOpacity = interpolate(entryProgress, [0, 1], [0, 1]);
  const mapScale = interpolate(entryProgress, [0, 1], [0.9, 1]);

  // Convert lat/lng to SVG coordinates
  // viewBox: 0 0 360 180, where x=lng+180, y=90-lat
  const dotX = center[1] + 180;
  const dotY = 90 - center[0];

  // Pulsing rings
  const pulse1 = interpolate(Math.sin(localFrame * 0.1), [-1, 1], [8, 14]);
  const pulse2 = interpolate(Math.sin(localFrame * 0.1 + 1), [-1, 1], [16, 26]);
  const pulse3 = interpolate(Math.sin(localFrame * 0.1 + 2), [-1, 1], [28, 40]);

  const ringOpacity1 = interpolate(Math.sin(localFrame * 0.1), [-1, 1], [0.4, 0.6]);
  const ringOpacity2 = interpolate(Math.sin(localFrame * 0.1 + 1), [-1, 1], [0.2, 0.35]);
  const ringOpacity3 = interpolate(Math.sin(localFrame * 0.1 + 2), [-1, 1], [0.08, 0.18]);

  return (
    <div
      style={{
        opacity: mapOpacity,
        transform: `scale(${mapScale})`,
        width: 420,
        height: 300,
        position: 'relative',
      }}
    >
      <svg viewBox="0 0 360 180" width="420" height="300" style={{ overflow: 'visible' }}>
        {/* Simplified world map continents */}
        <g fill="none" stroke="#2a2d3a" strokeWidth="0.6" opacity="0.7">
          {/* North America */}
          <path d="M40,25 L55,18 L72,20 L82,28 L90,22 L105,25 L110,35 L115,45 L108,52 L100,55 L95,62 L88,68 L82,70 L78,65 L70,60 L62,55 L55,52 L48,48 L42,40 L38,32 Z" />
          {/* Central America & Caribbean */}
          <path d="M70,60 L75,65 L80,70 L78,75 L74,72 L70,68 Z" />
          {/* South America */}
          <path d="M88,72 L95,70 L102,75 L108,82 L112,90 L115,100 L118,110 L116,120 L110,130 L104,138 L98,142 L92,140 L88,132 L85,120 L82,110 L80,100 L82,90 L85,80 Z" />
          {/* Europe */}
          <path d="M160,20 L165,22 L172,18 L180,20 L185,25 L190,22 L195,28 L192,35 L188,38 L182,40 L175,42 L170,38 L165,35 L160,32 L158,28 Z" />
          {/* Africa */}
          <path d="M165,52 L172,48 L180,50 L190,52 L198,58 L202,65 L205,75 L206,85 L204,95 L200,105 L195,112 L188,118 L180,120 L175,115 L170,108 L166,98 L164,88 L162,78 L160,68 L162,58 Z" />
          {/* Asia */}
          <path d="M195,18 L210,15 L225,12 L240,15 L255,18 L270,20 L280,25 L290,22 L300,28 L305,35 L300,42 L292,45 L285,48 L278,50 L270,48 L262,52 L255,55 L248,52 L240,48 L232,50 L225,48 L220,42 L215,38 L210,35 L205,32 L200,28 L195,25 Z" />
          {/* India */}
          <path d="M232,50 L240,55 L245,62 L242,70 L236,75 L230,70 L228,62 L230,55 Z" />
          {/* Southeast Asia */}
          <path d="M262,52 L268,56 L272,62 L270,68 L265,65 L260,58 Z" />
          {/* Indonesia */}
          <path d="M268,72 L275,70 L282,72 L288,74 L292,72 L296,75 L290,78 L282,80 L274,78 L268,76 Z" />
          {/* Australia */}
          <path d="M278,100 L295,95 L310,98 L318,105 L320,115 L315,122 L305,128 L295,130 L285,126 L278,118 L275,110 L276,105 Z" />
          {/* Greenland */}
          <path d="M115,8 L128,5 L138,8 L140,15 L135,20 L125,22 L118,18 L115,12 Z" />
          {/* Japan */}
          <path d="M298,32 L302,28 L305,32 L303,38 L300,42 L298,38 Z" />
        </g>

        {/* Pulsing dot rings */}
        <circle cx={dotX} cy={dotY} r={pulse3} fill="none" stroke={accentColor} strokeWidth="0.5" opacity={ringOpacity3} />
        <circle cx={dotX} cy={dotY} r={pulse2} fill="none" stroke={accentColor} strokeWidth="0.7" opacity={ringOpacity2} />
        <circle cx={dotX} cy={dotY} r={pulse1} fill="none" stroke={accentColor} strokeWidth="1" opacity={ringOpacity1} />

        {/* Center dot with glow */}
        <circle cx={dotX} cy={dotY} r="5" fill={accentColor} opacity="0.3" />
        <circle cx={dotX} cy={dotY} r="3" fill={accentColor} opacity="0.7" />
        <circle cx={dotX} cy={dotY} r="1.5" fill="#ffffff" opacity="0.9" />
      </svg>
    </div>
  );
};
