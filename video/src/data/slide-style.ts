import { z } from 'zod';

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
    topPct: 40,
    width: 852,
    maxHeight: 387,
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
    fontSize: 54,
    fontWeight: 600,
    letterSpacing: 15,
    underlineWidthFinal: 261,
    underlineHeight: 3,
    underlineGlowOpacity: 1,
    nameUnderlineGap: 14,
    blockMarginBottom: 35,
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
    badgePadX: 9,
    badgePadY: 4,
    badgeBorderRadius: 10,
    badgeFontSize: 29,
    badgeFontWeight: 671,
    badgeLetterSpacing: 1,
    sourceFontSize: 32,
    sourceColor: '#9498a8',
    rowGap: 25,
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

// Zod schema mirroring SlideStyle so Remotion Studio renders interactive
// controls in the right "Props" panel. Each numeric field becomes a slider
// (with min/max where it makes sense), strings become text inputs, booleans
// checkboxes, hex colors get a color picker via z.string().
export const slideStyleSchema = z.object({
  imageCard: z.object({
    topPct: z.number().min(0).max(100),
    width: z.number().min(100).max(1080),
    maxHeight: z.number().min(50).max(800),
    borderRadius: z.number().min(0).max(60),
    borderWidthPx: z.number().min(0).max(10),
    glowOpacity: z.number().min(0).max(1),
    shadowBlur: z.number().min(0).max(80),
  }),
  textBlock: z.object({
    topPctWithThumb: z.number().min(0).max(100),
    topPctNoThumb: z.number().min(0).max(100),
    paddingLeft: z.number().min(0).max(300),
    paddingRight: z.number().min(0).max(300),
    paddingTop: z.number().min(0).max(200),
    paddingBottom: z.number().min(0).max(200),
  }),
  trackerName: z.object({
    fontFamily: z.string(),
    fontSize: z.number().min(10).max(120),
    fontWeight: z.number().min(100).max(900),
    letterSpacing: z.number().min(0).max(20),
    underlineWidthFinal: z.number().min(0).max(800),
    underlineHeight: z.number().min(0).max(20),
    underlineGlowOpacity: z.number().min(0).max(1),
    nameUnderlineGap: z.number().min(0).max(40),
    blockMarginBottom: z.number().min(0).max(80),
  }),
  headline: z.object({
    fontFamily: z.string(),
    fontSizeWithThumb: z.number().min(12).max(120),
    fontSizeNoThumb: z.number().min(12).max(140),
    fontWeight: z.number().min(100).max(900),
    color: z.string(),
    lineHeight: z.number().min(0.8).max(2.5),
    maxWidth: z.number().min(200).max(1080),
    marginBottom: z.number().min(0).max(80),
  }),
  kpi: z.object({
    labelFontFamily: z.string(),
    labelFontSize: z.number().min(10).max(80),
    labelFontWeight: z.number().min(100).max(900),
    labelColor: z.string(),
    labelLetterSpacing: z.number().min(0).max(12),
    labelMarginBottom: z.number().min(0).max(50),
    chevronFontSize: z.number().min(10).max(140),
    chevronOpacity: z.number().min(0).max(1),
    chevronGap: z.number().min(0).max(80),
    valueFontFamily: z.string(),
    valueFontSizeWithThumb: z.number().min(20).max(200),
    valueFontSizeNoThumb: z.number().min(20).max(200),
    valueFontWeight: z.number().min(100).max(900),
    valueGlowOuter: z.number().min(0).max(1),
    valueGlowSpread: z.number().min(0).max(1),
  }),
  source: z.object({
    badgePadX: z.number().min(0).max(50),
    badgePadY: z.number().min(0).max(30),
    badgeBorderRadius: z.number().min(0).max(40),
    badgeFontSize: z.number().min(8).max(50),
    badgeFontWeight: z.number().min(100).max(900),
    badgeLetterSpacing: z.number().min(0).max(8),
    sourceFontSize: z.number().min(8).max(50),
    sourceColor: z.string(),
    rowGap: z.number().min(0).max(50),
  }),
  breakthrough: z.object({
    enabled: z.boolean(),
    top: z.number().min(0).max(300),
    right: z.number().min(0).max(300),
    paddingX: z.number().min(0).max(60),
    paddingY: z.number().min(0).max(40),
    borderRadius: z.number().min(0).max(80),
    fontSize: z.number().min(8).max(60),
    fontWeight: z.number().min(100).max(900),
    color: z.string(),
    letterSpacing: z.number().min(0).max(10),
  }),
  animation: z.object({
    enterSpringDamping: z.number().min(1).max(60),
    enterSpringStiffness: z.number().min(20).max(400),
    enterSpringMass: z.number().min(0.1).max(5),
    enterDurationFrames: z.number().min(1).max(120),
    exitDurationFrames: z.number().min(1).max(120),
    headlineDelayFrames: z.number().min(0).max(120),
    kpiDelayFrames: z.number().min(0).max(120),
    sourceDelayFrames: z.number().min(0).max(120),
    imageDelayFrames: z.number().min(0).max(120),
  }),
});

