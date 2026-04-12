import { useState, useEffect, useMemo, useCallback } from 'react';
import { t, getPreferredLocale } from '../../i18n/translations';
import type { Locale } from '../../i18n/translations';

/* ── Types (mirror scripts/social-types.ts for client) ── */

type TweetType = 'digest' | 'breaking' | 'hot_take' | 'thread' | 'data_viz' | 'meme';
type Voice = 'analyst' | 'journalist' | 'edgy' | 'witty';
type Verdict = 'PUBLISH' | 'REVIEW' | 'HOLD' | 'KILL';
type FactCheckStatus = 'verified' | 'warning' | 'unverifiable' | 'failed';
type QueueStatus = 'auto_approved' | 'pending_review' | 'held' | 'approved' | 'rejected' | 'posted';

interface FactCheck {
  claim: string;
  status: FactCheckStatus;
  source: string;
}

interface JudgeAssessment {
  score: number;
  verdict: Verdict;
  comment: string;
  factChecks: FactCheck[];
}

interface QueueEntry {
  id: string;
  type: TweetType;
  voice: Voice;
  tracker: string;
  lang: string;
  text: string;
  hashtags: string[];
  link: string;
  image: string | null;
  memegenUrl: string | null;
  publishAt: string;
  status: QueueStatus;
  estimatedCost: number;
  judge: JudgeAssessment;
  threadTweets: string[] | null;
  tweetId: string | null;
  postedAt: string | null;
}

interface BudgetData {
  monthlyTarget: number;
  currentMonth: string;
  spent: number;
  tweetsPosted: number;
  remaining: number;
}

interface HistoryEntry {
  tweetId: string;
  date: string;
  tracker: string;
  type: TweetType;
  voice: Voice;
  lang: string;
  text: string;
  cost: number;
  utmClicks: number;
  publishedAt: string;
}

/* ── Legacy queue format (simple social posts from nightly pipeline) ── */

interface LegacyQueueEntry {
  platform: string;
  trackerSlug: string;
  trackerName: string;
  text: string;
  hashtags: string[];
  link: string;
  date: string;
}

/* ── Props ── */

interface Props {
  basePath: string;
  githubRepo: string;
}

/* ── Constants ── */

const VERDICT_COLORS: Record<Verdict, string> = {
  PUBLISH: '#3fb950',
  REVIEW: '#d29922',
  HOLD: '#8b949e',
  KILL: '#f85149',
};

const TYPE_COLORS: Record<TweetType, string> = {
  digest: '#58a6ff',
  breaking: '#f85149',
  hot_take: '#f778ba',
  thread: '#a371f7',
  data_viz: '#3fb950',
  meme: '#d29922',
};

const FC_ICONS: Record<FactCheckStatus, string> = {
  verified: '\u2713',
  warning: '\u26A0',
  unverifiable: '?',
  failed: '\u2717',
};

const FC_COLORS: Record<FactCheckStatus, string> = {
  verified: '#3fb950',
  warning: '#d29922',
  unverifiable: '#8b949e',
  failed: '#f85149',
};

const STATUS_FILTERS: Array<{ key: string; labelKey: string }> = [
  { key: 'all', labelKey: 'social.filterAll' },
  { key: 'auto_approved', labelKey: 'social.filterAuto' },
  { key: 'pending_review', labelKey: 'social.filterReview' },
  { key: 'expired', labelKey: 'social.filterExpired' },
  { key: 'held', labelKey: 'social.filterHeld' },
  { key: 'approved', labelKey: 'social.filterApproved' },
  { key: 'rejected', labelKey: 'social.filterRejected' },
  { key: 'posted', labelKey: 'social.filterPosted' },
];

const TYPE_FILTERS: Array<{ key: string; labelKey: string }> = [
  { key: 'all', labelKey: 'social.filterAllTypes' },
  { key: 'digest', labelKey: 'social.typeDigest' },
  { key: 'breaking', labelKey: 'social.typeBreaking' },
  { key: 'hot_take', labelKey: 'social.typeHotTake' },
  { key: 'thread', labelKey: 'social.typeThread' },
  { key: 'data_viz', labelKey: 'social.typeDataViz' },
  { key: 'meme', labelKey: 'social.typeMeme' },
];

/* ── Helpers ── */

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function isFullQueueEntry(entry: unknown): entry is QueueEntry {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    'id' in entry &&
    'judge' in entry &&
    'status' in entry
  );
}

function normalizeLegacyEntry(entry: LegacyQueueEntry, index: number): QueueEntry {
  return {
    id: `legacy-${entry.trackerSlug}-${index}`,
    type: 'digest',
    voice: 'analyst',
    tracker: entry.trackerSlug,
    lang: 'en',
    text: entry.text,
    hashtags: entry.hashtags,
    link: entry.link,
    image: null,
    memegenUrl: null,
    publishAt: `${entry.date}T12:00:00Z`,
    status: 'pending_review',
    estimatedCost: 0.002,
    judge: {
      score: 0.70,
      verdict: 'REVIEW',
      comment: 'Legacy format — not yet processed by LLM judge.',
      factChecks: [],
    },
    threadTweets: null,
    tweetId: null,
    postedAt: null,
  };
}

