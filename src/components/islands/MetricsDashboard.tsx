import { useState, useEffect, useMemo, useCallback, useRef } from 'react';

/* ── Types ── */

interface MetricsIndexEntry {
  file: string;
  timestamp: string;
  status: 'success' | 'failure';
  trackerCount: number;
  errorCount: number;
  pipeline?: 'nightly' | 'hourly' | 'seed' | 'init';
}

interface ValidationError {
  tracker: string;
  file: string;
  field: string;
  message: string;
}

interface InventoryRow {
  kpis: number;
  timeline: number;
  mapPoints: number;
  mapLines: number;
  claims: number;
  political: number;
  casualties: number;
  events: number;
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
  inventory: Record<string, InventoryRow>;
}

interface DayBucket {
  date: string;
  runs: number;
  hasFailure: boolean;
}

/* ── Constants ── */

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
const FONT_MONO = "'JetBrains Mono', monospace";
const FONT_SERIF = "'Cormorant Garamond', serif";
const FONT_SANS = "'DM Sans', sans-serif";
const INVENTORY_KEYS: (keyof InventoryRow)[] = [
  'kpis', 'timeline', 'mapPoints', 'mapLines', 'claims', 'political', 'casualties', 'events',
];
const INVENTORY_COLORS: Record<string, string> = {
  kpis: '#3498db',
  timeline: '#a86cc1',
  mapPoints: '#2ecc71',
  mapLines: '#1abc9c',
  claims: '#f39c12',
  political: '#e74c3c',
  casualties: '#e67e22',
  events: '#9b59b6',
};

/* ── Keyframes injected once ── */

const STYLE_ID = 'metrics-dashboard-keyframes';

