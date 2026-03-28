import { useState, useEffect, useMemo } from 'react';

interface MetricsIndexEntry {
  file: string;
  timestamp: string;
  status: 'success' | 'failure';
  trackerCount: number;
  errorCount: number;
}

interface ValidationError {
  tracker: string;
  file: string;
  field: string;
  message: string;
}

interface MetricsRun {
  timestamp: string;
  status: 'success' | 'failure';
  trigger: 'schedule' | 'workflow_dispatch';
  trackersResolved: string[];
  validation: {
    jsonValid: boolean;
    schemaValid: boolean;
    errors: ValidationError[];
    fixAgentInvoked?: boolean;
    fixAgentResult?: 'success' | 'failure';
    errorsBeforeFix?: number;
    errorsAfterFix?: number;
  };
  inventory: Record<string, {
    kpis: number;
    timeline: number;
    mapPoints: number;
    mapLines: number;
    claims: number;
    political: number;
    casualties: number;
    events: number;
  }>;
}

const BASE = '/watchboard';

/* ── Shared inline-style constants ── */

const FONT_MONO = "'JetBrains Mono', monospace";
const FONT_SERIF = "'Cormorant Garamond', serif";
const FONT_SANS = "'DM Sans', sans-serif";

/* ── Helper: relative time ── */

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

/* ── Helper: format date pieces ── */

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/* ── Summary stats computation ── */

interface SummaryStats {
  totalRuns: number;
  successRate: number;
  lastRunRelative: string;
  avgErrorsPerRun: number;
}

function computeSummary(entries: MetricsIndexEntry[]): SummaryStats {
  const total = entries.length;
  const successes = entries.filter(e => e.status === 'success').length;
  const rate = total > 0 ? (successes / total) * 100 : 0;
  const totalErrors = entries.reduce((sum, e) => sum + e.errorCount, 0);
  const avg = total > 0 ? totalErrors / total : 0;
  const sorted = [...entries].sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const lastRun = sorted.length > 0 ? relativeTime(sorted[0].timestamp) : 'N/A';

  return {
    totalRuns: total,
    successRate: rate,
    lastRunRelative: lastRun,
    avgErrorsPerRun: Math.round(avg * 10) / 10,
  };
}

/* ── Error trend sparkline ── */

function ErrorTrendChart({ entries }: { entries: MetricsIndexEntry[] }) {
  const recent = useMemo(() => [...entries].reverse().slice(-30), [entries]);
  const hasErrors = recent.some(r => r.errorCount > 0);
  if (!hasErrors || recent.length < 2) return null;

  const maxErrors = Math.max(...recent.map(r => r.errorCount), 1);
  const w = 600;
  const h = 64;
  const padX = 8;
  const padY = 6;
  const step = (w - padX * 2) / Math.max(recent.length - 1, 1);

  const points = recent.map((r, i) => {
    const x = padX + i * step;
    const y = h - padY - ((r.errorCount / maxErrors) * (h - padY * 2));
    return { x, y, entry: r };
  });

  const linePath = points.map(p => `${p.x},${p.y}`).join(' ');
  const areaPath = linePath + ` ${points[points.length - 1].x},${h - padY} ${points[0].x},${h - padY}`;

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '0.75rem',
      }}>
        <span style={{
          fontFamily: FONT_MONO,
          fontSize: '0.6rem',
          letterSpacing: '0.12em',
          textTransform: 'uppercase' as const,
          color: 'var(--text-muted)',
        }}>
          Error Trend
        </span>
        <span style={{
          fontFamily: FONT_MONO,
          fontSize: '0.6rem',
          color: 'var(--text-muted)',
          opacity: 0.6,
        }}>
          last {recent.length} runs
        </span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        style={{
          width: '100%',
          maxWidth: '600px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          display: 'block',
        }}
      >
        {/* Horizontal grid lines */}
        {[0.25, 0.5, 0.75].map(frac => {
          const y = h - padY - frac * (h - padY * 2);
          return (
            <line
              key={frac}
              x1={padX}
              y1={y}
              x2={w - padX}
              y2={y}
              stroke="var(--border)"
              strokeWidth="0.5"
              strokeDasharray="4 4"
            />
          );
        })}
        {/* Area fill */}
        <polygon
          points={areaPath}
          fill="var(--accent-red)"
          opacity="0.08"
        />
        {/* Line */}
        <polyline
          points={linePath}
          fill="none"
          stroke="var(--accent-red)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Dots */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={p.entry.errorCount > 0 ? 3 : 2}
            fill={p.entry.errorCount > 0 ? 'var(--accent-red)' : 'var(--accent-green)'}
            opacity={p.entry.errorCount > 0 ? 1 : 0.5}
          />
        ))}
        {/* Max label */}
        <text
          x={w - padX - 2}
          y={padY + 4}
          textAnchor="end"
          fill="var(--text-muted)"
          fontSize="8"
          fontFamily={FONT_MONO}
        >
          max {maxErrors}
        </text>
      </svg>
    </div>
  );
}

