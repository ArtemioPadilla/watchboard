/**
 * newsletter-generate.ts — Generate HTML newsletter from weekly digest data.
 *
 * Reads all active trackers, collects their latest digest entries from the past 7 days,
 * and generates a dark-themed HTML email matching the Watchboard site design.
 *
 * Output: dist/newsletter/latest.html
 *
 * Run: npx tsx scripts/newsletter-generate.ts
 */

import fs from 'node:fs';
import path from 'node:path';

// ── Types ──

interface TrackerConfig {
  slug: string;
  name: string;
  shortName?: string;
  icon: string;
  color: string;
  status: 'active' | 'archived' | 'draft';
  description: string;
}

interface DigestEntry {
  date: string;
  title: string;
  summary: string;
  sectionsUpdated?: string[];
  source?: string;
}

interface KpiEntry {
  id: string;
  label: string;
  value: string;
  color?: string;
  delta?: string;
  trend?: string;
}

interface MetaEntry {
  heroHeadline?: string;
  dayCount?: number;
  dateline?: string;
  lastUpdated?: string;
}

interface TrackerSection {
  tracker: TrackerConfig;
  headline: string;
  kpis: KpiEntry[];
  digestEntries: DigestEntry[];
}

// ── Constants ──

const TRACKERS_DIR = path.resolve('trackers');
const OUTPUT_DIR = path.resolve('dist/newsletter');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'latest.html');
const SITE_URL = 'https://watchboard.dev';
const PUSH_URL = 'https://push.watchboard.dev';

// ── Helpers ──

function loadJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function getRecentDigests(digests: DigestEntry[], days = 7): DigestEntry[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return digests.filter(d => d.date >= cutoffStr);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

// ── Collect tracker data ──

function collectSections(): TrackerSection[] {
  const sections: TrackerSection[] = [];
  const trackerDirs = fs.readdirSync(TRACKERS_DIR).filter(d =>
    fs.statSync(path.join(TRACKERS_DIR, d)).isDirectory()
  );

  for (const dir of trackerDirs) {
    const config = loadJson<TrackerConfig>(path.join(TRACKERS_DIR, dir, 'tracker.json'));
    if (!config || config.status !== 'active') continue;

    const digests = loadJson<DigestEntry[]>(path.join(TRACKERS_DIR, dir, 'data/digests.json'));
    const kpis = loadJson<KpiEntry[]>(path.join(TRACKERS_DIR, dir, 'data/kpis.json'));
    const meta = loadJson<MetaEntry>(path.join(TRACKERS_DIR, dir, 'data/meta.json'));

    const recentDigests = digests ? getRecentDigests(digests) : [];
    if (recentDigests.length === 0) continue;

    const headline = meta?.heroHeadline
      ? meta.heroHeadline.replace(/<[^>]+>/g, '').trim()
      : recentDigests[0]?.title || config.description;

    sections.push({
      tracker: config,
      headline,
      kpis: (kpis || []).slice(0, 3),
      digestEntries: recentDigests.slice(0, 3),
    });
  }

  // Sort by number of recent digests (most active first)
  sections.sort((a, b) => b.digestEntries.length - a.digestEntries.length);
  return sections;
}

// ── HTML Generation ──

function kpiColorToHex(color?: string): string {
  const map: Record<string, string> = {
    red: '#e74c3c',
    amber: '#f39c12',
    blue: '#3498db',
    green: '#2ecc71',
    purple: '#a86cc1',
    cyan: '#1abc9c',
  };
  return map[color || ''] || '#9498a8';
}

function renderKpi(kpi: KpiEntry): string {
  const color = kpiColorToHex(kpi.color);
  return `
    <td style="padding:8px 12px;text-align:center;border:1px solid #2a2d3a;">
      <div style="font-size:20px;font-weight:700;color:${color};font-family:'JetBrains Mono',monospace;">${escapeHtml(kpi.value)}</div>
      <div style="font-size:11px;color:#9498a8;margin-top:2px;">${escapeHtml(kpi.label)}</div>
      ${kpi.delta ? `<div style="font-size:10px;color:#9498a8;margin-top:1px;">${escapeHtml(kpi.delta)}</div>` : ''}
    </td>`;
}

function renderSection(section: TrackerSection): string {
  const { tracker, headline, kpis, digestEntries } = section;
  const trackerUrl = `${SITE_URL}/${tracker.slug}/`;

  const kpiHtml = kpis.length > 0
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0;border-collapse:collapse;background:#12141a;border-radius:6px;">
        <tr>${kpis.map(renderKpi).join('')}</tr>
      </table>`
    : '';

  const digestHtml = digestEntries.map(d => `
    <tr>
      <td style="padding:6px 0;border-bottom:1px solid #1e2130;">
        <span style="color:#9498a8;font-size:11px;font-family:'JetBrains Mono',monospace;">${formatDate(d.date)}</span>
        <div style="color:#e8e9ed;font-size:13px;margin-top:2px;">${escapeHtml(d.title)}</div>
      </td>
    </tr>`).join('');

  return `
    <!-- Tracker Section: ${escapeHtml(tracker.name)} -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;background:#181b23;border:1px solid #2a2d3a;border-radius:8px;border-left:3px solid ${tracker.color};">
      <tr>
        <td style="padding:16px 20px;">
          <!-- Header -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <a href="${trackerUrl}" style="text-decoration:none;">
                  <span style="font-size:20px;vertical-align:middle;">${tracker.icon}</span>
                  <span style="font-size:16px;font-weight:700;color:${tracker.color};vertical-align:middle;margin-left:6px;">${escapeHtml(tracker.shortName || tracker.name)}</span>
                </a>
              </td>
            </tr>
          </table>

          <!-- Headline -->
          <div style="font-size:14px;color:#e8e9ed;margin:10px 0 4px 0;line-height:1.4;">
            ${escapeHtml(headline)}
          </div>

          <!-- KPIs -->
          ${kpiHtml}

          <!-- Recent Digests -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
            ${digestHtml}
          </table>

          <!-- CTA -->
          <div style="margin-top:12px;">
            <a href="${trackerUrl}" style="display:inline-block;padding:6px 16px;background:${tracker.color};color:#fff;text-decoration:none;border-radius:4px;font-size:12px;font-weight:600;">View Tracker →</a>
          </div>
        </td>
      </tr>
    </table>`;
}

function generateNewsletter(sections: TrackerSection[]): string {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  const dateRange = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const trackerCount = sections.length;
  const totalDigests = sections.reduce((sum, s) => sum + s.digestEntries.length, 0);

  const sectionsHtml = sections.map(renderSection).join('\n');

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>Watchboard Weekly Digest — ${dateRange}</title>
  <!--[if mso]>
  <style>table,td{font-family:Arial,sans-serif!important}</style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:#0a0b0e;color:#e8e9ed;font-family:'DM Sans',Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <!-- Preheader -->
  <div style="display:none;max-height:0;overflow:hidden;">
    Weekly intelligence digest: ${trackerCount} trackers, ${totalDigests} updates — ${dateRange}
  </div>

  <!-- Main Container -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0b0e;">
    <tr>
      <td align="center" style="padding:20px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;">

          <!-- Header -->
          <tr>
            <td style="padding:24px 20px;text-align:center;border-bottom:1px solid #2a2d3a;">
              <a href="${SITE_URL}" style="text-decoration:none;">
                <span style="font-size:24px;font-weight:700;color:#e74c3c;letter-spacing:-0.5px;">🔴 WATCHBOARD</span>
              </a>
              <div style="font-size:13px;color:#9498a8;margin-top:6px;">Weekly Intelligence Digest</div>
              <div style="font-size:11px;color:#6b6f82;margin-top:2px;">${dateRange}</div>
            </td>
          </tr>

          <!-- Summary Bar -->
          <tr>
            <td style="padding:16px 20px;background:#12141a;border:1px solid #2a2d3a;border-radius:6px;margin:16px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="text-align:center;padding:4px;">
                    <span style="font-size:20px;font-weight:700;color:#e74c3c;">${trackerCount}</span>
                    <div style="font-size:10px;color:#9498a8;">Active Trackers</div>
                  </td>
                  <td style="text-align:center;padding:4px;">
                    <span style="font-size:20px;font-weight:700;color:#f39c12;">${totalDigests}</span>
                    <div style="font-size:10px;color:#9498a8;">Updates This Week</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Spacer -->
          <tr><td style="height:20px;"></td></tr>

          <!-- Tracker Sections -->
          <tr>
            <td>
              ${sectionsHtml}
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:20px;text-align:center;">
              <a href="${SITE_URL}" style="display:inline-block;padding:12px 32px;background:#e74c3c;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:700;">Explore All Trackers →</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 20px;text-align:center;border-top:1px solid #2a2d3a;">
              <div style="font-size:11px;color:#6b6f82;line-height:1.6;">
                <a href="${SITE_URL}" style="color:#9498a8;text-decoration:underline;">Watchboard</a> — Open-source intelligence dashboards
                <br>
                You received this because you subscribed to the weekly digest.
                <br>
                <a href="${PUSH_URL}/newsletter/unsubscribe?email={{EMAIL}}" style="color:#9498a8;text-decoration:underline;">Unsubscribe</a>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Main ──

function main() {
  console.log('📰 Generating weekly newsletter...');

  const sections = collectSections();
  if (sections.length === 0) {
    console.log('⚠️  No active trackers with recent digests found. Skipping.');
    process.exit(0);
  }

  console.log(`Found ${sections.length} trackers with recent updates`);

  const html = generateNewsletter(sections);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, html, 'utf-8');

  const sizeKb = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`✅ Newsletter generated: ${OUTPUT_FILE} (${sizeKb} KB)`);
  console.log(`   Trackers: ${sections.map(s => s.tracker.slug).join(', ')}`);
}

main();