function normalizeQueue(raw: unknown[]): QueueEntry[] {
  return raw.map((entry, i) => {
    if (isFullQueueEntry(entry)) return entry as QueueEntry;
    return normalizeLegacyEntry(entry as LegacyQueueEntry, i);
  });
}

function highlightTweetText(text: string): JSX.Element[] {
  const parts: JSX.Element[] = [];
  const regex = /(#\w+|https?:\/\/\S+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    const token = match[0];
    if (token.startsWith('#')) {
      parts.push(
        <span key={key++} className="scc-x-hashtag">
          {token}
        </span>,
      );
    } else {
      parts.push(
        <span key={key++} className="scc-x-link">
          {token}
        </span>,
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }
  return parts;
}

function scoreColor(score: number): string {
  // Normalize: scores from the pipeline are 0.0–1.0, legacy entries may be 0–100
  const s = score <= 1 ? score * 100 : score;
  if (s >= 80) return '#3fb950';
  if (s >= 60) return '#d29922';
  return '#f85149';
}

/* ── SVGs ── */

function XLogoSvg({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="#e7e9ea">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function VerifiedBadgeSvg() {
  return (
    <svg viewBox="0 0 22 22" width={18} height={18} className="scc-x-verified">
      <path
        fill="#1d9bf0"
        d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.607-.274 1.264-.144 1.897.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.706 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"
      />
    </svg>
  );
}

/* ── Tabs ── */

type TabId = 'overview' | 'queue' | 'activity';

const TABS: Array<{ id: TabId; labelKey: string }> = [
  { id: 'overview', labelKey: 'social.tabOverview' },
  { id: 'activity', labelKey: 'social.tabActivity' },
  { id: 'queue', labelKey: 'social.tabQueue' },
];

/* ── Tracker colors ── */

const TRACKER_COLORS: Record<string, string> = {
  'iran-conflict': '#e74c3c',
  'ukraine-war': '#f1c40f',
  'gaza-war': '#e67e22',
  'israel-palestine': '#e67e22',
  'october-7-attack': '#e67e22',
  'sudan-conflict': '#9b59b6',
  'artemis-2': '#3498db',
  'uap-disclosure': '#6c3483',
  'ice-history': '#2980b9',
  'sinaloa-cartel-war': '#c0392b',
};

function trackerColor(slug: string): string {
  return TRACKER_COLORS[slug] ?? '#58a6ff';
}

function trackerLabel(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/* ── Mini sparkline (inline SVG) ── */

function MiniBar({ data, color = '#58a6ff', width = 120, height = 32 }: { data: number[]; color?: string; width?: number; height?: number }) {
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  const barW = Math.max(2, (width - (data.length - 1) * 2) / data.length);
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {data.map((v, i) => {
        const h = (v / max) * (height - 2);
        return <rect key={i} x={i * (barW + 2)} y={height - h - 1} width={barW} height={h} rx={1} fill={color} opacity={0.8} />;
      })}
    </svg>
  );
}

/* ── Component ── */

export default function SocialCommandCenter({ basePath, githubRepo }: Props) {
  const locale = getPreferredLocale();
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [budget, setBudget] = useState<BudgetData | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [langFilter, setLangFilter] = useState('all');
  const [queueDate, setQueueDate] = useState(todayStr());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ghToken, setGhToken] = useState<string>(
    typeof window !== 'undefined' ? localStorage.getItem('wb_gh_token') ?? '' : '',
  );
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [batchSaving, setBatchSaving] = useState(false);

  /* ── Data fetching ── */

  useEffect(() => {
    async function fetchData() {
      try {
        const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;

        const [budgetRes, historyRes] = await Promise.allSettled([
          fetch(`${base}/_social/budget.json`),
          fetch(`${base}/_social/history.json`),
        ]);

        if (budgetRes.status === 'fulfilled' && budgetRes.value.ok) {
          setBudget(await budgetRes.value.json());
        }

        if (historyRes.status === 'fulfilled' && historyRes.value.ok) {
          const h = await historyRes.value.json();
          setHistory(Array.isArray(h) ? h : []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('social.failedToLoad', locale));
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [basePath]);

  /* ── Queue fetching (separate, date-dependent) ── */

  useEffect(() => {
    async function fetchQueue() {
      const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
      try {
        const res = await fetch(`${base}/_social/queue-${queueDate}.json`);
        if (res.ok) {
          const raw = await res.json();
          setQueue(normalizeQueue(Array.isArray(raw) ? raw : []));
          return;
        }
      } catch {}
      // Fallback legacy naming
      try {
        const res = await fetch(`${base}/_social/${queueDate}.json`);
        if (res.ok) {
          const raw = await res.json();
          setQueue(normalizeQueue(Array.isArray(raw) ? raw : []));
          return;
        }
      } catch {}
      setQueue([]);
    }
    fetchQueue();
  }, [basePath, queueDate]);

  /* ── Derived state ── */

  const languages = useMemo(() => {
    const langs = new Set(queue.map((e) => e.lang));
    return Array.from(langs).sort();
  }, [queue]);

  const filteredQueue = useMemo(() => {
    return queue.filter((entry) => {
      if (statusFilter !== 'all' && entry.status !== statusFilter) return false;
      if (typeFilter !== 'all' && entry.type !== typeFilter) return false;
      if (langFilter !== 'all' && entry.lang !== langFilter) return false;
      return true;
    });
  }, [queue, statusFilter, typeFilter, langFilter]);

  const selectedCost = useMemo(() => {
    return filteredQueue
      .filter((e) => selected.has(e.id))
      .reduce((sum, e) => sum + e.estimatedCost, 0);
  }, [filteredQueue, selected]);

  const totalQueueCost = useMemo(() => {
    return queue.reduce((sum, e) => sum + e.estimatedCost, 0);
  }, [queue]);

  /* ── Stats derived from history ── */

  const stats = useMemo(() => {
    const today = todayStr();
    const todayEntries = history.filter(e => e.date === today);
    const todayBreaking = todayEntries.filter(e => e.type === 'breaking').length;

    // By tracker
    const byTracker: Record<string, number> = {};
    for (const e of history) byTracker[e.tracker] = (byTracker[e.tracker] ?? 0) + 1;
    const trackerRanked = Object.entries(byTracker).sort((a, b) => b[1] - a[1]);

    // By type
    const byType: Record<string, number> = {};
    for (const e of history) byType[e.type] = (byType[e.type] ?? 0) + 1;

    // Last 7 days
    const last7: number[] = [];
    const last7Labels: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      last7Labels.push(ds.slice(5)); // MM-DD
      last7.push(history.filter(e => e.date === ds).length);
    }

    // Days in month + projection
    const dayOfMonth = new Date().getDate();
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const daysLeft = daysInMonth - dayOfMonth;
    const dailyAvg = dayOfMonth > 0 ? history.filter(e => e.date.startsWith(today.slice(0, 7))).length / dayOfMonth : 0;
    const projectedMonthly = Math.round(dailyAvg * daysInMonth);
    const projectedCost = projectedMonthly * 0.01;

    return { todayBreaking, byTracker, trackerRanked, byType, last7, last7Labels, dayOfMonth, daysInMonth, daysLeft, dailyAvg, projectedMonthly, projectedCost };
  }, [history]);

  /* ── Handlers ── */

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleThread = useCallback((id: string) => {
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const allIds = filteredQueue.map((e) => e.id);
    setSelected((prev) => {
      const allSelected = allIds.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(allIds);
    });
  }, [filteredQueue]);

  /* ── Auth handlers ── */

  const handleAuthenticate = useCallback(() => {
    const token = prompt(t('social.enterPat', locale));
    if (token) {
      setGhToken(token);
      localStorage.setItem('wb_gh_token', token);
    }
  }, []);

  const handleLogout = useCallback(() => {
    setGhToken('');
    localStorage.removeItem('wb_gh_token');
  }, []);

  /* ── GitHub API helper ── */

  const updateQueueViaGitHub = useCallback(
    async (updatedQueue: QueueEntry[]): Promise<boolean> => {
      const repo = githubRepo;
      const date = todayStr();
      const filePath = `public/_social/queue-${date}.json`;

      const getRes = await fetch(
        `https://api.github.com/repos/${repo}/contents/${filePath}`,
        {
          headers: {
            Authorization: `Bearer ${ghToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        },
      );

      if (!getRes.ok) {
        const errData = await getRes.json().catch(() => ({}));
        throw new Error(
          `GitHub API error (${getRes.status}): ${(errData as Record<string, string>).message ?? 'Failed to fetch file'}`,
        );
      }

      const { sha } = (await getRes.json()) as { sha: string };

      const content = btoa(
        unescape(encodeURIComponent(JSON.stringify(updatedQueue, null, 2))),
      );
      const putRes = await fetch(
        `https://api.github.com/repos/${repo}/contents/${filePath}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${ghToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: `chore(social): update queue ${date} via dashboard`,
            content,
            sha,
          }),
        },
      );

      if (!putRes.ok) {
        const errData = await putRes.json().catch(() => ({}));
        throw new Error(
          `GitHub API error (${putRes.status}): ${(errData as Record<string, string>).message ?? 'Failed to update file'}`,
        );
      }

      return true;
    },
    [ghToken, githubRepo],
  );

  /* ── Action handlers ── */

  const handleApprove = useCallback(
    async (id: string) => {
      if (!ghToken) return;
      setSavingIds((prev) => new Set(prev).add(id));
      try {
        const updatedQueue = queue.map((e) =>
          e.id === id ? { ...e, status: 'approved' as QueueStatus } : e,
        );
        await updateQueueViaGitHub(updatedQueue);
        setQueue(updatedQueue);
      } catch (err) {
        alert(err instanceof Error ? err.message : t('social.failedToApprove', locale));
      } finally {
        setSavingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [ghToken, queue, updateQueueViaGitHub],
  );

  const handleReject = useCallback(
    async (id: string) => {
      if (!ghToken) return;
      setSavingIds((prev) => new Set(prev).add(id));
      try {
        const updatedQueue = queue.map((e) =>
          e.id === id ? { ...e, status: 'rejected' as QueueStatus } : e,
        );
        await updateQueueViaGitHub(updatedQueue);
        setQueue(updatedQueue);
      } catch (err) {
        alert(err instanceof Error ? err.message : t('social.failedToReject', locale));
      } finally {
        setSavingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [ghToken, queue, updateQueueViaGitHub],
  );

  const handleEdit = useCallback(
    async (id: string) => {
      if (!ghToken) return;
      const entry = queue.find((e) => e.id === id);
      if (!entry) return;

      const newText = prompt(t('social.editTweetText', locale), entry.text);
      if (newText === null || newText === entry.text) return;

      setSavingIds((prev) => new Set(prev).add(id));
      try {
        const updatedQueue = queue.map((e) =>
          e.id === id ? { ...e, text: newText } : e,
        );
        await updateQueueViaGitHub(updatedQueue);
        setQueue(updatedQueue);
      } catch (err) {
        alert(err instanceof Error ? err.message : t('social.failedToEdit', locale));
      } finally {
        setSavingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [ghToken, queue, updateQueueViaGitHub],
  );

  const handleBatchApprove = useCallback(async () => {
    if (!ghToken || selected.size === 0) return;
    setBatchSaving(true);
    try {
      const updatedQueue = queue.map((e) =>
        selected.has(e.id) ? { ...e, status: 'approved' as QueueStatus } : e,
      );
      await updateQueueViaGitHub(updatedQueue);
      setQueue(updatedQueue);
      setSelected(new Set());
    } catch (err) {
      alert(err instanceof Error ? err.message : t('social.failedToBatchApprove', locale));
    } finally {
      setBatchSaving(false);
    }
  }, [ghToken, selected, queue, updateQueueViaGitHub]);

  /* ── Publish Now: trigger GitHub Actions workflow ── */

  const [publishing, setPublishing] = useState(false);

  const handlePublishNow = useCallback(async () => {
    if (!ghToken) return;
    const now = new Date();
    const dueCount = queue.filter(
      (e) =>
        (e.status === 'approved' || e.status === 'auto_approved') &&
        new Date(e.publishAt) <= now &&
        !e.tweetId,
    ).length;
    if (dueCount === 0) {
      alert(t('social.noTweetsDue', locale));
      return;
    }
    if (!confirm(`${t('social.triggerConfirm', locale)} ${dueCount} ${t('social.dueTweets', locale)}`)) return;
    setPublishing(true);
    try {
      // Brief delay to ensure any recent approval commits have landed on the remote
      await new Promise(r => setTimeout(r, 3000));
      const res = await fetch(
        `https://api.github.com/repos/${githubRepo}/actions/workflows/post-social-queue.yml/dispatches`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${ghToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
          body: JSON.stringify({ ref: 'main' }),
        },
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(`GitHub API error (${res.status}): ${(errData as Record<string, string>).message ?? 'Failed to trigger workflow'}`);
      }
      alert(t('social.workflowTriggered', locale));
    } catch (err) {
      alert(err instanceof Error ? err.message : t('social.failedToTrigger', locale));
    } finally {
      setPublishing(false);
    }
  }, [ghToken, queue, githubRepo]);

  /* ── Render helpers ── */

  const budgetPercent = budget ? Math.min((budget.spent / budget.monthlyTarget) * 100, 100) : 0;

  /* ── Loading / Error states ── */

  if (loading) {
    return <div className="scc-loading">{t('social.loadingQueue', locale)}</div>;
  }

  if (error) {
    return <div className="scc-error">{t('social.failedToLoad', locale)}: {error}</div>;
  }

  /* ── Main render ── */

  return (
    <>
      {/* Budget bar */}
      <div className="scc-cost-bar">
        <span>{t('social.budget', locale)} <b>${budget?.monthlyTarget.toFixed(2) ?? '—'}</b>/mo</span>
        <span>{t('social.spent', locale)} <b>${budget?.spent.toFixed(2) ?? '—'}</b></span>
        <div className="scc-cost-meter">
          <div className="scc-cost-fill" style={{ width: `${budgetPercent}%`, background: budgetPercent > 90 ? '#f85149' : undefined }} />
        </div>
        <span>{t('social.remaining', locale)} <b>${budget?.remaining.toFixed(2) ?? '—'}</b></span>
        <span>{t('social.tweets', locale)} <b>{budget?.tweetsPosted ?? 0}</b></span>
        <div className="scc-auth-area">
          {ghToken ? (
            <>
              <span className="scc-auth-badge authenticated">{t('social.authenticated', locale)}</span>
              <button className="scc-auth-btn logout" onClick={handleLogout}>{t('social.logOut', locale)}</button>
            </>
          ) : (
            <button className="scc-auth-btn login" onClick={handleAuthenticate}>{t('social.authenticate', locale)}</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="scc-tabs">
        {TABS.map(tab => (
          <button key={tab.id} className={`scc-tab${activeTab === tab.id ? ' active' : ''}`} onClick={() => setActiveTab(tab.id)}>
            {t(tab.labelKey, locale)}
            {tab.id === 'activity' && <span className="scc-tab-count">{history.length}</span>}
            {tab.id === 'queue' && <span className="scc-tab-count">{queue.length}</span>}
          </button>
        ))}
      </div>

      {/* ──────────── OVERVIEW TAB ──────────── */}
      {activeTab === 'overview' && (
        <div className="scc-overview">
          {/* Stats cards row */}
          <div className="scc-stats-grid">
            <div className="scc-stat-card">
              <div className="scc-stat-label">{t('social.tweetsThisMonth', locale)}</div>
              <div className="scc-stat-value">{budget?.tweetsPosted ?? history.filter(e => e.date.startsWith(todayStr().slice(0, 7))).length}</div>
              <div className="scc-stat-sub">{stats.dailyAvg.toFixed(1)} {t('social.avgPerDay', locale)}</div>
            </div>
            <div className="scc-stat-card">
              <div className="scc-stat-label">{t('social.projectedMonthly', locale)}</div>
              <div className="scc-stat-value" style={{ color: stats.projectedCost > (budget?.monthlyTarget ?? 1) ? '#f85149' : '#3fb950' }}>{stats.projectedMonthly}</div>
              <div className="scc-stat-sub">~${stats.projectedCost.toFixed(2)} {t('social.cost', locale)}</div>
            </div>
            <div className="scc-stat-card">
              <div className="scc-stat-label">{t('social.dailyCapToday', locale)}</div>
              <div className="scc-stat-value">{stats.todayBreaking}<span style={{ color: '#484f58', fontSize: '0.6em' }}>/4</span></div>
              <div className="scc-stat-sub">{t('social.breakingTweets', locale)}</div>
            </div>
            <div className="scc-stat-card">
              <div className="scc-stat-label">{t('social.daysLeft', locale)}</div>
              <div className="scc-stat-value">{stats.daysLeft}</div>
              <div className="scc-stat-sub">${budget?.remaining.toFixed(2) ?? '0.00'} {t('social.remainingSub', locale)}</div>
            </div>
          </div>

          {/* Charts row */}
          <div className="scc-charts-grid">
            {/* Last 7 days */}
            <div className="scc-chart-card">
              <div className="scc-chart-title">{t('social.last7Days', locale)}</div>
              <MiniBar data={stats.last7} width={200} height={40} />
              <div className="scc-chart-labels">
                {stats.last7Labels.map((l, i) => <span key={i}>{l}</span>)}
              </div>
            </div>

            {/* By tracker */}
            <div className="scc-chart-card">
              <div className="scc-chart-title">{t('social.byTracker', locale)}</div>
              <div className="scc-breakdown-list">
                {stats.trackerRanked.slice(0, 8).map(([slug, count]) => (
                  <div key={slug} className="scc-breakdown-row">
                    <span className="scc-breakdown-dot" style={{ background: trackerColor(slug) }} />
                    <span className="scc-breakdown-label">{trackerLabel(slug)}</span>
                    <span className="scc-breakdown-bar-wrap">
                      <span className="scc-breakdown-bar" style={{ width: `${(count / Math.max(...stats.trackerRanked.map(r => r[1]), 1)) * 100}%`, background: trackerColor(slug) }} />
                    </span>
                    <span className="scc-breakdown-count">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* By type */}
            <div className="scc-chart-card">
              <div className="scc-chart-title">{t('social.byType', locale)}</div>
              <div className="scc-breakdown-list">
                {Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                  <div key={type} className="scc-breakdown-row">
                    <span className="scc-breakdown-dot" style={{ background: TYPE_COLORS[type as TweetType] ?? '#8b949e' }} />
                    <span className="scc-breakdown-label">{type.replace('_', ' ')}</span>
                    <span className="scc-breakdown-bar-wrap">
                      <span className="scc-breakdown-bar" style={{ width: `${(count / Math.max(...Object.values(stats.byType), 1)) * 100}%`, background: TYPE_COLORS[type as TweetType] ?? '#8b949e' }} />
                    </span>
                    <span className="scc-breakdown-count">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent activity preview */}
          <div className="scc-section-header">
            <span>{t('social.recentPosts', locale)}</span>
            <button className="scc-link-btn" onClick={() => setActiveTab('activity')}>{t('social.viewAll', locale)}</button>
          </div>
          <div className="scc-activity-list">
            {history.slice().reverse().slice(0, 5).map((entry, i) => (
              <ActivityRow key={entry.tweetId || i} entry={entry} expanded={expandedHistory.has(entry.tweetId)} onToggle={() => setExpandedHistory(prev => { const n = new Set(prev); n.has(entry.tweetId) ? n.delete(entry.tweetId) : n.add(entry.tweetId); return n; })} />
            ))}
            {history.length === 0 && <div className="scc-empty"><span>{t('social.noTweetsYet', locale)}</span></div>}
          </div>
        </div>
      )}

      {/* ──────────── ACTIVITY FEED TAB ──────────── */}
      {activeTab === 'activity' && (
        <div className="scc-activity-tab">
          <div className="scc-section-header">
            <span>{t('social.allPostedTweets', locale)} ({history.length})</span>
          </div>
          <div className="scc-activity-list">
            {history.slice().reverse().map((entry, i) => (
              <ActivityRow key={entry.tweetId || i} entry={entry} expanded={expandedHistory.has(entry.tweetId)} onToggle={() => setExpandedHistory(prev => { const n = new Set(prev); n.has(entry.tweetId) ? n.delete(entry.tweetId) : n.add(entry.tweetId); return n; })} />
            ))}
            {history.length === 0 && <div className="scc-empty"><span>{t('social.noTweetsYet', locale)}</span></div>}
          </div>
        </div>
      )}

      {/* ──────────── QUEUE TAB ──────────── */}
      {activeTab === 'queue' && (
        <>
          {/* Date picker + filters */}
          <div className="scc-queue-toolbar">
            <label className="scc-date-picker">
              <span>{t('social.date', locale)}</span>
              <input type="date" value={queueDate} onChange={e => setQueueDate(e.target.value)} max={todayStr()} />
            </label>
            <div className="scc-filter-sep" />
            {STATUS_FILTERS.map((f) => (
              <button key={f.key} className={`scc-fbtn${statusFilter === f.key ? ' active' : ''}`} onClick={() => setStatusFilter(f.key)}>{t(f.labelKey, locale)}</button>
            ))}
            <div className="scc-filter-sep" />
            {TYPE_FILTERS.map((f) => (
              <button key={f.key} className={`scc-fbtn${typeFilter === f.key ? ' active' : ''}`} onClick={() => setTypeFilter(f.key)}>{t(f.labelKey, locale)}</button>
            ))}
            {languages.length > 1 && (
              <>
                <div className="scc-filter-sep" />
                <button className={`scc-fbtn${langFilter === 'all' ? ' active' : ''}`} onClick={() => setLangFilter('all')}>{t('social.allLangs', locale)}</button>
                {languages.map((lang) => (
                  <button key={lang} className={`scc-fbtn${langFilter === lang ? ' active' : ''}`} onClick={() => setLangFilter(lang)}>{lang.toUpperCase()}</button>
                ))}
              </>
            )}
          </div>

          {/* Card list */}
          <div className="scc-list">
            {filteredQueue.length === 0 ? (
              <div className="scc-empty">
                <span>{t('social.noPostsInQueue', locale)}</span>
                <span className="scc-empty-sub">
                  {queue.length > 0 ? t('social.tryAdjustingFilters', locale) : queueDate === todayStr() ? t('social.noQueueToday', locale) : `${t('social.noQueueFileFor', locale)} ${queueDate}`}
                </span>
              </div>
            ) : (
              filteredQueue.map((entry) => (
                <QueueCard
                  key={entry.id}
                  entry={entry}
                  isSelected={selected.has(entry.id)}
                  isThreadExpanded={expandedThreads.has(entry.id)}
                  isSaving={savingIds.has(entry.id)}
                  isAuthenticated={ghToken !== ''}
                  onToggleSelect={() => toggleSelect(entry.id)}
                  onToggleThread={() => toggleThread(entry.id)}
                  onApprove={() => handleApprove(entry.id)}
                  onEdit={() => handleEdit(entry.id)}
                  onReject={() => handleReject(entry.id)}
                />
              ))
            )}
          </div>

          {/* Bottom bar */}
          <div className="scc-bottom">
            <div className="scc-bottom-left">
              <button className="scc-fbtn" onClick={selectAll} style={{ fontSize: '10px' }}>
                {filteredQueue.length > 0 && filteredQueue.every((e) => selected.has(e.id)) ? t('social.deselectAll', locale) : t('social.selectAll', locale)}
              </button>
              <span><b>{selected.size}</b> {t('social.selected', locale)}</span>
              <span>{t('social.estCost', locale)} <b>${selectedCost.toFixed(3)}</b></span>
              {budget && <span>{t('social.after', locale)} <b>${Math.max(0, budget.remaining - selectedCost).toFixed(3)}</b> {t('social.remainingSub', locale)}</span>}
            </div>
            <div className="scc-bottom-right">
              <button className="scc-batch-btn" disabled={selected.size === 0 || !ghToken || batchSaving} title={!ghToken ? t('social.authToEnable', locale) : undefined} onClick={handleBatchApprove}>
                {batchSaving ? t('social.saving', locale) : `${t('social.batchApprove', locale)} (${selected.size})`}
              </button>
              <button className="scc-batch-btn scc-publish-btn" disabled={!ghToken || publishing || queue.filter(e => e.status === 'approved' || e.status === 'auto_approved').length === 0} title={!ghToken ? t('social.authToEnable', locale) : undefined} onClick={handlePublishNow}>
                {publishing ? t('social.triggering', locale) : `${t('social.publishNow', locale)} (${queue.filter(e => e.status === 'approved' || e.status === 'auto_approved').length})`}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* ── Activity Row ── */

function ActivityRow({ entry, expanded, onToggle }: { entry: HistoryEntry; expanded: boolean; onToggle: () => void }) {
  const typeColor = TYPE_COLORS[entry.type] ?? '#8b949e';
  const tColor = trackerColor(entry.tracker);
  const time = entry.publishedAt ? new Date(entry.publishedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : entry.date;
  const tweetUrl = entry.tweetId ? `https://x.com/watchboard_dev/status/${entry.tweetId}` : null;

  return (
    <div className="scc-activity-row" onClick={onToggle}>
      <div className="scc-activity-meta">
        <span className="scc-type-badge" style={{ background: `${typeColor}22`, color: typeColor }}>{entry.type.replace('_', ' ')}</span>
        <span className="scc-tracker-badge" style={{ background: `${tColor}22`, color: tColor }}>{trackerLabel(entry.tracker)}</span>
        <span className="scc-activity-time">{time}</span>
        <span className="scc-activity-cost">${entry.cost.toFixed(3)}</span>
        {tweetUrl && <a href={tweetUrl} target="_blank" rel="noopener noreferrer" className="scc-activity-link" onClick={e => e.stopPropagation()}>↗</a>}
      </div>
      <div className={`scc-activity-text${expanded ? ' expanded' : ''}`}>
        {highlightTweetText(entry.text)}
      </div>
    </div>
  );
}

/* ── Queue Card ── */

interface QueueCardProps {
  entry: QueueEntry;
  isSelected: boolean;
  isThreadExpanded: boolean;
  isSaving: boolean;
  isAuthenticated: boolean;
  onToggleSelect: () => void;
  onToggleThread: () => void;
  onApprove: () => void;
  onEdit: () => void;
  onReject: () => void;
}

function QueueCard({
  entry,
  isSelected,
  isThreadExpanded,
  isSaving,
  isAuthenticated,
  onToggleSelect,
  onToggleThread,
  onApprove,
  onEdit,
  onReject,
}: QueueCardProps) {
  const locale = getPreferredLocale();
  const verdict = entry.judge.verdict;
  const typeColor = TYPE_COLORS[entry.type] ?? '#8b949e';
  const verdictColor = VERDICT_COLORS[verdict] ?? '#8b949e';
  const trackerDisplay = entry.tracker.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="scc-card" data-verdict={verdict}>
      {/* Left panel: judge + controls */}
      <div className="scc-ctrl">
        {/* Top row */}
        <div className="scc-ctrl-top">
          <input
            type="checkbox"
            className="scc-checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            aria-label={`Select ${entry.id}`}
          />
          <span
            className="scc-type-badge"
            style={{ background: `${typeColor}22`, color: typeColor }}
          >
            {entry.type.replace('_', ' ')}
          </span>
          <span className="scc-tracker-name">{trackerDisplay}</span>
        </div>

        {/* Voice + lang tags */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span className="scc-voice-tag">{entry.voice}</span>
          <span className="scc-lang-tag">{entry.lang.toUpperCase()}</span>
        </div>

        {/* Score bar + verdict */}
        <div className="scc-score-row">
          <div className="scc-score-bar">
            <div
              className="scc-score-fill"
              style={{
                width: `${entry.judge.score <= 1 ? entry.judge.score * 100 : entry.judge.score}%`,
                background: scoreColor(entry.judge.score),
              }}
            />
          </div>
          <span
            className="scc-verdict-badge"
            style={{ background: `${verdictColor}22`, color: verdictColor }}
          >
            {verdict}
          </span>
        </div>

        {/* Judge box */}
        <div className="scc-judge">
          <div className="scc-judge-label">{t('social.llmJudge', locale)}</div>
          <div className="scc-judge-comment">{entry.judge.comment}</div>
          {entry.judge.factChecks.length > 0 && (
            <div>
              {entry.judge.factChecks.map((fc, i) => (
                <div key={i} className="scc-fc-item">
                  <span style={{ color: FC_COLORS[fc.status], flexShrink: 0 }}>
                    {FC_ICONS[fc.status]}
                  </span>
                  <span>
                    <b>{fc.claim}</b> — {fc.source}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cost */}
        <div className="scc-cost-tag">
          {t('social.est', locale)} <b>${entry.estimatedCost.toFixed(3)}</b>
        </div>

        {/* Action buttons */}
        <div className="scc-actions">
          <button
            className="scc-action-btn approve"
            disabled={!isAuthenticated || isSaving}
            title={!isAuthenticated ? t('social.authToEnable', locale) : undefined}
            onClick={onApprove}
          >
            {isSaving ? t('social.saving', locale) : t('social.approve', locale)}
          </button>
          <button
            className="scc-action-btn edit"
            disabled={!isAuthenticated || isSaving}
            title={!isAuthenticated ? t('social.authToEnable', locale) : undefined}
            onClick={onEdit}
          >
            {t('social.edit', locale)}
          </button>
          <button
            className="scc-action-btn reject"
            disabled={!isAuthenticated || isSaving}
            title={!isAuthenticated ? t('social.authToEnable', locale) : undefined}
            onClick={onReject}
          >
            {t('social.reject', locale)}
          </button>
        </div>
      </div>

      {/* Right panel: X/Twitter preview */}
      <div className="scc-x-preview">
        <div className="scc-x-tweet">
          <div className="scc-x-avatar">
            <XLogoSvg size={20} />
          </div>
          <div className="scc-x-body">
            {/* Tweet header */}
            <div className="scc-x-header">
              <span className="scc-x-name">Watchboard</span>
              <VerifiedBadgeSvg />
              <span className="scc-x-handle">@watchaborddotdev</span>
              <span className="scc-x-time">
                &middot; {new Date(entry.publishAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>

            {/* Tweet text */}
            <div className="scc-x-text">{highlightTweetText(entry.text)}</div>

            {/* Image if present */}
            {entry.image && (
              <img
                className="scc-x-image"
                src={entry.image}
                alt={t('social.tweetAttachment', locale)}
                loading="lazy"
              />
            )}

            {/* Meme if present (use memegenUrl as img src) */}
            {!entry.image && entry.memegenUrl && (
              <img
                className="scc-x-image"
                src={entry.memegenUrl}
                alt={t('social.memeAttachment', locale)}
                loading="lazy"
              />
            )}

            {/* Thread tweets */}
            {entry.threadTweets && entry.threadTweets.length > 0 && (
              <div>
                <div className="scc-x-thread">
                  {(isThreadExpanded ? entry.threadTweets : entry.threadTweets.slice(0, 1)).map(
                    (tweet, i) => (
                      <div key={i} className="scc-x-thread-item">
                        {highlightTweetText(tweet)}
                      </div>
                    ),
                  )}
                </div>
                {entry.threadTweets.length > 1 && (
                  <button className="scc-thread-toggle" onClick={onToggleThread}>
                    {isThreadExpanded
                      ? t('social.collapseThread', locale)
                      : `${entry.threadTweets.length - 1} more tweet${entry.threadTweets.length > 2 ? 's' : ''}`}
                  </button>
                )}
              </div>
            )}

            {/* Engagement bar (placeholder) */}
            <div className="scc-x-engage">
              <span>
                <svg viewBox="0 0 24 24" width={16} height={16} fill="#71767b">
                  <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.25-.893 4.41-2.481 6L12 24l-7.77-7.87C2.644 14.41 1.751 12.25 1.751 10zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 1.66.644 3.24 1.812 4.42L12 20.89l6.437-6.47C19.556 13.24 20.2 11.66 20.2 10.13c0-3.39-2.744-6.13-6.129-6.13H9.756z" />
                </svg>
                —
              </span>
              <span>
                <svg viewBox="0 0 24 24" width={16} height={16} fill="#71767b">
                  <path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z" />
                </svg>
                —
              </span>
              <span>
                <svg viewBox="0 0 24 24" width={16} height={16} fill="#71767b">
                  <path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21v-5.5h2V21H4z" />
                </svg>
                —
              </span>
              <span>
                <svg viewBox="0 0 24 24" width={16} height={16} fill="#71767b">
                  <path d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z" />
                </svg>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
