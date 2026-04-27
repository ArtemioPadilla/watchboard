/**
 * SlideStyle — every tunable typography / position / sizing value that
 * TrackerSlide.tsx renders, lifted out as a single prop so Remotion
 * Studio's "Default Props" panel can edit them live.
 *
 * Defaults match the production video pixel-for-pixel.
 */
export interface SlideStyle {
  // Image card (popup at 42% top, only when thumbnail is present)
  imageCard: {
    topPct: number;        // % of canvas height
    width: number;         // px
    maxHeight: number;     // px
    borderRadius: number;
    borderWidthPx: number;
    glowOpacity: number;   // 0..1 — accent border glow alpha
    shadowBlur: number;    // px — drop shadow blur radius
  };

  // Text block container — bottom half of canvas
  textBlock: {
    topPctWithThumb: number;
    topPctNoThumb: number;
    paddingLeft: number;
    paddingRight: number;
    paddingTop: number;
    paddingBottom: number;
  };

  // Tracker name (uppercase, accent color, with growing underline)
  trackerName: {
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    letterSpacing: number;
    underlineWidthFinal: number;
    underlineHeight: number;
    underlineGlowOpacity: number;
    nameUnderlineGap: number;
    blockMarginBottom: number;
  };

  // Headline (DM Sans, white, centered)
  headline: {
    fontFamily: string;
    fontSizeWithThumb: number;
    fontSizeNoThumb: number;
    fontWeight: number;
    color: string;
    lineHeight: number;
    maxWidth: number;
    marginBottom: number;
  };

  // KPI block (label + chevrons + big value)
  kpi: {
    labelFontFamily: string;
    labelFontSize: number;
    labelFontWeight: number;
    labelColor: string;
    labelLetterSpacing: number;
    labelMarginBottom: number;
    chevronFontSize: number;
    chevronOpacity: number;
    chevronGap: number;
    valueFontFamily: string;
    valueFontSizeWithThumb: number;
    valueFontSizeNoThumb: number;
    valueFontWeight: number;
    valueGlowOuter: number; // 0..1 alpha for "0 0 40px <accent>"
    valueGlowSpread: number; // 0..1 alpha for "0 0 80px <accent>"
  };

  // Source row (tier badge + label, bottom)
  source: {
    badgePadX: number;
    badgePadY: number;
    badgeBorderRadius: number;
    badgeFontSize: number;
    badgeFontWeight: number;
    badgeLetterSpacing: number;
    sourceFontSize: number;
    sourceColor: string;
    rowGap: number;
  };

  // BREAKTHROUGH badge (only in day theme)
  breakthrough: {
    enabled: boolean;
    top: number;
    right: number;
    paddingX: number;
    paddingY: number;
    borderRadius: number;
    fontSize: number;
    fontWeight: number;
    color: string;
    letterSpacing: number;
  };

  // Animation timing — controls when each element animates in
  animation: {
    enterSpringDamping: number;
    enterSpringStiffness: number;
    enterSpringMass: number;
    enterDurationFrames: number;
    exitDurationFrames: number;
    headlineDelayFrames: number;
    kpiDelayFrames: number;
    sourceDelayFrames: number;
    imageDelayFrames: number;
  };
}

export const DEFAULT_SLIDE_STYLE: SlideStyle = {
  imageCard: {
    topPct: 42,
    width: 400,
    maxHeight: 200,
    borderRadius: 8,
    borderWidthPx: 2,
    glowOpacity: 0.25,
    shadowBlur: 24,
  },
  textBlock: {
    topPctWithThumb: 62,
    topPctNoThumb: 55,
    paddingLeft: 70,
    paddingRight: 70,
    paddingTop: 10,
    paddingBottom: 30,
  },
  trackerName: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 34,
    fontWeight: 600,
    letterSpacing: 4,
    underlineWidthFinal: 160,
    underlineHeight: 3,
    underlineGlowOpacity: 0.5,
    nameUnderlineGap: 8,
    blockMarginBottom: 14,
  },
  headline: {
    fontFamily: "'DM Sans', sans-serif",
    fontSizeWithThumb: 42,
    fontSizeNoThumb: 48,
    fontWeight: 700,
    color: '#e8e9ed',
    lineHeight: 1.25,
    maxWidth: 940,
    marginBottom: 18,
  },
  kpi: {
    labelFontFamily: "'JetBrains Mono', monospace",
    labelFontSize: 22,
    labelFontWeight: 500,
    labelColor: '#9498a8',
    labelLetterSpacing: 3,
    labelMarginBottom: 6,
    chevronFontSize: 48,
    chevronOpacity: 0.5,
    chevronGap: 16,
    valueFontFamily: "'DM Sans', sans-serif",
    valueFontSizeWithThumb: 56,
    valueFontSizeNoThumb: 72,
    valueFontWeight: 700,
    valueGlowOuter: 0.38,
    valueGlowSpread: 0.19,
  },
  source: {
    badgePadX: 12,
    badgePadY: 4,
    badgeBorderRadius: 4,
    badgeFontSize: 20,
    badgeFontWeight: 600,
    badgeLetterSpacing: 1,
    sourceFontSize: 20,
    sourceColor: '#9498a8',
    rowGap: 10,
  },
  breakthrough: {
    enabled: true,
    top: 48,
    right: 36,
    paddingX: 20,
    paddingY: 8,
    borderRadius: 32,
    fontSize: 18,
    fontWeight: 700,
    color: '#f0c060',
    letterSpacing: 3,
  },
  animation: {
    enterSpringDamping: 14,
    enterSpringStiffness: 120,
    enterSpringMass: 0.8,
    enterDurationFrames: 20,
    exitDurationFrames: 15,
    headlineDelayFrames: 20,
    kpiDelayFrames: 35,
    sourceDelayFrames: 50,
    imageDelayFrames: 20,
  },
};

/** Convert a hex color (#RRGGBB) + alpha (0..1) into rgba(). */
export function alpha(hex: string, a: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return `rgba(255,255,255,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}
