// src/components/islands/mobile/MobileDataTab.tsx
import { useState } from 'react';
import type { KpiItem, CasualtyRow, EconItem, StrikeItem, Asset } from '../../../lib/schemas';
import { contestedBadge } from '../../../lib/tier-utils';

type DataSubTab = 'casualties' | 'economic' | 'military';

interface Props {
  kpis: KpiItem[];
  casualties: CasualtyRow[];
  econ: EconItem[];
  strikeTargets: StrikeItem[];
  retaliationData: StrikeItem[];
  assetsData: Asset[];
}

export default function MobileDataTab({
  kpis,
  casualties,
  econ,
  strikeTargets,
  retaliationData,
  assetsData,
}: Props) {
  const [activeSubTab, setActiveSubTab] = useState<DataSubTab>('casualties');

  return (
    <div className="mtab-data">
      <div className="mtab-subtabs" role="tablist" aria-label="Data sections">
        {(['casualties', 'economic', 'military'] as DataSubTab[]).map(tab => (
          <button
            key={tab}
            className={`mtab-subtab${activeSubTab === tab ? ' active' : ''}`}
            onClick={() => setActiveSubTab(tab)}
            role="tab"
            aria-selected={activeSubTab === tab}
          >
            {tab === 'casualties' ? 'Casualties' : tab === 'economic' ? 'Economic' : 'Military'}
          </button>
        ))}
      </div>

      {activeSubTab === 'casualties' && (
        <div className="mtab-data-panel">
          {kpis.length > 0 && (
            <>
              <div className="mtab-section-label">Key Indicators</div>
              <div className="mtab-kpi-grid">
                {kpis.map(kpi => (
                  <div key={kpi.id} className={`mtab-kpi-card ${kpi.color}`}>
                    <div className="mtab-kpi-card-label">{kpi.label}</div>
                    <div className="mtab-kpi-card-value">{kpi.value}</div>
                    <div className="mtab-kpi-card-source">{kpi.source}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {casualties.length > 0 && (
            <>
              <div className="mtab-section-label">Breakdown</div>
              {casualties.map(row => {
                const badge = contestedBadge(row.contested);
                return (
                  <div key={row.id} className="mtab-data-row">
                    <div>
                      <div className="mtab-data-row-label">{row.category}</div>
                      {row.note && (
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          {row.note}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="mtab-data-row-value">
                        {row.killed !== '—' && row.killed !== '' ? `${row.killed} killed` : ''}
                        {row.killed !== '—' && row.killed !== '' && row.injured !== '—' && row.injured !== '' ? ' / ' : ''}
                        {row.injured !== '—' && row.injured !== '' ? `${row.injured} injured` : ''}
                      </div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                        <span className={badge.className}>{badge.text}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {kpis.length === 0 && casualties.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 16 }}>
              No casualty data available.
            </p>
          )}
        </div>
      )}

      {activeSubTab === 'economic' && (
        <div className="mtab-data-panel">
          {econ.length > 0 ? (
            econ.map(item => (
              <div key={item.id} className="mtab-econ-card">
                <div className="mtab-econ-label">{item.label}</div>
                <div className="mtab-econ-value">{item.value}</div>
                <div className={`mtab-econ-change ${item.direction}`}>
                  {item.direction === 'up' ? '▲' : '▼'} {item.change}
                </div>
                <div className="mtab-econ-source">{item.source}</div>
              </div>
            ))
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 16 }}>
              No economic data available.
            </p>
          )}
        </div>
      )}

      {activeSubTab === 'military' && (
        <div className="mtab-data-panel">
          {strikeTargets.length > 0 && (
            <>
              <div className="mtab-section-label">Strike Targets</div>
              {strikeTargets.map(item => (
                <div key={item.id} className="mtab-strike-row">
                  <span className="mtab-strike-name">{item.name}</span>
                  <span className="mtab-strike-detail">{item.detail}</span>
                </div>
              ))}
            </>
          )}

          {retaliationData.length > 0 && (
            <>
              <div className="mtab-section-label">Retaliation</div>
              {retaliationData.map(item => (
                <div key={item.id} className="mtab-strike-row">
                  <span className="mtab-strike-name">{item.name}</span>
                  <span className="mtab-strike-detail">{item.detail}</span>
                </div>
              ))}
            </>
          )}

          {assetsData.length > 0 && (
            <>
              <div className="mtab-section-label">Assets</div>
              {assetsData.map(item => (
                <div key={item.id} className="mtab-strike-row">
                  <span className="mtab-strike-name">{item.name}</span>
                  <span className="mtab-strike-detail">{item.detail}</span>
                </div>
              ))}
            </>
          )}

          {strikeTargets.length === 0 && retaliationData.length === 0 && assetsData.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 16 }}>
              No military data available.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