/* ── KPI stat card ── */

function StatCard({ label, value, color, subtext }: {
  label: string;
  value: string;
  color?: string;
  subtext?: string;
}) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      padding: '1.25rem',
      position: 'relative' as const,
      overflow: 'hidden',
      transition: 'background 0.2s',
    }}>
      <div style={{
        fontFamily: FONT_MONO,
        fontSize: '0.6rem',
        letterSpacing: '0.12em',
        textTransform: 'uppercase' as const,
        color: 'var(--text-muted)',
        marginBottom: '0.5rem',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: FONT_SERIF,
        fontSize: '2rem',
        fontWeight: 700,
        lineHeight: 1,
        marginBottom: '0.35rem',
        color: color || 'var(--text-primary)',
      }}>
        {value}
      </div>
      {subtext && (
        <div style={{
          fontSize: '0.68rem',
          color: 'var(--text-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap' as const,
        }}>
          {subtext}
        </div>
      )}
    </div>
  );
}

/* ── Run history item ── */

function RunItem({ entry, isSelected, onClick }: {
  entry: MetricsIndexEntry;
  isSelected: boolean;
  onClick: () => void;
}) {
  const isSuccess = entry.status === 'success';
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 14px',
        background: isSelected ? 'var(--bg-card-hover)' : 'transparent',
        border: 'none',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        width: '100%',
        textAlign: 'left' as const,
        transition: 'background 0.15s',
        minWidth: '220px',
        flexShrink: 0,
      }}
      onMouseEnter={e => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)';
      }}
      onMouseLeave={e => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      {/* Status dot */}
      <span style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: isSuccess ? 'var(--accent-green)' : 'var(--accent-red)',
        flexShrink: 0,
        boxShadow: isSuccess
          ? '0 0 6px rgba(46,204,113,0.4)'
          : '0 0 6px rgba(231,76,60,0.4)',
      }} />
      {/* Date/time */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: FONT_MONO,
          fontSize: '0.75rem',
          color: 'var(--text-primary)',
          lineHeight: 1.3,
        }}>
          {formatShortDate(entry.timestamp)}
        </div>
        <div style={{
          fontFamily: FONT_MONO,
          fontSize: '0.65rem',
          color: 'var(--text-muted)',
          lineHeight: 1.3,
        }}>
          {formatTime(entry.timestamp)}
        </div>
      </div>
      {/* Tracker count */}
      <span style={{
        fontFamily: FONT_MONO,
        fontSize: '0.65rem',
        color: 'var(--text-secondary)',
        padding: '2px 6px',
        background: 'var(--bg-secondary)',
        borderRadius: '4px',
      }}>
        {entry.trackerCount} trk
      </span>
      {/* Error count */}
      {entry.errorCount > 0 && (
        <span style={{
          fontFamily: FONT_MONO,
          fontSize: '0.65rem',
          fontWeight: 600,
          color: 'var(--accent-red)',
          padding: '2px 6px',
          background: 'var(--accent-red-dim)',
          borderRadius: '4px',
        }}>
          {entry.errorCount} err
        </span>
      )}
      {/* Selection indicator */}
      {isSelected && (
        <span style={{
          width: '3px',
          height: '20px',
          background: 'var(--accent-blue)',
          borderRadius: '2px',
          flexShrink: 0,
        }} />
      )}
    </button>
  );
}

/* ── Selected run detail panel ── */

