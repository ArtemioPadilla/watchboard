import { useState, useEffect, useMemo, useCallback } from 'react';

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

const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'ALL' },
  { key: 'auto_approved', label: 'AUTO' },
  { key: 'pending_review', label: 'REVIEW' },
  { key: 'held', label: 'HELD' },
  { key: 'approved', label: 'APPROVED' },
  { key: 'rejected', label: 'REJECTED' },
  { key: 'posted', label: 'POSTED' },
];

const TYPE_FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'ALL TYPES' },
  { key: 'digest', label: 'DIGEST' },
  { key: 'breaking', label: 'BREAKING' },
  { key: 'hot_take', label: 'HOT TAKE' },
  { key: 'thread', label: 'THREAD' },
  { key: 'data_viz', label: 'DATA VIZ' },
  { key: 'meme', label: 'MEME' },
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
      score: 70,
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
  if (score >= 80) return '#3fb950';
  if (score >= 60) return '#d29922';
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

/* ── Component ── */

export default function SocialCommandCenter({ basePath }: Props) {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [budget, setBudget] = useState<BudgetData | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [langFilter, setLangFilter] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
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
        const today = todayStr();
        const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;

        const [queueRes, budgetRes, historyRes] = await Promise.allSettled([
          fetch(`${base}/_social/queue-${today}.json`),
          fetch(`${base}/_social/budget.json`),
          fetch(`${base}/_social/history.json`),
        ]);

        let queueData: QueueEntry[] = [];
        if (queueRes.status === 'fulfilled' && queueRes.value.ok) {
          const raw = await queueRes.value.json();
          queueData = normalizeQueue(Array.isArray(raw) ? raw : []);
        } else {
          // Fallback: try without queue- prefix (legacy naming)
          try {
            const fallbackRes = await fetch(`${base}/_social/${today}.json`);
            if (fallbackRes.ok) {
              const raw = await fallbackRes.json();
              queueData = normalizeQueue(Array.isArray(raw) ? raw : []);
            }
          } catch {
            // No queue for today is not an error
          }
        }

        if (budgetRes.status === 'fulfilled' && budgetRes.value.ok) {
          setBudget(await budgetRes.value.json());
        }

        if (historyRes.status === 'fulfilled' && historyRes.value.ok) {
          const h = await historyRes.value.json();
          setHistory(Array.isArray(h) ? h : []);
        }

        setQueue(queueData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [basePath]);

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
    const token = prompt('Enter your GitHub Personal Access Token (PAT):');
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
      const repo = 'ArtemioPadilla/watchboard';
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
    [ghToken],
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
        alert(err instanceof Error ? err.message : 'Failed to approve');
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
        alert(err instanceof Error ? err.message : 'Failed to reject');
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

      const newText = prompt('Edit tweet text:', entry.text);
      if (newText === null || newText === entry.text) return;

      setSavingIds((prev) => new Set(prev).add(id));
      try {
        const updatedQueue = queue.map((e) =>
          e.id === id ? { ...e, text: newText } : e,
        );
        await updateQueueViaGitHub(updatedQueue);
        setQueue(updatedQueue);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to edit');
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
      alert(err instanceof Error ? err.message : 'Failed to batch approve');
    } finally {
      setBatchSaving(false);
    }
  }, [ghToken, selected, queue, updateQueueViaGitHub]);

  /* ── Render helpers ── */

  const budgetPercent = budget ? Math.min((budget.spent / budget.monthlyTarget) * 100, 100) : 0;

  /* ── Loading / Error states ── */

  if (loading) {
    return <div className="scc-loading">Loading queue...</div>;
  }

  if (error) {
    return <div className="scc-error">Error: {error}</div>;
  }

  /* ── Main render ── */

  return (
    <>
      {/* Cost bar */}
      <div className="scc-cost-bar">
        <span>
          BUDGET <b>${budget?.monthlyTarget.toFixed(2) ?? '—'}</b>/mo
        </span>
        <span>
          SPENT <b>${budget?.spent.toFixed(2) ?? '—'}</b>
        </span>
        <div className="scc-cost-meter">
          <div className="scc-cost-fill" style={{ width: `${budgetPercent}%` }} />
        </div>
        <span>
          REMAINING <b>${budget?.remaining.toFixed(2) ?? '—'}</b>
        </span>
        <span>
          QUEUE COST <b>${totalQueueCost.toFixed(3)}</b>
        </span>
        <div className="scc-auth-area">
          {ghToken ? (
            <>
              <span className="scc-auth-badge authenticated">AUTHENTICATED</span>
              <button className="scc-auth-btn logout" onClick={handleLogout}>
                Log out
              </button>
            </>
          ) : (
            <button className="scc-auth-btn login" onClick={handleAuthenticate}>
              Authenticate
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="scc-filters">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            className={`scc-fbtn${statusFilter === f.key ? ' active' : ''}`}
            onClick={() => setStatusFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
        <div className="scc-filter-sep" />
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.key}
            className={`scc-fbtn${typeFilter === f.key ? ' active' : ''}`}
            onClick={() => setTypeFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
        {languages.length > 1 && (
          <>
            <div className="scc-filter-sep" />
            <button
              className={`scc-fbtn${langFilter === 'all' ? ' active' : ''}`}
              onClick={() => setLangFilter('all')}
            >
              ALL LANGS
            </button>
            {languages.map((lang) => (
              <button
                key={lang}
                className={`scc-fbtn${langFilter === lang ? ' active' : ''}`}
                onClick={() => setLangFilter(lang)}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Card list */}
      <div className="scc-list">
        {filteredQueue.length === 0 ? (
          <div className="scc-empty">
            <span>No posts in queue</span>
            <span className="scc-empty-sub">
              {queue.length > 0 ? 'Try adjusting your filters' : `No queue file found for ${todayStr()}`}
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
            {filteredQueue.length > 0 && filteredQueue.every((e) => selected.has(e.id))
              ? 'DESELECT ALL'
              : 'SELECT ALL'}
          </button>
          <span>
            <b>{selected.size}</b> selected
          </span>
          <span>
            EST. COST <b>${selectedCost.toFixed(3)}</b>
          </span>
          {budget && (
            <span>
              AFTER <b>${Math.max(0, budget.remaining - selectedCost).toFixed(3)}</b> remaining
            </span>
          )}
        </div>
        <div className="scc-bottom-right">
          <button
            className="scc-batch-btn"
            disabled={selected.size === 0 || !ghToken || batchSaving}
            title={!ghToken ? 'Authenticate to enable' : undefined}
            onClick={handleBatchApprove}
          >
            {batchSaving ? 'Saving...' : `BATCH APPROVE (${selected.size})`}
          </button>
        </div>
      </div>
    </>
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
                width: `${entry.judge.score}%`,
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
          <div className="scc-judge-label">LLM JUDGE</div>
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
          EST. <b>${entry.estimatedCost.toFixed(3)}</b>
        </div>

        {/* Action buttons */}
        <div className="scc-actions">
          <button
            className="scc-action-btn approve"
            disabled={!isAuthenticated || isSaving}
            title={!isAuthenticated ? 'Authenticate to enable' : undefined}
            onClick={onApprove}
          >
            {isSaving ? 'Saving...' : 'APPROVE'}
          </button>
          <button
            className="scc-action-btn edit"
            disabled={!isAuthenticated || isSaving}
            title={!isAuthenticated ? 'Authenticate to enable' : undefined}
            onClick={onEdit}
          >
            EDIT
          </button>
          <button
            className="scc-action-btn reject"
            disabled={!isAuthenticated || isSaving}
            title={!isAuthenticated ? 'Authenticate to enable' : undefined}
            onClick={onReject}
          >
            REJECT
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
                alt="Tweet attachment"
                loading="lazy"
              />
            )}

            {/* Meme if present (use memegenUrl as img src) */}
            {!entry.image && entry.memegenUrl && (
              <img
                className="scc-x-image"
                src={entry.memegenUrl}
                alt="Meme attachment"
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
                      ? 'Collapse thread'
                      : `Show ${entry.threadTweets.length - 1} more tweet${entry.threadTweets.length > 2 ? 's' : ''}`}
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
