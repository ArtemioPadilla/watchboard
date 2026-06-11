import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { TriageLog, TriageLogEntry } from '../../../scripts/hourly-types';
import FreshnessBadge from './FreshnessBadge';

type Decision = TriageLogEntry['decision'];

interface Props { logUrl: string }

export default function TriageLogBoard({ logUrl }: Props) {
  const [log, setLog] = useState<TriageLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decisionFilter, setDecisionFilter] = useState<Decision | 'all'>('all');
  const [scanFilter, setScanFilter] = useState<'all' | 'light' | 'heavy'>('all');
  const [minScore, setMinScore] = useState(0);

  // Older weekly archive files (triage-log-YYYY-Www.json), loaded on demand.
  const [archiveEntries, setArchiveEntries] = useState<TriageLogEntry[]>([]);
  const [loadedWeeks, setLoadedWeeks] = useState<string[]>([]);
  const [loadingWeek, setLoadingWeek] = useState(false);

  const PAGE_SIZE = 200;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    fetch(logUrl)
      .then((r) => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then((j: TriageLog) => setLog(j))
      .catch((e) => setError(String(e)));
  }, [logUrl]);

  // Archive weeks not yet loaded, newest first.
  const remainingWeeks = useMemo(() => {
    const weeks = log?.weeks ?? [];
    return [...weeks].sort().reverse().filter((w) => !loadedWeeks.includes(w));
  }, [log, loadedWeeks]);

  const loadOlderWeek = () => {
    const week = remainingWeeks[0];
    if (!week || loadingWeek) return;
    setLoadingWeek(true);
    const weekUrl = logUrl.replace(/\.json(\?.*)?$/, `-${week}.json$1`);
    fetch(weekUrl)
      .then((r) => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then((j: TriageLog) => {
        setArchiveEntries((prev) => [...prev, ...(Array.isArray(j.entries) ? j.entries : [])]);
        setLoadedWeeks((prev) => [...prev, week]);
      })
      .catch((e) => setError(`Failed to load week ${week}: ${e}`))
      .finally(() => setLoadingWeek(false));
  };

  const allEntries = useMemo(
    () => (log ? [...log.entries, ...archiveEntries] : []),
    [log, archiveEntries],
  );

  const entries = useMemo(() => {
    return allEntries
      .filter((e) => decisionFilter === 'all' || e.decision === decisionFilter)
      .filter((e) => scanFilter === 'all' || e.scanType === scanFilter)
      .filter((e) => e.confidence >= minScore)
      // Plain string comparison — ISO timestamps sort lexicographically;
      // localeCompare is slower and locale-dependent.
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
  }, [allEntries, decisionFilter, scanFilter, minScore]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [decisionFilter, scanFilter, minScore]);

  // The most recent entry's timestamp is the audit-log "freshness" — i.e. when
  // the latest scan made any decision. If the log is empty, we fall back to
  // the lastPruned stamp (which is set every time the heavy triage runs even
  // if nothing was triaged).
  const lastActivity = useMemo(() => {
    if (!log) return undefined;
    const newest = log.entries
      .map((e) => e.timestamp)
      .sort()
      .pop();
    return newest ?? log.lastPruned ?? undefined;
  }, [log]);

  if (error) return <div style={{ color: 'var(--accent-red)' }}>Error loading audit log: {error}</div>;
  if (!log) return <div>Loading…</div>;

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--text-primary, #e6edf3)' }}>
      <div style={{ marginBottom: 16 }}>
        <FreshnessBadge lastUpdated={lastActivity} label="Last scan:" freshHours={1} staleHours={6} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <select value={decisionFilter} onChange={(e) => setDecisionFilter(e.target.value as Decision | 'all')} style={selectStyle}>
          <option value="all">All decisions</option>
          <option value="update">Update</option>
          <option value="new_tracker">New tracker</option>
          <option value="defer">Defer</option>
          <option value="discard">Discard</option>
        </select>
        <select value={scanFilter} onChange={(e) => setScanFilter(e.target.value as 'all' | 'light' | 'heavy')} style={selectStyle}>
          <option value="all">Both scans</option>
          <option value="light">Light scan only</option>
          <option value="heavy">Heavy scan only</option>
        </select>
        <label style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          Min score:
          <input
            type="range" min={0} max={1} step={0.05}
            value={minScore} onChange={(e) => setMinScore(parseFloat(e.target.value))}
          />
          <span style={{ fontFamily: 'JetBrains Mono, monospace', minWidth: 36 }}>{minScore.toFixed(2)}</span>
        </label>
        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted, #8b949e)' }}>
          {entries.length} of {allEntries.length} entries
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {entries.length === 0 && <div style={{ opacity: 0.6 }}>No entries match these filters.</div>}
        {entries.slice(0, visibleCount).map((e, i) => (
          <article key={`${e.timestamp}-${i}`} style={{
            background: 'var(--bg-card, #161b22)',
            border: '1px solid var(--border, #30363d)',
            borderLeft: `3px solid ${decisionColor(e.decision)}`,
            borderRadius: 6,
            padding: '8px 10px',
            fontSize: '0.78rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ ...badge, color: decisionColor(e.decision), borderColor: decisionColor(e.decision) }}>
                {e.decision}
              </span>
              <span style={badge}>{e.scanType}</span>
              <span style={{ ...badge, color: 'var(--accent-blue, #58a6ff)' }}>
                {e.confidence.toFixed(2)}
              </span>
              {e.candidate.matchedTracker && (
                <span style={{ ...badge, color: 'var(--text-muted, #8b949e)' }}>
                  → {e.candidate.matchedTracker}
                </span>
              )}
              <span style={{ marginLeft: 'auto', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.6rem', color: 'var(--text-muted, #8b949e)' }}>
                {e.timestamp.replace('T', ' ').replace(/\..+/, '')}
              </span>
            </div>
            <div style={{ marginBottom: 2 }}>
              <a href={e.candidate.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-primary, #e6edf3)' }}>
                {e.candidate.title}
              </a>
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #8b949e)' }}>
              {e.candidate.source} · {e.candidate.feedOrigin} · {e.reason}
            </div>
          </article>
        ))}
        {entries.length > visibleCount && (
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #8b949e)', marginRight: 12 }}>
              Showing {Math.min(visibleCount, entries.length)} of {entries.length} entries
            </span>
            <button
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              style={{
                background: 'var(--bg-card, #161b22)',
                border: '1px solid var(--border, #30363d)',
                color: 'var(--text-primary, #e6edf3)',
                borderRadius: 6,
                padding: '4px 12px',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              Load {Math.min(PAGE_SIZE, entries.length - visibleCount)} more
            </button>
          </div>
        )}
        {entries.length <= visibleCount && entries.length > 0 && (
          <div style={{ textAlign: 'center', marginTop: 12, fontSize: '0.7rem', color: 'var(--text-muted, #8b949e)' }}>
            Showing all {entries.length} entries
          </div>
        )}
        {remainingWeeks.length > 0 && (
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <button
              onClick={loadOlderWeek}
              disabled={loadingWeek}
              style={{
                background: 'var(--bg-card, #161b22)',
                border: '1px solid var(--border, #30363d)',
                color: 'var(--text-primary, #e6edf3)',
                borderRadius: 6,
                padding: '4px 12px',
                fontSize: '0.75rem',
                cursor: loadingWeek ? 'wait' : 'pointer',
                opacity: loadingWeek ? 0.6 : 1,
              }}
            >
              {loadingWeek
                ? `Loading ${remainingWeeks[0]}…`
                : `Load older entries (${remainingWeeks[0]})`}
            </button>
            <span style={{ marginLeft: 10, fontSize: '0.65rem', color: 'var(--text-muted, #8b949e)' }}>
              {remainingWeeks.length} archived week{remainingWeeks.length === 1 ? '' : 's'} available
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

const selectStyle: CSSProperties = {
  background: 'var(--bg-secondary, #0d1117)',
  color: 'var(--text-primary, #e6edf3)',
  border: '1px solid var(--border, #30363d)',
  borderRadius: 6,
  padding: '4px 8px',
  fontFamily: 'inherit',
  fontSize: '0.75rem',
};

const badge: CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: '0.6rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
  border: '1px solid var(--border, #30363d)',
  borderRadius: 4,
  padding: '1px 6px',
  textTransform: 'uppercase',
  color: 'var(--text-muted, #8b949e)',
  background: 'transparent',
};

function decisionColor(d: Decision): string {
  switch (d) {
    case 'update':      return 'var(--accent-green,  #2ecc71)';
    case 'new_tracker': return 'var(--accent-blue,   #58a6ff)';
    case 'defer':       return 'var(--accent-amber,  #f39c12)';
    case 'discard':     return 'var(--text-muted,    #8b949e)';
  }
}
