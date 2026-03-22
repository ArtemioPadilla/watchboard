import { memo } from 'react';
import type { CSSProperties } from 'react';
import type { TrackerCardData } from '../../../lib/tracker-directory-utils';
import { buildDateline } from '../../../lib/tracker-directory-utils';

interface Props {
  trackers: TrackerCardData[];
  compareSlugs: string[];
  onClose: () => void;
  onRemove: (slug: string) => void;
  basePath: string;
}

const MAX_KPIS_SHOWN = 3;

function resolveComparedTrackers(
  trackers: TrackerCardData[],
  compareSlugs: string[],
): TrackerCardData[] {
  const bySlug = new Map(trackers.map(t => [t.slug, t]));
  return compareSlugs
    .map(slug => bySlug.get(slug))
    .filter((t): t is TrackerCardData => t !== undefined);
}

function buildKpiRows(compared: TrackerCardData[]): Array<{ label: string; values: (string | null)[] }> {
  const allLabels: string[] = [];
  const seen = new Set<string>();

  for (const t of compared) {
    for (const kpi of t.topKpis) {
      const normalized = kpi.label.toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        allLabels.push(kpi.label);
      }
    }
  }

  return allLabels.slice(0, MAX_KPIS_SHOWN).map(label => ({
    label,
    values: compared.map(t => {
      const match = t.topKpis.find(k => k.label.toLowerCase() === label.toLowerCase());
      return match ? match.value : null;
    }),
  }));
}

const ComparePanel = memo(function ComparePanel({
  trackers,
  compareSlugs,
  onClose,
  onRemove,
  basePath,
}: Props) {
  if (compareSlugs.length < 2) return null;

  const compared = resolveComparedTrackers(trackers, compareSlugs);
  if (compared.length < 2) return null;

  const kpiRows = buildKpiRows(compared);

  return (
    <div style={S.overlay}>
      <div style={S.panel}>
        {/* Header */}
        <div style={S.header}>
          <span style={S.title}>
            COMPARING {compared.length} TRACKERS
          </span>
          <button
            type="button"
            onClick={onClose}
            style={S.closeBtn}
            aria-label="Close comparison panel"
          >
            CLOSE
          </button>
        </div>

        {/* Table */}
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.labelCell} />
                {compared.map(t => (
                  <th key={t.slug} style={S.trackerHeader}>
                    <div style={S.trackerHeaderInner}>
                      <span style={{ fontSize: '0.8rem' }}>{t.icon || ''}</span>
                      <span style={{ ...S.trackerName, color: t.color || '#3498db' }}>
                        {t.shortName}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemove(t.slug)}
                        style={S.removeBtn}
                        aria-label={`Remove ${t.shortName} from comparison`}
                        title="Remove"
                      >
                        x
                      </button>
                    </div>
                    <a
                      href={`${basePath}${t.slug}/`}
                      style={S.dashLink}
                    >
                      OPEN
                    </a>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Duration row */}
              <tr>
                <td style={S.labelCell}>Duration</td>
                {compared.map(t => (
                  <td key={t.slug} style={S.valueCell}>
                    {buildDateline(t)}
                  </td>
                ))}
              </tr>
              {/* KPI rows */}
              {kpiRows.map(row => (
                <tr key={row.label}>
                  <td style={S.labelCell}>{row.label}</td>
                  {row.values.map((val, i) => (
                    <td key={compared[i].slug} style={S.valueCell}>
                      {val ?? <span style={S.noData}>--</span>}
                    </td>
                  ))}
                </tr>
              ))}
              {/* Region row */}
              <tr>
                <td style={S.labelCell}>Region</td>
                {compared.map(t => (
                  <td key={t.slug} style={S.valueCell}>
                    {t.region || <span style={S.noData}>--</span>}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});

export default ComparePanel;

// ── Styles ──

const S: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 90,
    pointerEvents: 'none',
  },

  panel: {
    pointerEvents: 'auto',
    height: 240,
    background: 'var(--bg-primary, #0d1117)',
    borderTop: '1px solid var(--border, #30363d)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 -4px 24px rgba(0,0,0,0.4)',
  },

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 16px',
    borderBottom: '1px solid var(--border, #30363d)',
    flexShrink: 0,
  },

  title: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.62rem',
    fontWeight: 700,
    letterSpacing: '0.12em',
    color: 'var(--accent-blue, #58a6ff)',
  },

  closeBtn: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.55rem',
    fontWeight: 600,
    letterSpacing: '0.08em',
    color: 'var(--text-muted, #484f58)',
    background: 'transparent',
    border: '1px solid var(--border, #30363d)',
    borderRadius: 4,
    padding: '3px 10px',
    cursor: 'pointer',
    transition: 'color 0.15s, border-color 0.15s',
  },

  tableWrap: {
    flex: 1,
    overflowX: 'auto',
    overflowY: 'auto',
    padding: '0 16px 8px',
    scrollbarWidth: 'thin',
    scrollbarColor: 'var(--border) transparent',
  },

  table: {
    width: '100%',
    borderCollapse: 'collapse',
    tableLayout: 'fixed',
    marginTop: 8,
  },

  trackerHeader: {
    textAlign: 'center',
    padding: '4px 8px',
    verticalAlign: 'bottom',
    borderBottom: '1px solid var(--border, #30363d)',
    minWidth: 110,
  },

  trackerHeaderInner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },

  trackerName: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.75rem',
    fontWeight: 700,
  },

  removeBtn: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.52rem',
    color: 'var(--text-muted, #484f58)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    opacity: 0.5,
    padding: '0 2px',
    lineHeight: 1,
  },

  dashLink: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.45rem',
    color: 'var(--accent-blue, #58a6ff)',
    textDecoration: 'none',
    letterSpacing: '0.06em',
    opacity: 0.7,
  },

  labelCell: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.56rem',
    fontWeight: 600,
    color: 'var(--text-muted, #484f58)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    padding: '5px 8px 5px 0',
    whiteSpace: 'nowrap',
    textAlign: 'left',
    borderBottom: '1px solid rgba(48,54,61,0.3)',
    width: 90,
  },

  valueCell: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.68rem',
    fontWeight: 600,
    color: 'var(--text-primary, #e6edf3)',
    textAlign: 'center',
    padding: '5px 8px',
    borderBottom: '1px solid rgba(48,54,61,0.3)',
    whiteSpace: 'nowrap',
  },

  noData: {
    color: 'var(--text-muted, #484f58)',
    opacity: 0.4,
  },
};