function RunDetailPanel({ run, loading }: { run: MetricsRun | null; loading: boolean }) {
  if (loading) {
    return (
      <div style={{
        padding: '3rem',
        textAlign: 'center' as const,
        color: 'var(--text-muted)',
        fontFamily: FONT_SANS,
        fontSize: '0.85rem',
      }}>
        Loading run details...
      </div>
    );
  }

  if (!run) {
    return (
      <div style={{
        padding: '3rem',
        textAlign: 'center' as const,
        color: 'var(--text-muted)',
        fontFamily: FONT_SANS,
        fontSize: '0.85rem',
        opacity: 0.6,
      }}>
        Select a run to view details
      </div>
    );
  }

  const isSuccess = run.status === 'success';
  const inventoryEntries = Object.entries(run.inventory);
  const inventoryKeys = ['kpis', 'timeline', 'mapPoints', 'mapLines', 'claims', 'political', 'casualties', 'events'] as const;

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '6px 10px',
    fontFamily: FONT_MONO,
    fontSize: '0.6rem',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  };

  const thRightStyle: React.CSSProperties = { ...thStyle, textAlign: 'right' };

  const tdStyle: React.CSSProperties = {
    padding: '6px 10px',
    fontFamily: FONT_MONO,
    fontSize: '0.75rem',
    color: 'var(--text-primary)',
    borderBottom: '1px solid var(--border)',
  };

  const tdRightStyle: React.CSSProperties = {
    ...tdStyle,
    textAlign: 'right',
    color: 'var(--text-secondary)',
  };

  return (
    <div style={{ padding: '1.25rem' }}>
      {/* Header row: status + meta */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexWrap: 'wrap' as const,
        marginBottom: '1.25rem',
      }}>
        {/* Status badge */}
        <span style={{
          fontFamily: FONT_MONO,
          fontSize: '0.65rem',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase' as const,
          padding: '3px 10px',
          borderRadius: '4px',
          background: isSuccess ? 'var(--accent-green)' : 'var(--accent-red)',
          color: '#000',
        }}>
          {run.status}
        </span>
        {/* Timestamp */}
        <span style={{
          fontFamily: FONT_MONO,
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
        }}>
          {new Date(run.timestamp).toLocaleString()}
        </span>
        {/* Trigger type */}
        <span style={{
          fontFamily: FONT_MONO,
          fontSize: '0.6rem',
          letterSpacing: '0.05em',
          textTransform: 'uppercase' as const,
          padding: '2px 8px',
          borderRadius: '4px',
          border: '1px solid var(--border)',
          color: 'var(--text-muted)',
        }}>
          {run.trigger === 'schedule' ? 'CRON' : 'MANUAL'}
        </span>
        {/* Fix agent badge */}
        {run.validation.fixAgentInvoked && (
          <span style={{
            fontFamily: FONT_MONO,
            fontSize: '0.6rem',
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase' as const,
            padding: '3px 10px',
            borderRadius: '4px',
            background: 'var(--accent-amber-dim)',
            color: 'var(--accent-amber)',
            border: '1px solid var(--accent-amber)',
          }}>
            Fix Agent: {run.validation.fixAgentResult}
            {run.validation.errorsBeforeFix != null &&
              ` (${run.validation.errorsBeforeFix} \u2192 ${run.validation.errorsAfterFix})`}
          </span>
        )}
      </div>

      {/* Trackers resolved */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap' as const,
        marginBottom: '1.25rem',
      }}>
        <span style={{
          fontFamily: FONT_MONO,
          fontSize: '0.6rem',
          letterSpacing: '0.1em',
          textTransform: 'uppercase' as const,
          color: 'var(--text-muted)',
        }}>
          Trackers:
        </span>
        {run.trackersResolved.map(t => (
          <span key={t} style={{
            fontFamily: FONT_MONO,
            fontSize: '0.7rem',
            padding: '2px 8px',
            borderRadius: '4px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
          }}>
            {t}
          </span>
        ))}
      </div>

      {/* Validation errors table */}
      {run.validation.errors.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '0.75rem',
          }}>
            <span style={{
              fontFamily: FONT_MONO,
              fontSize: '0.6rem',
              letterSpacing: '0.12em',
              textTransform: 'uppercase' as const,
              color: 'var(--accent-red)',
            }}>
              Validation Errors
            </span>
            <span style={{
              fontFamily: FONT_MONO,
              fontSize: '0.6rem',
              fontWeight: 600,
              padding: '1px 6px',
              borderRadius: '3px',
              background: 'var(--accent-red-dim)',
              color: 'var(--accent-red)',
            }}>
              {run.validation.errors.length}
            </span>
          </div>
          <div style={{
            maxHeight: '280px',
            overflow: 'auto',
            border: '1px solid var(--border)',
            borderRadius: '6px',
          }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse' as const,
              background: 'var(--bg-card)',
            }}>
              <thead>
                <tr>
                  <th style={thStyle}>Tracker</th>
                  <th style={thStyle}>File</th>
                  <th style={thStyle}>Field</th>
                  <th style={thStyle}>Error</th>
                </tr>
              </thead>
              <tbody>
                {run.validation.errors.map((err, i) => (
                  <tr key={i}>
                    <td style={tdStyle}>{err.tracker}</td>
                    <td style={{ ...tdStyle, color: 'var(--accent-amber)' }}>{err.file}</td>
                    <td style={{ ...tdStyle, color: 'var(--accent-blue)' }}>{err.field}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontFamily: FONT_SANS, fontSize: '0.75rem' }}>{err.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Data inventory table */}
      {inventoryEntries.length > 0 && (
        <div>
          <div style={{
            fontFamily: FONT_MONO,
            fontSize: '0.6rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase' as const,
            color: 'var(--text-muted)',
            marginBottom: '0.75rem',
          }}>
            Data Inventory
          </div>
          <div style={{
            overflow: 'auto',
            border: '1px solid var(--border)',
            borderRadius: '6px',
          }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse' as const,
              background: 'var(--bg-card)',
            }}>
              <thead>
                <tr>
                  <th style={thStyle}>Tracker</th>
                  {inventoryKeys.map(k => (
                    <th key={k} style={thRightStyle}>
                      {k === 'mapPoints' ? 'Pts' :
                       k === 'mapLines' ? 'Lines' :
                       k.charAt(0).toUpperCase() + k.slice(1)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inventoryEntries.map(([tracker, inv]) => (
                  <tr key={tracker}>
                    <td style={tdStyle}>{tracker}</td>
                    {inventoryKeys.map(k => {
                      const val = inv[k];
                      return (
                        <td key={k} style={{
                          ...tdRightStyle,
                          color: val > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
                          opacity: val > 0 ? 1 : 0.4,
                        }}>
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main component ── */

export default function MetricsDashboard() {
  const [index, setIndex] = useState<MetricsIndexEntry[]>([]);
  const [selectedRun, setSelectedRun] = useState<MetricsRun | null>(null);
  const [selectedTimestamp, setSelectedTimestamp] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingRun, setLoadingRun] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/_metrics/index.json`)
      .then(r => r.json())
      .then((data: MetricsIndexEntry[]) => {
        setIndex(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const sortedEntries = useMemo(
    () => [...index].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [index],
  );

  const summary = useMemo(() => computeSummary(index), [index]);

  const loadRun = async (entry: MetricsIndexEntry) => {
    setSelectedTimestamp(entry.timestamp);
    setLoadingRun(true);
    try {
      const r = await fetch(`${BASE}/_metrics/runs/${entry.file}`);
      const data: MetricsRun = await r.json();
      setSelectedRun(data);
    } catch {
      setSelectedRun(null);
    }
    setLoadingRun(false);
  };

  if (loading) {
    return (
      <div style={{
        padding: '3rem',
        textAlign: 'center' as const,
        color: 'var(--text-muted)',
        fontFamily: FONT_SANS,
      }}>
        Loading metrics...
      </div>
    );
  }

  if (index.length === 0) {
    return (
      <div style={{
        padding: '3rem',
        textAlign: 'center' as const,
        color: 'var(--text-muted)',
        fontFamily: FONT_SANS,
      }}>
        No ingestion runs recorded yet.
      </div>
    );
  }

  const successRateColor = summary.successRate >= 90
    ? 'var(--accent-green)'
    : summary.successRate >= 70
      ? 'var(--accent-amber)'
      : 'var(--accent-red)';

  return (
    <div>
      {/* ── Summary Stats Row ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '1px',
        background: 'var(--border)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        overflow: 'hidden',
        marginBottom: '1.5rem',
      }}>
        <StatCard
          label="Total Runs"
          value={String(summary.totalRuns)}
          subtext={`${sortedEntries.filter(e => e.status === 'success').length} successful`}
        />
        <StatCard
          label="Success Rate"
          value={`${summary.successRate.toFixed(0)}%`}
          color={successRateColor}
          subtext={`${sortedEntries.filter(e => e.status === 'failure').length} failures`}
        />
        <StatCard
          label="Last Run"
          value={summary.lastRunRelative}
          color="var(--accent-blue)"
          subtext={sortedEntries.length > 0 ? formatShortDate(sortedEntries[0].timestamp) : undefined}
        />
        <StatCard
          label="Avg Errors / Run"
          value={String(summary.avgErrorsPerRun)}
          color={summary.avgErrorsPerRun > 0 ? 'var(--accent-amber)' : 'var(--accent-green)'}
          subtext={`across ${summary.totalRuns} runs`}
        />
      </div>

      {/* ── Error Trend Chart ── */}
      <ErrorTrendChart entries={index} />

      {/* ── Run History + Detail ── */}
      <div style={{
        fontFamily: FONT_MONO,
        fontSize: '0.6rem',
        letterSpacing: '0.12em',
        textTransform: 'uppercase' as const,
        color: 'var(--text-muted)',
        marginBottom: '0.75rem',
      }}>
        Run History
      </div>
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: '8px',
        overflow: 'hidden',
        background: 'var(--bg-card)',
      }}>
        {/* Scrollable run list */}
        <div style={{
          display: 'flex',
          overflowX: 'auto' as const,
          borderBottom: selectedRun || loadingRun ? '1px solid var(--border)' : 'none',
        }}>
          {sortedEntries.map((entry) => (
            <RunItem
              key={entry.timestamp}
              entry={entry}
              isSelected={selectedTimestamp === entry.timestamp}
              onClick={() => loadRun(entry)}
            />
          ))}
        </div>
        {/* Detail panel below */}
        {(selectedTimestamp !== null) && (
          <RunDetailPanel run={selectedRun} loading={loadingRun} />
        )}
      </div>
    </div>
  );
}
