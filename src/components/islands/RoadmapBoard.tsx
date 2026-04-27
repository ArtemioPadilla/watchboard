import { useMemo, useState, useCallback } from 'react';
import {
  ROADMAP_ITEMS,
  AREA_META,
  STATUS_META,
  MILESTONES,
  counts as countsFn,
  type RoadmapItem,
  type RoadmapArea,
  type RoadmapStatus,
  type RoadmapMilestone,
} from '../../data/roadmap-items';

type View = 'kanban' | 'timeline';

interface Props {
  /** From import.meta.env.BASE_URL on the Astro side. */
  basePath: string;
}

const STATUS_ORDER: RoadmapStatus[] = ['shipped', 'in-progress', 'planned', 'idea'];
const MILESTONE_ORDER: RoadmapMilestone[] = ['M1', 'M2', 'M3', 'M4', 'future'];

export default function RoadmapBoard({ basePath }: Props) {
  const [view, setView] = useState<View>('kanban');
  const [areaFilter, setAreaFilter] = useState<RoadmapArea | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const c = useMemo(countsFn, []);

  const filtered = useMemo(() => {
    if (areaFilter === 'all') return ROADMAP_ITEMS;
    return ROADMAP_ITEMS.filter((i) => i.area === areaFilter);
  }, [areaFilter]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="rm-root">
      {/* Stats banner */}
      <div className="rm-stats" role="status" aria-label="Roadmap status counts">
        <Stat label="Shipped"     value={c.shipped}    color={STATUS_META.shipped.color} />
        <Stat label="In progress" value={c.inProgress} color={STATUS_META['in-progress'].color} />
        <Stat label="Planned"     value={c.planned}    color={STATUS_META.planned.color} />
        <Stat label="Ideas"       value={c.idea}       color={STATUS_META.idea.color} />
        <Stat label="Total"       value={c.total}      color="var(--text-primary, #e6edf3)" muted />
      </div>

      {/* View toggle + area filters */}
      <div className="rm-controls">
        <div className="rm-view-toggle" role="tablist" aria-label="View mode">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'kanban'}
            className={view === 'kanban' ? 'rm-view-btn active' : 'rm-view-btn'}
            onClick={() => setView('kanban')}
          >
            ▦ Kanban
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'timeline'}
            className={view === 'timeline' ? 'rm-view-btn active' : 'rm-view-btn'}
            onClick={() => setView('timeline')}
          >
            ▭ Timeline
          </button>
        </div>

        <div className="rm-area-filters" role="group" aria-label="Filter by area">
          <button
            type="button"
            className={areaFilter === 'all' ? 'rm-chip active' : 'rm-chip'}
            onClick={() => setAreaFilter('all')}
          >
            All ({ROADMAP_ITEMS.length})
          </button>
          {(Object.keys(AREA_META) as RoadmapArea[]).map((area) => {
            const meta = AREA_META[area];
            const count = ROADMAP_ITEMS.filter((i) => i.area === area).length;
            if (count === 0) return null;
            return (
              <button
                key={area}
                type="button"
                className={areaFilter === area ? 'rm-chip active' : 'rm-chip'}
                onClick={() => setAreaFilter(area)}
                style={{ borderColor: meta.color, color: meta.color }}
              >
                {meta.emoji} {meta.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Boards */}
      {view === 'kanban' ? (
        <div className="rm-kanban">
          {STATUS_ORDER.map((status) => {
            const items = filtered.filter((i) => i.status === status);
            const meta = STATUS_META[status];
            return (
              <section key={status} className="rm-column" aria-label={`${meta.label} column`}>
                <header className="rm-column-header">
                  <span className="rm-column-dot" style={{ background: meta.color }} aria-hidden="true" />
                  <span className="rm-column-title">{meta.label}</span>
                  <span className="rm-column-count">{items.length}</span>
                </header>
                <p className="rm-column-desc">{meta.description}</p>
                <div className="rm-column-cards">
                  {items.length === 0 && <div className="rm-empty">No items match this filter</div>}
                  {items.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      expanded={expandedId === item.id}
                      onToggle={() => toggleExpand(item.id)}
                      basePath={basePath}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="rm-timeline">
          {MILESTONE_ORDER.map((m) => {
            const items = filtered.filter((i) => i.milestone === m);
            const meta = MILESTONES[m];
            return (
              <section key={m} className="rm-mstone" aria-label={meta.label}>
                <header className="rm-mstone-header">
                  <h3>{meta.label}</h3>
                  <p>{meta.theme}</p>
                </header>
                <div className="rm-mstone-cards">
                  {items.length === 0 && <div className="rm-empty">No items match this filter</div>}
                  {items.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      expanded={expandedId === item.id}
                      onToggle={() => toggleExpand(item.id)}
                      basePath={basePath}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <RoadmapStyles />
    </div>
  );
}

function Stat({ label, value, color, muted }: { label: string; value: number; color: string; muted?: boolean }) {
  return (
    <div className="rm-stat" style={muted ? { opacity: 0.7 } : undefined}>
      <div className="rm-stat-value" style={{ color }}>{value}</div>
      <div className="rm-stat-label">{label}</div>
    </div>
  );
}

function ItemCard({
  item,
  expanded,
  onToggle,
  basePath,
}: {
  item: RoadmapItem;
  expanded: boolean;
  onToggle: () => void;
  basePath: string;
}) {
  const area = AREA_META[item.area];
  const status = STATUS_META[item.status];
  const dependsOnTitles = (item.dependsOn ?? [])
    .map((id) => ROADMAP_ITEMS.find((it) => it.id === id)?.title)
    .filter(Boolean) as string[];

  return (
    <article
      className={`rm-card ${expanded ? 'expanded' : ''}`}
      style={{ borderLeftColor: area.color }}
      aria-expanded={expanded}
    >
      <button
        type="button"
        className="rm-card-toggle"
        onClick={onToggle}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${item.title}`}
      >
        <div className="rm-card-head">
          <span className="rm-card-title">{item.title}</span>
          <span className="rm-card-chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        </div>
        <div className="rm-card-badges">
          <span className="rm-badge" style={{ color: area.color, borderColor: area.color }}>
            {area.emoji} {area.label}
          </span>
          <span className="rm-badge rm-badge-priority" data-priority={item.priority}>{item.priority}</span>
          <span className="rm-badge rm-badge-effort">{item.effort}</span>
          <span className="rm-badge" style={{ color: status.color, borderColor: status.color }}>{status.label}</span>
        </div>
      </button>
      {expanded && (
        <div className="rm-card-body">
          <p className="rm-card-desc">{item.description}</p>
          {item.outcome && (
            <p className="rm-card-outcome">
              <strong>Outcome:</strong> {item.outcome}
            </p>
          )}
          {dependsOnTitles.length > 0 && (
            <div className="rm-card-deps">
              <strong>Depends on:</strong>{' '}
              {dependsOnTitles.map((t, i) => (
                <span key={t}>{t}{i < dependsOnTitles.length - 1 ? ', ' : ''}</span>
              ))}
            </div>
          )}
          {item.prs && item.prs.length > 0 && (
            <div className="rm-card-prs">
              <strong>PRs:</strong>{' '}
              {item.prs.map((n) => (
                <a
                  key={n}
                  href={`https://github.com/ArtemioPadilla/watchboard/pull/${n}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >#{n}</a>
              )).reduce<React.ReactNode[]>((acc, link, i) => {
                if (i > 0) acc.push(<span key={`sep-${i}`}>, </span>);
                acc.push(link);
                return acc;
              }, [])}
            </div>
          )}
          <div className="rm-card-meta">
            <span>{item.date}</span>
            <span>·</span>
            <span>{MILESTONES[item.milestone].label}</span>
          </div>
        </div>
      )}
    </article>
  );
}

function RoadmapStyles() {
  return (
    <style>{`
.rm-root { font-family: 'DM Sans', sans-serif; color: var(--text-primary, #e6edf3); }

/* Stats */
.rm-stats {
  display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px;
  margin-bottom: 24px; padding: 16px;
  background: var(--bg-card, #161b22); border: 1px solid var(--border, #30363d); border-radius: 10px;
}
@media (max-width: 640px) { .rm-stats { grid-template-columns: repeat(2, 1fr); } }
.rm-stat { text-align: center; }
.rm-stat-value { font-family: 'JetBrains Mono', monospace; font-size: 1.8rem; font-weight: 700; line-height: 1.1; }
.rm-stat-label { font-size: 0.65rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted, #8b949e); margin-top: 4px; }

/* Controls */
.rm-controls { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
.rm-view-toggle { display: inline-flex; gap: 0; border: 1px solid var(--border, #30363d); border-radius: 8px; overflow: hidden; align-self: flex-start; }
.rm-view-btn {
  background: transparent; border: none; padding: 6px 14px;
  color: var(--text-secondary, #8b949e); font-family: inherit; font-size: 0.75rem; font-weight: 600;
  cursor: pointer; transition: background 0.15s, color 0.15s;
}
.rm-view-btn.active { background: var(--accent-blue, #58a6ff); color: white; }
.rm-area-filters { display: flex; flex-wrap: wrap; gap: 6px; }
.rm-chip {
  background: transparent; border: 1px solid var(--border, #30363d); border-radius: 999px;
  padding: 4px 10px; font-family: inherit; font-size: 0.7rem; font-weight: 500;
  color: var(--text-secondary, #8b949e); cursor: pointer; transition: background 0.15s, color 0.15s;
}
.rm-chip.active { background: rgba(255,255,255,0.06); }
.rm-chip:hover { background: rgba(255,255,255,0.04); }

/* Kanban */
.rm-kanban {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;
  align-items: start;
}
@media (max-width: 1100px) { .rm-kanban { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 600px)  { .rm-kanban { grid-template-columns: 1fr; } }
.rm-column {
  background: var(--bg-card, #161b22); border: 1px solid var(--border, #30363d);
  border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 10px;
}
.rm-column-header { display: flex; align-items: center; gap: 8px; }
.rm-column-dot { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto; }
.rm-column-title { font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
.rm-column-count { margin-left: auto; font-family: 'JetBrains Mono', monospace; font-size: 0.65rem; color: var(--text-muted, #8b949e); }
.rm-column-desc { margin: 0; font-size: 0.65rem; color: var(--text-muted, #8b949e); }
.rm-column-cards { display: flex; flex-direction: column; gap: 8px; }

/* Timeline */
.rm-timeline { display: flex; flex-direction: column; gap: 24px; }
.rm-mstone {
  background: var(--bg-card, #161b22); border: 1px solid var(--border, #30363d);
  border-radius: 10px; padding: 16px;
}
.rm-mstone-header { margin-bottom: 12px; }
.rm-mstone-header h3 { margin: 0 0 4px; font-family: 'Cormorant Garamond', serif; font-size: 1.3rem; font-weight: 700; }
.rm-mstone-header p { margin: 0; font-size: 0.75rem; color: var(--text-secondary, #8b949e); }
.rm-mstone-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 8px; }

/* Card */
.rm-card {
  background: var(--bg-secondary, #0d1117);
  border: 1px solid var(--border, #30363d);
  border-left: 3px solid var(--border, #30363d);
  border-radius: 6px; transition: transform 0.15s, box-shadow 0.15s;
}
.rm-card:hover { transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,0.25); }
.rm-card.expanded { box-shadow: 0 4px 12px rgba(0,0,0,0.35); }
.rm-card-toggle {
  width: 100%; background: transparent; border: none; padding: 10px 12px;
  text-align: left; cursor: pointer; color: inherit; font-family: inherit;
}
.rm-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.rm-card-title { font-size: 0.78rem; font-weight: 600; line-height: 1.3; flex: 1; }
.rm-card-chevron { font-size: 0.7rem; color: var(--text-muted, #8b949e); flex: 0 0 auto; }
.rm-card-badges { display: flex; flex-wrap: wrap; gap: 4px; }
.rm-badge {
  font-family: 'JetBrains Mono', monospace; font-size: 0.55rem; font-weight: 600;
  letter-spacing: 0.04em; padding: 2px 6px; border: 1px solid var(--border, #30363d);
  border-radius: 4px; color: var(--text-muted, #8b949e); background: transparent;
}
.rm-badge-priority[data-priority="P0"] { color: var(--tier-4, #e74c3c); border-color: var(--tier-4, #e74c3c); }
.rm-badge-priority[data-priority="P1"] { color: var(--tier-3, #f39c12); border-color: var(--tier-3, #f39c12); }
.rm-badge-priority[data-priority="P2"] { color: var(--tier-2, #58a6ff); border-color: var(--tier-2, #58a6ff); }
.rm-badge-priority[data-priority="P3"] { color: var(--text-muted, #8b949e); border-color: var(--text-muted, #8b949e); }
.rm-badge-effort { color: var(--text-muted, #8b949e); }

.rm-card-body {
  padding: 0 12px 12px;
  border-top: 1px solid var(--border, #30363d);
  margin-top: 6px;
  font-size: 0.75rem;
  color: var(--text-secondary, #8b949e);
  line-height: 1.5;
}
.rm-card-body > * { margin: 10px 0 0; }
.rm-card-body strong { color: var(--text-primary, #e6edf3); font-weight: 600; }
.rm-card-outcome {
  background: rgba(46,160,113,0.08); border-left: 2px solid var(--accent-green, #2ecc71);
  padding: 6px 10px; border-radius: 0 4px 4px 0;
}
.rm-card-prs a { color: var(--accent-blue, #58a6ff); text-decoration: none; }
.rm-card-prs a:hover { text-decoration: underline; }
.rm-card-meta {
  display: flex; gap: 6px; font-family: 'JetBrains Mono', monospace; font-size: 0.55rem;
  letter-spacing: 0.04em; color: var(--text-muted, #8b949e); padding-top: 8px;
  border-top: 1px solid var(--border, #30363d);
}

.rm-empty {
  font-size: 0.7rem; color: var(--text-muted, #8b949e);
  text-align: center; padding: 16px; border: 1px dashed var(--border, #30363d); border-radius: 6px;
}
`}</style>
  );
}
