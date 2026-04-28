/**
 * Re-post today's daily video to Telegram with the same caption logic
 * the daily-video.yml workflow uses. Safe to run after `make video-render`
 * to fix a botched daily post — overwrites nothing, just sends a new message.
 *
 * Usage:
 *   TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHANNEL_ID=@watchboard_dev \
 *     npx tsx scripts/repost-daily-telegram.ts            # breaking
 *     npx tsx scripts/repost-daily-telegram.ts --progress # progress brief
 *     npx tsx scripts/repost-daily-telegram.ts --all      # both, sequentially
 *
 *   With --dry-run prints the caption and exits without sending.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const isProgress = argv.includes('--progress');
const isAll = argv.includes('--all');
const dateArg = argv.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
const date = dateArg ?? new Date().toISOString().slice(0, 10);

const BREAKING_JSON = resolve(ROOT_DIR, 'video/src/data/breaking.json');

if (!existsSync(BREAKING_JSON)) {
  console.error(`Missing ${BREAKING_JSON}`);
  process.exit(1);
}

const breaking = JSON.parse(readFileSync(BREAKING_JSON, 'utf8'));

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function slugTag(slug: string): string {
  return '#' + slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}
function headlineTags(text: string): string[] {
  const STOP = new Set(['The','And','For','With','From','This','That','New','Day','Week','April','March','May','June','July','August','September','October','November','December','January','February','At','In','On','Of','To','By','As','Is','It','Be','Are','An','A','Or','But','If','So','We','You','Our','Their','Its','Has','Have','After','Before','When','While','Where','Why','How','First','Last','Big','Top','Two','Three','Four']);
  const tokens = (text.match(/\b[A-Z][A-Za-z0-9]{1,}(?:\s[A-Z][A-Za-z0-9]+)?\b|\b[A-Z]{2,}\b/g) || [])
    .map(t => t.replace(/\s+/g, ''))
    .filter(t => t.length >= 3 && !STOP.has(t));
  return tokens.map(t => '#' + t);
}

function buildCaption(mode: 'breaking' | 'progress'): string {
  const bullet = mode === 'progress' ? '✅' : '•';
  const header = mode === 'progress' ? '🌱 <b>Watchboard Progress Brief</b>' : '🔴 <b>Watchboard Daily Brief</b>';
  const lines = (breaking.trackers as Array<{ slug: string; name: string; headline?: string }>).map(t => {
    const head = (t.headline || t.name || '').trim();
    return bullet + ' <b>' + escapeHtml(t.name) + '</b>: ' + escapeHtml(head);
  }).join('\n');

  const topical: string[] = [];
  const seen = new Set<string>();
  for (const t of breaking.trackers) {
    const tag = slugTag(t.slug);
    if (!seen.has(tag.toLowerCase())) { topical.push(tag); seen.add(tag.toLowerCase()); }
    if (topical.length >= 4) break;
  }
  if (topical.length < 4) {
    const allHeadlines = breaking.trackers.map((t: any) => t.headline || '').join(' ');
    for (const tag of headlineTags(allHeadlines)) {
      if (seen.has(tag.toLowerCase())) continue;
      topical.push(tag); seen.add(tag.toLowerCase());
      if (topical.length >= 4) break;
    }
  }
  const hashtags = topical.slice(0, 4).join(' ') + ' #Watchboard';
  const tail = mode === 'progress'
    ? "\nScience doesn't take days off.\n🔗 watchboard.dev\n\n"
    : '\n🔗 watchboard.dev\n\n';
  return `${header} — ${date}\n\n${lines}\n${tail}${hashtags}`;
}

function videoPathFor(mode: 'breaking' | 'progress'): string | null {
  // Prefer narrated MP4 when present; fall back to base.
  // render.ts emits '-progress' suffix for positive/progress mode so the two
  // sequential renders don't clobber each other.
  const candidates = mode === 'progress'
    ? [
        `watchboard-${date}-progress-narrated-en.mp4`,
        `watchboard-${date}-progress.mp4`,
      ]
    : [
        `watchboard-${date}-narrated-en.mp4`,
        `watchboard-${date}.mp4`,
      ];
  for (const f of candidates) {
    const p = resolve(ROOT_DIR, 'video/output', f);
    if (existsSync(p)) return p;
  }
  return null;
}

async function postOne(mode: 'breaking' | 'progress'): Promise<boolean> {
  const file = videoPathFor(mode);
  if (!file) {
    console.error(`[${mode}] Video not found in video/output/ for ${date}. Run 'make video-render${mode === 'progress' ? '-progress' : ''}' first.`);
    return false;
  }
  const caption = buildCaption(mode);

  console.log(`───────────── ${mode.toUpperCase()} caption ─────────────`);
  console.log(caption.replace(/<[^>]+>/g, ''));
  console.log('───────────────────────────────────────────');
  console.log(`Video: ${file}`);

  if (dryRun) {
    console.log('(dry run — not sending)\n');
    return true;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHANNEL_ID;
  if (!token || !chatId) {
    console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID env vars.');
    return false;
  }

  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('caption', caption);
  formData.append('parse_mode', 'HTML');
  formData.append('supports_streaming', 'true');
  const buf = readFileSync(file);
  formData.append('video', new Blob([buf], { type: 'video/mp4' }), file.split('/').pop()!);

  const res = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
    method: 'POST',
    body: formData,
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`[${mode}] Telegram API error: ${res.status}\n${body}`);
    return false;
  }
  console.log(`✅ [${mode}] Posted to Telegram.\n`);
  return true;
}

(async () => {
  const modes: Array<'breaking' | 'progress'> = isAll
    ? ['breaking', 'progress']
    : isProgress
      ? ['progress']
      : ['breaking'];

  let allOk = true;
  for (const m of modes) {
    const ok = await postOne(m);
    if (!ok) allOk = false;
  }
  process.exit(allOk ? 0 : 2);
})();