// ─────────────────────────────────────────────────────────────────────
// Intro / Outro styling
// ─────────────────────────────────────────────────────────────────────

export interface IntroStyle {
  // Vertical offset of the whole intro block from canvas center (px).
  // Negative = up, positive = down. Default 0 = centered.
  verticalOffset: number;
  logoFontFamily: string;
  logoFontSize: number;
  logoFontWeight: number;
  logoLetterSpacing: number;
  logoColorDark: string;
  logoColorDay: string;
  logoMarginBottom: number;
  glowMin: number;
  glowMax: number;
  lineWidthFinal: number;
  lineHeight: number;
  lineMarginBottom: number;
  subtitleFontFamily: string;
  subtitleFontSizeDark: number;
  subtitleFontSizeDay: number;
  subtitleFontWeight: number;
  subtitleColorDark: string;
  subtitleColorDay: string;
  subtitleLetterSpacingDark: number;
  subtitleLetterSpacingDay: number;
  subtitleMarginBottom: number;
  subtitleTextDark: string;
  subtitleTextDay: string;
  dateFontFamily: string;
  dateFontSizeDark: number;
  dateFontSizeDay: number;
  dateFontWeight: number;
  dateColorDark: string;
  dateColorDay: string;
  dateLetterSpacing: number;
  fadeInFrames: number;
  logoDelayFrames: number;
  subtitleDelayFrames: number;
  dateDelayFrames: number;
  lineGrowEndFrame: number;
}

export const DEFAULT_INTRO_STYLE: IntroStyle = {
  verticalOffset: 198,
  logoFontFamily: "'DM Sans', sans-serif",
  logoFontSize: 96,
  logoFontWeight: 700,
  logoLetterSpacing: 10,
  logoColorDark: '#e74c3c',
  logoColorDay: '#ffffff',
  logoMarginBottom: 80,
  glowMin: 17,
  glowMax: 37,
  lineWidthFinal: 299,
  lineHeight: 3,
  lineMarginBottom: 61,
  subtitleFontFamily: "'JetBrains Mono', monospace",
  subtitleFontSizeDark: 50,
  subtitleFontSizeDay: 50,
  subtitleFontWeight: 600,
  subtitleColorDark: '#9498a8',
  subtitleColorDay: '#f0c060',
  subtitleLetterSpacingDark: 8,
  subtitleLetterSpacingDay: 8,
  subtitleMarginBottom: 62,
  subtitleTextDark: 'DAILY INTELLIGENCE BRIEF',
  subtitleTextDay: 'PROGRESS BRIEF',
  dateFontFamily: "'JetBrains Mono', monospace",
  dateFontSizeDark: 70,
  dateFontSizeDay: 70,
  dateFontWeight: 539,
  dateColorDark: '#e8e9ed',
  dateColorDay: 'rgba(255,255,255,0.6)',
  dateLetterSpacing: 5,
  fadeInFrames: 15,
  logoDelayFrames: 8,
  subtitleDelayFrames: 30,
  dateDelayFrames: 50,
  lineGrowEndFrame: 55,
};