function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes md-fadeSlideIn {
      from { opacity: 0; transform: translateY(-8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes md-pulse {
      0%, 100% { opacity: 1; }
      50%      { opacity: 0.4; }
    }
    @keyframes md-barAppear {
      from { transform: scaleY(0); }
      to   { transform: scaleY(1); }
    }
  `;
  document.head.appendChild(style);
}

/* ── Helpers ── */

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function dateKey(iso: string): string {
  return iso.slice(0, 10);
}

/* ── Summary computation ── */

interface SummaryStats {
  totalRuns: number;
  successCount: number;
  successRate: number;
  lastRunIso: string;
  lastRunRelative: string;
  totalSchemaErrors: number;
  allPassing: boolean;
}

function computeSummary(entries: MetricsIndexEntry[]): SummaryStats {
  const total = entries.length;
  const successes = entries.filter(e => e.status === 'success').length;
  const rate = total > 0 ? (successes / total) * 100 : 100;
  const totalErrors = entries.reduce((sum, e) => sum + e.errorCount, 0);
  const sorted = [...entries].sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  const latest = sorted[0];
  return {
    totalRuns: total,
    successCount: successes,
    successRate: rate,
    lastRunIso: latest?.timestamp ?? '',
    lastRunRelative: latest ? relativeTime(latest.timestamp) : 'N/A',
    totalSchemaErrors: totalErrors,
    allPassing: latest?.status === 'success',
  };
}

/* ── 30-day calendar computation ── */

function build30DayCalendar(entries: MetricsIndexEntry[]): DayBucket[] {
  const bucketMap = new Map<string, DayBucket>();
  for (const e of entries) {
    const dk = dateKey(e.timestamp);
    const existing = bucketMap.get(dk);
    if (existing) {
      existing.runs++;
      if (e.status === 'failure') existing.hasFailure = true;
    } else {
      bucketMap.set(dk, { date: dk, runs: 1, hasFailure: e.status === 'failure' });
    }
  }

  const today = new Date();
  const days: DayBucket[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dk = d.toISOString().slice(0, 10);
    days.push(bucketMap.get(dk) ?? { date: dk, runs: 0, hasFailure: false });
  }
  return days;
}

/* ── Inventory helpers ── */

function inventoryTotal(inv: InventoryRow): number {
  return INVENTORY_KEYS.reduce((s, k) => s + inv[k], 0);
}

/* ══════════════════════════════════════════════════
   Section 1: System Status Banner
   ══════════════════════════════════════════════════ */

function SystemStatusBanner({ summary }: { summary: SummaryStats }) {
  const isHealthy = summary.allPassing;
  const borderColor = isHealthy ? 'var(--accent-green)' : 'var(--accent-red)';
  const dotColor = borderColor;
  const label = isHealthy ? 'All Systems Operational' : 'Service Degraded';

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderLeft: `4px solid ${borderColor}`,
      borderRadius: '8px',
      padding: '1.25rem 1.5rem',
      marginBottom: '1.5rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '0.75rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: dotColor,
          boxShadow: `0 0 8px ${dotColor}`,
          display: 'inline-block',
          flexShrink: 0,
          animation: isHealthy ? 'none' : 'md-pulse 1.5s ease-in-out infinite',
        }} />
        <span style={{
          fontFamily: FONT_SANS,
          fontSize: '1rem',
          fontWeight: 600,
          color: 'var(--text-primary)',
        }}>
          {label}
        </span>
      </div>
      {summary.lastRunIso && (
        <span style={{
          fontFamily: FONT_MONO,
          fontSize: '0.7rem',
          color: 'var(--text-muted)',
          letterSpacing: '0.03em',
        }}>
          Last successful update: {formatFullDate(summary.lastRunIso)}
        </span>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   Section 2: KPI Summary Row
   ══════════════════════════════════════════════════ */

function KpiCard({ label, value, color, subtext }: {
  label: string;
  value: string;
  color?: string;
  subtext?: string;
}) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      padding: '1.25rem',
      position: 'relative',
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
        color: color ?? 'var(--text-primary)',
      }}>
        {value}
      </div>
      {subtext && (
        <div style={{
          fontFamily: FONT_SANS,
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

function KpiSummaryRow({ summary }: { summary: SummaryStats }) {
  const rateColor = summary.successRate >= 90
    ? 'var(--accent-green)'
    : summary.successRate >= 70
      ? 'var(--accent-amber)'
      : 'var(--accent-red)';

  return (
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
      <KpiCard
        label="Total Runs"
        value={String(summary.totalRuns)}
        subtext={`${summary.successCount} successful`}
      />
      <KpiCard
        label="Success Rate"
        value={`${summary.successRate.toFixed(0)}%`}
        color={rateColor}
        subtext={`${summary.totalRuns - summary.successCount} failures`}
      />
      <KpiCard
        label="Last Run"
        value={summary.lastRunRelative}
        color="var(--accent-blue)"
        subtext={summary.lastRunIso ? formatShortDate(summary.lastRunIso) : undefined}
      />
      <KpiCard
        label="Schema Errors"
        value={String(summary.totalSchemaErrors)}
        color={summary.totalSchemaErrors > 0 ? 'var(--accent-red)' : 'var(--accent-green)'}
        subtext={`across ${summary.totalRuns} runs`}
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════
   Section 3: Uptime Calendar (30 days)
   ══════════════════════════════════════════════════ */

function UptimeCalendar({ entries }: { entries: MetricsIndexEntry[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const days = useMemo(() => build30DayCalendar(entries), [entries]);

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      padding: '1.25rem 1.5rem',
      marginBottom: '1.5rem',
    }}>
      <div style={{
        fontFamily: FONT_MONO,
        fontSize: '0.6rem',
        letterSpacing: '0.12em',
        textTransform: 'uppercase' as const,
        color: 'var(--text-muted)',
        marginBottom: '1rem',
      }}>
        30-Day Run History
      </div>

      <div style={{
        display: 'flex',
        gap: '3px',
        alignItems: 'flex-end',
        height: '40px',
        position: 'relative',
      }}>
        {days.map((day, i) => {
          const barColor = day.runs === 0
            ? 'var(--border-light)'
            : day.hasFailure
              ? 'var(--accent-red)'
              : 'var(--accent-green)';
          const barHeight = day.runs === 0 ? '4px' : '100%';
          const isHovered = hoveredIdx === i;

          return (
            <div
              key={day.date}
              style={{
                flex: 1,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                position: 'relative',
                cursor: 'default',
              }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <div style={{
                width: '100%',
                height: barHeight,
                background: barColor,
                borderRadius: '2px 2px 0 0',
                opacity: isHovered ? 1 : 0.8,
                transition: 'opacity 0.15s',
                transformOrigin: 'bottom',
                animation: `md-barAppear 0.4s ease ${i * 0.02}s both`,
              }} />

              {/* Tooltip */}
              {isHovered && (
                <div style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 8px)',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: '#1a1d28',
                  border: '1px solid var(--border-light)',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  whiteSpace: 'nowrap' as const,
                  zIndex: 20,
                  pointerEvents: 'none',
                  animation: 'md-fadeSlideIn 0.15s ease',
                }}>
                  <div style={{
                    fontFamily: FONT_MONO,
                    fontSize: '0.7rem',
                    color: 'var(--text-primary)',
                    marginBottom: '2px',
                  }}>
                    {new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', weekday: 'short',
                    })}
                  </div>
                  <div style={{
                    fontFamily: FONT_MONO,
                    fontSize: '0.65rem',
                    color: day.runs === 0
                      ? 'var(--text-muted)'
                      : day.hasFailure
                        ? 'var(--accent-red)'
                        : 'var(--accent-green)',
                  }}>
                    {day.runs === 0
                      ? 'No runs'
                      : day.hasFailure
                        ? `${day.runs} run${day.runs > 1 ? 's' : ''} \u00b7 failure`
                        : `${day.runs} run${day.runs > 1 ? 's' : ''} \u00b7 all passed`}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Date labels */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: '6px',
      }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: '0.55rem', color: 'var(--text-muted)' }}>
          {new Date(days[0].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
        <span style={{ fontFamily: FONT_MONO, fontSize: '0.55rem', color: 'var(--text-muted)' }}>
          Today
        </span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   Section 4: Per-Tracker Health Table
   ══════════════════════════════════════════════════ */

function TrackerHealthTable({ latestRun }: { latestRun: MetricsRun | null }) {
  if (!latestRun) return null;
  const inventoryEntries = Object.entries(latestRun.inventory);
  if (inventoryEntries.length === 0) return null;

  // Compute max total for bar scaling
  const maxTotal = Math.max(...inventoryEntries.map(([, inv]) => inventoryTotal(inv)), 1);

  // Compute peer average for events
  const eventCounts = inventoryEntries.map(([, inv]) => inv.events);
  const avgEvents = eventCounts.reduce((s, c) => s + c, 0) / eventCounts.length;

  // Sort by total descending
  const sorted = [...inventoryEntries].sort(
    (a, b) => inventoryTotal(b[1]) - inventoryTotal(a[1]),
  );

  const thBase: React.CSSProperties = {
    textAlign: 'left',
    padding: '0.65rem 1rem',
    fontFamily: FONT_MONO,
    fontSize: '0.6rem',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  };

  const tdBase: React.CSSProperties = {
    padding: '0.65rem 1rem',
    fontFamily: FONT_MONO,
    fontSize: '0.75rem',
    color: 'var(--text-primary)',
    borderBottom: '1px solid var(--border)',
    verticalAlign: 'middle',
  };

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      overflow: 'hidden',
      marginBottom: '1.5rem',
    }}>
      <div style={{
        padding: '1rem 1.25rem 0.75rem',
        fontFamily: FONT_MONO,
        fontSize: '0.6rem',
        letterSpacing: '0.12em',
        textTransform: 'uppercase' as const,
        color: 'var(--text-muted)',
      }}>
        Per-Tracker Data Health
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          minWidth: '600px',
        }}>
          <thead>
            <tr>
              <th style={thBase}>Tracker</th>
              <th style={{ ...thBase, textAlign: 'right' }}>Items</th>
              <th style={{ ...thBase, width: '40%' }}>Distribution</th>
              <th style={{ ...thBase, textAlign: 'center' }}>Health</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(([tracker, inv]) => {
              const total = inventoryTotal(inv);
              const barWidth = (total / maxTotal) * 100;

              // Health assessment based on events count vs peers
              let healthColor = 'var(--accent-green)';
              let healthLabel = 'OK';
              if (inv.events === 0 && avgEvents > 2) {
                healthColor = 'var(--accent-red)';
                healthLabel = 'NO EVENTS';
              } else if (inv.events > 0 && inv.events < avgEvents * 0.3) {
                healthColor = 'var(--accent-amber)';
                healthLabel = 'LOW';
              }

              // Build stacked bar segments
              const segments: { key: string; width: number; color: string }[] = [];
              for (const k of INVENTORY_KEYS) {
                const pct = total > 0 ? (inv[k] / total) * barWidth : 0;
                if (pct > 0) {
                  segments.push({ key: k, width: pct, color: INVENTORY_COLORS[k] });
                }
              }

              return (
                <tr key={tracker} style={{ transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={tdBase}>{tracker}</td>
                  <td style={{ ...tdBase, textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {total}
                  </td>
                  <td style={{ ...tdBase, padding: '0.65rem 1rem' }}>
                    <div style={{
                      display: 'flex',
                      height: '8px',
                      borderRadius: '4px',
                      overflow: 'hidden',
                      background: 'var(--bg-secondary)',
                    }}>
                      {segments.map(seg => (
                        <div
                          key={seg.key}
                          style={{
                            width: `${seg.width}%`,
                            background: seg.color,
                            opacity: 0.85,
                          }}
                          title={`${seg.key}: ${inv[seg.key as keyof InventoryRow]}`}
                        />
                      ))}
                    </div>
                  </td>
                  <td style={{ ...tdBase, textAlign: 'center' }}>
                    <span style={{
                      fontFamily: FONT_MONO,
                      fontSize: '0.6rem',
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      padding: '2px 8px',
                      borderRadius: '3px',
                      background: healthColor === 'var(--accent-green)'
                        ? 'var(--accent-green-dim)'
                        : healthColor === 'var(--accent-amber)'
                          ? 'var(--accent-amber-dim)'
                          : 'var(--accent-red-dim)',
                      color: healthColor,
                    }}>
                      {healthLabel}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Legend */}
      <div style={{
        padding: '0.75rem 1.25rem',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        {INVENTORY_KEYS.map(k => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '2px',
              background: INVENTORY_COLORS[k],
              opacity: 0.85,
              flexShrink: 0,
            }} />
            <span style={{
              fontFamily: FONT_MONO,
              fontSize: '0.55rem',
              color: 'var(--text-muted)',
              textTransform: 'capitalize' as const,
            }}>
              {k === 'mapPoints' ? 'points' : k === 'mapLines' ? 'lines' : k}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   Section 5: Run Log (expandable)
   ══════════════════════════════════════════════════ */

function RunLogEntry({ entry, onExpand, isExpanded, run, loadingRun }: {
  entry: MetricsIndexEntry;
  onExpand: () => void;
  isExpanded: boolean;
  run: MetricsRun | null;
  loadingRun: boolean;
}) {
  const isSuccess = entry.status === 'success';

  // Determine badge style: SUCCESS, FAILURE, or FIXED (if fix agent was invoked and succeeded)
  let badgeLabel = isSuccess ? 'SUCCESS' : 'FAILURE';
  let badgeBg = isSuccess ? 'var(--accent-green-dim)' : 'var(--accent-red-dim)';
  let badgeColor = isSuccess ? 'var(--accent-green)' : 'var(--accent-red)';

  // We can only know about fix-agent from the expanded run data
  if (run?.validation.fixAgentInvoked && run.validation.fixAgentResult === 'success') {
    badgeLabel = 'FIXED';
    badgeBg = 'var(--accent-amber-dim)';
    badgeColor = 'var(--accent-amber)';
  }

  return (
    <div style={{
      borderBottom: '1px solid var(--border)',
    }}>
      {/* Summary row */}
      <button
        onClick={onExpand}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '0.85rem 1.25rem',
          background: isExpanded ? 'var(--bg-card-hover)' : 'var(--bg-card)',
          border: 'none',
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
          transition: 'background 0.15s',
          flexWrap: 'wrap',
        }}
        onMouseEnter={e => {
          if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'var(--bg-card-hover)';
        }}
        onMouseLeave={e => {
          if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)';
        }}
      >
        {/* Expand indicator */}
        <span style={{
          fontFamily: FONT_MONO,
          fontSize: '0.65rem',
          color: 'var(--text-muted)',
          width: '12px',
          textAlign: 'center',
          flexShrink: 0,
          transition: 'transform 0.2s',
          transform: isExpanded ? 'rotate(90deg)' : 'none',
        }}>
          {'\u25B6'}
        </span>

        {/* Date/time */}
        <div style={{ minWidth: '120px' }}>
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

        {/* Status badge */}
        <span style={{
          fontFamily: FONT_MONO,
          fontSize: '0.6rem',
          fontWeight: 600,
          letterSpacing: '0.06em',
          padding: '3px 10px',
          borderRadius: '3px',
          background: badgeBg,
          color: badgeColor,
        }}>
          {badgeLabel}
        </span>

        {/* Pipeline badge */}
        {(() => {
          const pipeline = entry.pipeline ?? 'nightly';
          const pipelineColors: Record<string, { bg: string; color: string }> = {
            nightly: { bg: 'rgba(155, 89, 182, 0.15)', color: '#b98ce0' },
            hourly: { bg: 'rgba(52, 152, 219, 0.15)', color: '#5dade2' },
            seed: { bg: 'rgba(46, 204, 113, 0.15)', color: '#58d68d' },
            init: { bg: 'rgba(243, 156, 18, 0.15)', color: '#f5b041' },
          };
          const style = pipelineColors[pipeline] ?? pipelineColors.nightly;
          return (
            <span style={{
              fontFamily: FONT_MONO,
              fontSize: '0.55rem',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase' as const,
              padding: '2px 8px',
              borderRadius: '3px',
              background: style.bg,
              color: style.color,
            }}>
              {pipeline}
            </span>
          );
        })()}

        {/* Trigger badge */}
        <span style={{
          fontFamily: FONT_MONO,
          fontSize: '0.55rem',
          letterSpacing: '0.06em',
          textTransform: 'uppercase' as const,
          padding: '2px 8px',
          borderRadius: '3px',
          border: '1px solid var(--border)',
          color: 'var(--text-muted)',
          background: 'transparent',
        }}>
          {/* Infer trigger from entry: schedule entries come at regular times */}
          CRON
        </span>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Tracker count */}
        <span style={{
          fontFamily: FONT_MONO,
          fontSize: '0.65rem',
          color: 'var(--text-secondary)',
          padding: '2px 8px',
          background: 'var(--bg-secondary)',
          borderRadius: '4px',
        }}>
          {entry.trackerCount} trackers
        </span>

        {/* Error count */}
        {entry.errorCount > 0 && (
          <span style={{
            fontFamily: FONT_MONO,
            fontSize: '0.65rem',
            fontWeight: 600,
            color: 'var(--accent-red)',
            padding: '2px 8px',
            background: 'var(--accent-red-dim)',
            borderRadius: '4px',
          }}>
            {entry.errorCount} error{entry.errorCount > 1 ? 's' : ''}
          </span>
        )}
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div style={{
          padding: '1rem 1.25rem 1.25rem',
          background: 'var(--bg-secondary)',
          borderTop: '1px solid var(--border)',
          animation: 'md-fadeSlideIn 0.3s ease',
        }}>
          {loadingRun ? (
            <div style={{
              padding: '1.5rem',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontFamily: FONT_SANS,
              fontSize: '0.82rem',
            }}>
              Loading run details...
            </div>
          ) : run ? (
            <RunExpandedDetail run={run} />
          ) : (
            <div style={{
              padding: '1.5rem',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontFamily: FONT_SANS,
              fontSize: '0.82rem',
            }}>
              Failed to load run data
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RunExpandedDetail({ run }: { run: MetricsRun }) {
  const inventoryEntries = Object.entries(run.inventory);

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '0.65rem 1rem',
    fontFamily: FONT_MONO,
    fontSize: '0.6rem',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  };

  const tdStyle: React.CSSProperties = {
    padding: '0.65rem 1rem',
    fontFamily: FONT_MONO,
    fontSize: '0.75rem',
    color: 'var(--text-primary)',
    borderBottom: '1px solid var(--border)',
  };

  return (
    <div>
      {/* Meta row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexWrap: 'wrap',
        marginBottom: '1rem',
      }}>
        <span style={{
          fontFamily: FONT_MONO,
          fontSize: '0.6rem',
          letterSpacing: '0.1em',
          textTransform: 'uppercase' as const,
          color: 'var(--text-muted)',
        }}>
          Resolved:
        </span>
        {run.trackersResolved.map(t => (
          <span key={t} style={{
            fontFamily: FONT_MONO,
            fontSize: '0.65rem',
            padding: '2px 8px',
            borderRadius: '3px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
          }}>
            {t}
          </span>
        ))}

        {/* Fix agent badge */}
        {run.validation.fixAgentInvoked && (
          <span style={{
            fontFamily: FONT_MONO,
            fontSize: '0.6rem',
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase' as const,
            padding: '3px 10px',
            borderRadius: '3px',
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

      {/* Validation errors */}
      {run.validation.errors.length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '0.5rem',
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
            maxHeight: '240px',
            overflow: 'auto',
            border: '1px solid var(--border)',
            borderRadius: '6px',
          }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
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
                    <td style={{
                      ...tdStyle,
                      color: 'var(--text-secondary)',
                      fontFamily: FONT_SANS,
                      fontSize: '0.75rem',
                    }}>
                      {err.message}
                    </td>
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
            marginBottom: '0.5rem',
          }}>
            Data Inventory
          </div>
          <div style={{
            overflow: 'auto',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            maxHeight: '400px',
          }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              background: 'var(--bg-card)',
            }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
                  <th style={{ ...thStyle, background: 'var(--bg-card)' }}>Tracker</th>
                  {INVENTORY_KEYS.map(k => (
                    <th key={k} style={{
                      ...thStyle,
                      textAlign: 'right',
                      background: 'var(--bg-card)',
                    }}>
                      {k === 'mapPoints' ? 'Pts'
                        : k === 'mapLines' ? 'Lines'
                          : k.charAt(0).toUpperCase() + k.slice(1)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inventoryEntries.map(([tracker, inv]) => (
                  <tr key={tracker}>
                    <td style={tdStyle}>{tracker}</td>
                    {INVENTORY_KEYS.map(k => {
                      const val = inv[k];
                      return (
                        <td key={k} style={{
                          ...tdStyle,
                          textAlign: 'right',
                          color: val > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
                          opacity: val > 0 ? 1 : 0.35,
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

function RunLog({ entries, expandedTimestamp, loadedRuns, loadingTimestamp, onToggle }: {
  entries: MetricsIndexEntry[];
  expandedTimestamp: string | null;
  loadedRuns: Map<string, MetricsRun>;
  loadingTimestamp: string | null;
  onToggle: (entry: MetricsIndexEntry) => void;
}) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      overflow: 'hidden',
      marginBottom: '1.5rem',
    }}>
      <div style={{
        padding: '1rem 1.25rem 0',
        fontFamily: FONT_MONO,
        fontSize: '0.6rem',
        letterSpacing: '0.12em',
        textTransform: 'uppercase' as const,
        color: 'var(--text-muted)',
        marginBottom: '0.75rem',
      }}>
        Run Log
      </div>
      {entries.map(entry => (
        <RunLogEntry
          key={entry.timestamp}
          entry={entry}
          isExpanded={expandedTimestamp === entry.timestamp}
          onExpand={() => onToggle(entry)}
          run={loadedRuns.get(entry.timestamp) ?? null}
          loadingRun={loadingTimestamp === entry.timestamp}
        />
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   Section 6: Error Trend Chart
   ══════════════════════════════════════════════════ */

function ErrorTrendChart({ entries }: { entries: MetricsIndexEntry[] }) {
  const recent = useMemo(
    () => [...entries]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-30),
    [entries],
  );

  const hasErrors = recent.some(r => r.errorCount > 0);
  if (!hasErrors || recent.length < 2) return null;

  const maxErrors = Math.max(...recent.map(r => r.errorCount), 1);
  const w = 600;
  const h = 100;
  const padX = 24;
  const padY = 16;
  const chartW = w - padX * 2;
  const chartH = h - padY * 2;
  const step = chartW / Math.max(recent.length - 1, 1);

  const points = recent.map((r, i) => ({
    x: padX + i * step,
    y: h - padY - (r.errorCount / maxErrors) * chartH,
    entry: r,
  }));

  const linePath = points.map(p => `${p.x},${p.y}`).join(' ');
  const areaPath = `${points[0].x},${h - padY} ${linePath} ${points[points.length - 1].x},${h - padY}`;

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      padding: '1.25rem 1.5rem',
      marginBottom: '1.5rem',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
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
          fontSize: '0.55rem',
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
          display: 'block',
        }}
      >
        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map(frac => {
          const y = h - padY - frac * chartH;
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

        {/* Zero line */}
        <line
          x1={padX}
          y1={h - padY}
          x2={w - padX}
          y2={h - padY}
          stroke="var(--border-light)"
          strokeWidth="0.5"
        />

        {/* Area fill */}
        <polygon
          points={areaPath}
          fill="var(--accent-red)"
          opacity="0.1"
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
            r={p.entry.errorCount > 0 ? 3.5 : 2.5}
            fill={p.entry.errorCount > 0 ? 'var(--accent-red)' : 'var(--accent-green)'}
            opacity={p.entry.errorCount > 0 ? 1 : 0.6}
          />
        ))}

        {/* Y axis labels */}
        <text
          x={padX - 4}
          y={padY + 4}
          textAnchor="end"
          fill="var(--text-muted)"
          fontSize="7"
          fontFamily={FONT_MONO}
        >
          {maxErrors}
        </text>
        <text
          x={padX - 4}
          y={h - padY + 3}
          textAnchor="end"
          fill="var(--text-muted)"
          fontSize="7"
          fontFamily={FONT_MONO}
        >
          0
        </text>

        {/* X axis labels: first and last */}
        <text
          x={points[0].x}
          y={h - 2}
          textAnchor="start"
          fill="var(--text-muted)"
          fontSize="7"
          fontFamily={FONT_MONO}
        >
          {formatShortDate(recent[0].timestamp)}
        </text>
        <text
          x={points[points.length - 1].x}
          y={h - 2}
          textAnchor="end"
          fill="var(--text-muted)"
          fontSize="7"
          fontFamily={FONT_MONO}
        >
          {formatShortDate(recent[recent.length - 1].timestamp)}
        </text>
      </svg>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   Main Component
   ══════════════════════════════════════════════════ */

export default function MetricsDashboard() {
  const [index, setIndex] = useState<MetricsIndexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTimestamp, setExpandedTimestamp] = useState<string | null>(null);
  const [loadingTimestamp, setLoadingTimestamp] = useState<string | null>(null);
  const [loadedRuns, setLoadedRuns] = useState<Map<string, MetricsRun>>(new Map());
  const [latestRun, setLatestRun] = useState<MetricsRun | null>(null);
  const [pipelineFilter, setPipelineFilter] = useState<'all' | 'nightly' | 'hourly'>('all');
  const mountedRef = useRef(true);

  useEffect(() => {
    ensureKeyframes();
    return () => { mountedRef.current = false; };
  }, []);

  // Fetch index
  useEffect(() => {
    fetch(`${BASE}/_metrics/index.json`)
      .then(r => r.json())
      .then((data: MetricsIndexEntry[]) => {
        if (!mountedRef.current) return;
        setIndex(data);
        setLoading(false);

        // Auto-load the latest run for the health table
        const sorted = [...data].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );
        if (sorted.length > 0) {
          fetch(`${BASE}/_metrics/runs/${sorted[0].file}`)
            .then(r2 => r2.json())
            .then((run: MetricsRun) => {
              if (!mountedRef.current) return;
              setLatestRun(run);
              setLoadedRuns(prev => {
                const next = new Map(prev);
                next.set(sorted[0].timestamp, run);
                return next;
              });
            })
            .catch(() => {/* non-critical */});
        }
      })
      .catch(() => setLoading(false));
  }, []);

  const filteredEntries = useMemo(
    () => pipelineFilter === 'all'
      ? index
      : index.filter(e => (e.pipeline ?? 'nightly') === pipelineFilter),
    [index, pipelineFilter],
  );

  const sortedEntries = useMemo(
    () => [...filteredEntries].sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    ),
    [filteredEntries],
  );

  const summary = useMemo(() => computeSummary(filteredEntries), [filteredEntries]);

  const handleToggle = useCallback(async (entry: MetricsIndexEntry) => {
    // Collapse if already expanded
    if (expandedTimestamp === entry.timestamp) {
      setExpandedTimestamp(null);
      return;
    }

    setExpandedTimestamp(entry.timestamp);

    // Already loaded
    if (loadedRuns.has(entry.timestamp)) return;

    // Fetch
    setLoadingTimestamp(entry.timestamp);
    try {
      const r = await fetch(`${BASE}/_metrics/runs/${entry.file}`);
      const data: MetricsRun = await r.json();
      if (!mountedRef.current) return;
      setLoadedRuns(prev => {
        const next = new Map(prev);
        next.set(entry.timestamp, data);
        return next;
      });
    } catch {
      // leave as null
    }
    if (mountedRef.current) setLoadingTimestamp(null);
  }, [expandedTimestamp, loadedRuns]);

  if (loading) {
    return (
      <div style={{
        padding: '4rem 2rem',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontFamily: FONT_SANS,
        fontSize: '0.85rem',
      }}>
        <div style={{
          width: '24px',
          height: '24px',
          border: '2px solid var(--border)',
          borderTopColor: 'var(--accent-blue)',
          borderRadius: '50%',
          animation: 'md-pulse 1s linear infinite',
          margin: '0 auto 1rem',
        }} />
        Loading system status...
      </div>
    );
  }

  if (index.length === 0) {
    return (
      <div style={{
        padding: '4rem 2rem',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontFamily: FONT_SANS,
        fontSize: '0.85rem',
      }}>
        No ingestion runs recorded yet.
      </div>
    );
  }

  return (
    <div style={{ fontFamily: FONT_SANS }}>
      {/* Section 1: System Status Banner */}
      <SystemStatusBanner summary={summary} />

      {/* Pipeline filter pills */}
      <div style={{
        display: 'flex',
        gap: '4px',
        marginBottom: '1.5rem',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '4px',
        width: 'fit-content',
      }}>
        {([
          { key: 'all' as const, label: 'ALL' },
          { key: 'nightly' as const, label: 'NIGHTLY' },
          { key: 'hourly' as const, label: 'HOURLY' },
        ]).map(({ key, label }) => {
          const isActive = pipelineFilter === key;
          return (
            <button
              key={key}
              onClick={() => setPipelineFilter(key)}
              style={{
                fontFamily: FONT_MONO,
                fontSize: '0.6rem',
                fontWeight: 600,
                letterSpacing: '0.08em',
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s',
                background: isActive ? 'var(--accent-blue)' : 'transparent',
                color: isActive ? '#fff' : 'var(--text-muted)',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Section 2: KPI Summary Row */}
      <KpiSummaryRow summary={summary} />

      {/* Section 3: Uptime Calendar */}
      <UptimeCalendar entries={filteredEntries} />

      {/* Section 4: Per-Tracker Health Table */}
      <TrackerHealthTable latestRun={latestRun} />

      {/* Section 5: Run Log */}
      <RunLog
        entries={sortedEntries}
        expandedTimestamp={expandedTimestamp}
        loadedRuns={loadedRuns}
        loadingTimestamp={loadingTimestamp}
        onToggle={handleToggle}
      />

      {/* Section 6: Error Trend Chart (conditional) */}
      <ErrorTrendChart entries={filteredEntries} />
    </div>
  );
}
