import { useState, useMemo } from 'react';
import { trackEvent } from '../../lib/analytics';
import type { StrikeItem, Asset } from '../../lib/schemas';
import { tierClass, tierLabelShort } from '../../lib/tier-utils';
import { MIL_TABS } from '../../lib/constants';

function strikeIcon(icon: string): string {
  return icon === 'target' ? '\u25CE' : icon === 'retaliation' ? '\u26A1' : icon === 'asset' ? '\u25C6' : '\u2726';
}

const MONTH_INDEX: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/** Parse "Feb 28", "Mar 1, 08:10", "Mar 1–2" etc. into a Date (year defaults to 2026). */
function parseTimeField(time: string): Date | null {
  const match = time.match(/^([A-Z][a-z]{2})\s+(\d{1,2})/);
  if (!match) return null;
  const monthIdx = MONTH_INDEX[match[1]];
  if (monthIdx === undefined) return null;
  return new Date(2026, monthIdx, parseInt(match[2], 10));
}

function computeDateRange(strikes: StrikeItem[], retaliation: StrikeItem[]): string {
  const allItems = [...strikes, ...retaliation];
  let earliest: Date | null = null;
  let latest: Date | null = null;

  for (const item of allItems) {
    const d = parseTimeField(item.time);
    if (!d) continue;
    if (!earliest || d < earliest) earliest = d;
    if (!latest || d > latest) latest = d;
  }

  if (!earliest || !latest) return '';

  const fmtShort = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  if (earliest.getTime() === latest.getTime()) return fmtShort(earliest);

  if (earliest.getMonth() === latest.getMonth()) {
    return `${fmtShort(earliest)}\u2013${latest.getDate()}`;
  }
  return `${fmtShort(earliest)}\u2013${fmtShort(latest)}`;
}

interface Props {
  strikeTargets: StrikeItem[];
  retaliationData: StrikeItem[];
  assetsData: Asset[];
  tabs?: { id: string; label: string }[];
}

export default function MilitaryTabs({ strikeTargets, retaliationData, assetsData, tabs }: Props) {
  const milTabs = tabs ?? MIL_TABS;
  const [activeTab, setActiveTab] = useState('strikes');

  const dateRange = useMemo(
    () => computeDateRange(strikeTargets, retaliationData),
    [strikeTargets, retaliationData],
  );

  const renderStrikeList = (items: StrikeItem[]) => (
    <ul className="strike-list">
      {items.map((s, i) => (
        <li key={i} className="strike-item">
          <div className={`strike-icon ${s.icon}`}>{strikeIcon(s.icon)}</div>
          <div className="strike-body">
            <div className="strike-name">{s.name}</div>
            <div className="strike-detail">{s.detail}</div>
          </div>
          <div className="strike-meta">
            <span>{s.time || ''}</span>
            <span className={`source-chip ${tierClass(s.tier)}`} style={{ fontSize: '0.5rem' }}>
              {tierLabelShort(s.tier)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <section className="section" id="sec-military">
      <div className="section-header">
        <span className="section-num">03</span>
        <h2 className="section-title">Military Operations</h2>
        {dateRange && <span className="section-count">{dateRange}</span>}
      </div>
      <div className="tab-row" role="tablist" aria-label="Military operations categories">
        {milTabs.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            aria-controls={`tabpanel-${t.id}`}
            id={`tab-${t.id}`}
            className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => {
              trackEvent('military_tab_switched', { tab_id: t.id });
              setActiveTab(t.id);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
        {activeTab === 'strikes' && renderStrikeList(strikeTargets)}
        {activeTab === 'retaliation' && renderStrikeList(retaliationData)}
        {activeTab === 'assets' && (
          <div className="asset-grid">
            {assetsData.map((a, i) => (
              <div key={i} className="asset-card">
                <div className="asset-type">{a.type}</div>
                <div className="asset-name">{a.name}</div>
                <div className="asset-detail">{a.detail}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