export const introStyleSchema = z.object({
  verticalOffset: z.number().min(-800).max(800),
  logoFontFamily: z.string(),
  logoFontSize: z.number().min(20).max(200),
  logoFontWeight: z.number().min(100).max(900),
  logoLetterSpacing: z.number().min(0).max(20),
  logoColorDark: z.string(),
  logoColorDay: z.string(),
  logoMarginBottom: z.number().min(0).max(80),
  glowMin: z.number().min(0).max(80),
  glowMax: z.number().min(0).max(150),
  lineWidthFinal: z.number().min(50).max(800),
  lineHeight: z.number().min(0).max(20),
  lineMarginBottom: z.number().min(0).max(100),
  subtitleFontFamily: z.string(),
  subtitleFontSizeDark: z.number().min(10).max(80),
  subtitleFontSizeDay: z.number().min(10).max(80),
  subtitleFontWeight: z.number().min(100).max(900),
  subtitleColorDark: z.string(),
  subtitleColorDay: z.string(),
  subtitleLetterSpacingDark: z.number().min(0).max(20),
  subtitleLetterSpacingDay: z.number().min(0).max(20),
  subtitleMarginBottom: z.number().min(0).max(80),
  subtitleTextDark: z.string(),
  subtitleTextDay: z.string(),
  dateFontFamily: z.string(),
  dateFontSizeDark: z.number().min(10).max(80),
  dateFontSizeDay: z.number().min(10).max(80),
  dateFontWeight: z.number().min(100).max(900),
  dateColorDark: z.string(),
  dateColorDay: z.string(),
  dateLetterSpacing: z.number().min(0).max(20),
  fadeInFrames: z.number().min(0).max(60),
  logoDelayFrames: z.number().min(0).max(60),
  subtitleDelayFrames: z.number().min(0).max(120),
  dateDelayFrames: z.number().min(0).max(120),
  lineGrowEndFrame: z.number().min(0).max(120),
});

export interface OutroStyle {
  // Vertical offset of the whole outro block from canvas center (px).
  // Negative = up, positive = down. Default 0 = centered.
  verticalOffset: number;
  urlFontFamily: string;
  urlFontSize: number;
  urlFontWeight: number;
  urlColor: string;
  urlLetterSpacing: number;
  lineWidthFinal: number;
  lineHeight: number;
  statsFontFamily: string;
  statsFontSize: number;
  statsFontWeight: number;
  statsColor: string;
  statsLetterSpacing: number;
  statsLineHeight: number;
  daySubLabel: string;
  daySubFontSize: number;
  daySubColor: string;
  daySubMarginTop: number;
  rowGap: number;
  fadeOutStartFrame: number;
  fadeOutEndFrame: number;
  lineGrowEndFrame: number;
  urlDelayFrames: number;
  statsDelayFrames: number;
}

export const DEFAULT_OUTRO_STYLE: OutroStyle = {
  verticalOffset: 30,
  urlFontFamily: "'DM Sans', sans-serif",
  urlFontSize: 94,
  urlFontWeight: 700,
  urlColor: '#e8e9ed',
  urlLetterSpacing: 2,
  lineWidthFinal: 320,
  lineHeight: 2,
  statsFontFamily: "'JetBrains Mono', monospace",
  statsFontSize: 28,
  statsFontWeight: 500,
  statsColor: '#9498a8',
  statsLetterSpacing: 2,
  statsLineHeight: 2,
  daySubLabel: "SCIENCE DOESN'T TAKE DAYS OFF",
  daySubFontSize: 16,
  daySubColor: '#f0a500',
  daySubMarginTop: 8,
  rowGap: 32,
  fadeOutStartFrame: 120,
  fadeOutEndFrame: 148,
  lineGrowEndFrame: 45,
  urlDelayFrames: 20,
  statsDelayFrames: 40,
};

export const outroStyleSchema = z.object({
  verticalOffset: z.number().min(-800).max(800),
  urlFontFamily: z.string(),
  urlFontSize: z.number().min(20).max(200),
  urlFontWeight: z.number().min(100).max(900),
  urlColor: z.string(),
  urlLetterSpacing: z.number().min(0).max(20),
  lineWidthFinal: z.number().min(50).max(800),
  lineHeight: z.number().min(0).max(20),
  statsFontFamily: z.string(),
  statsFontSize: z.number().min(10).max(80),
  statsFontWeight: z.number().min(100).max(900),
  statsColor: z.string(),
  statsLetterSpacing: z.number().min(0).max(20),
  statsLineHeight: z.number().min(0.8).max(3),
  daySubLabel: z.string(),
  daySubFontSize: z.number().min(8).max(60),
  daySubColor: z.string(),
  daySubMarginTop: z.number().min(0).max(60),
  rowGap: z.number().min(0).max(120),
  fadeOutStartFrame: z.number().min(0).max(300),
  fadeOutEndFrame: z.number().min(0).max(300),
  lineGrowEndFrame: z.number().min(0).max(120),
  urlDelayFrames: z.number().min(0).max(120),
  statsDelayFrames: z.number().min(0).max(120),
});
