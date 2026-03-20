// src/components/islands/mobile/MobileIntelTab.tsx
import { useState } from 'react';
import type { Claim, PolItem, TimelineEra } from '../../../lib/schemas';

type IntelSubTab = 'claims' | 'political' | 'timeline';

interface Props {
  claims: Claim[];
  political: PolItem[];
  timeline: TimelineEra[];
}

export default function MobileIntelTab({ claims, political, timeline }: Props) {
  const [activeSubTab, setActiveSubTab] = useState<IntelSubTab>('claims');

  return (
    <div className="mtab-intel">
      <div className="mtab-subtabs" role="tablist" aria-label="Intel sections">
        {(['claims', 'political', 'timeline'] as IntelSubTab[]).map(tab => (
          <button
            key={tab}
            className={`mtab-subtab${activeSubTab === tab ? ' active' : ''}`}
            onClick={() => setActiveSubTab(tab)}
            role="tab"
            aria-selected={activeSubTab === tab}
          >
            {tab === 'claims' ? 'Claims' : tab === 'political' ? 'Political' : 'Timeline'}
          </button>
        ))}
      </div>

      {activeSubTab === 'claims' && (
        <div className="mtab-data-panel">
          {claims.length > 0 ? (
            claims.map(claim => (
              <div key={claim.id} className="mtab-claim-card">
                <div className="mtab-claim-question">{claim.question}</div>
                <div className="mtab-claim-sides">
                  <div className="mtab-claim-side">
                    <div className="mtab-claim-side-label">{claim.sideA.label}</div>
                    <p>{claim.sideA.text}</p>
                  </div>
                  <div className="mtab-claim-side">
                    <div className="mtab-claim-side-label">{claim.sideB.label}</div>
                    <p>{claim.sideB.text}</p>
                  </div>
                </div>
                {claim.resolution && (
                  <p className="mtab-claim-resolution">{claim.resolution}</p>
                )}
              </div>
            ))
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 16 }}>
              No claims data available.
            </p>
          )}
        </div>
      )}

      {activeSubTab === 'political' && (
        <div className="mtab-data-panel">
          {political.length > 0 ? (
            political.map(pol => {
              const avatarLabel = pol.avatar;
              return (
                <div key={pol.id} className="mtab-political-card">
                  <div className="mtab-political-header">
                    <div className="mtab-political-avatar" aria-hidden="true">
                      {pol.initial}
                    </div>
                    <div className="mtab-political-info">
                      <div className="mtab-political-name">{pol.name}</div>
                      <div className="mtab-political-role">{pol.role}</div>
                    </div>
                    <span className="mtab-political-badge">{avatarLabel}</span>
                  </div>
                  {pol.quote && (
                    <blockquote className="mtab-political-quote">
                      &ldquo;{pol.quote}&rdquo;
                    </blockquote>
                  )}
                </div>
              );
            })
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 16 }}>
              No political data available.
            </p>
          )}
        </div>
      )}

      {activeSubTab === 'timeline' && (
        <div className="mtab-data-panel">
          {timeline.length > 0 ? (
            timeline.map(era => (
              <div key={era.era} className="mtab-era">
                <div className="mtab-era-label">{era.era}</div>
                {era.events.map(ev => (
                  <div key={ev.id} className="mtab-era-event">
                    <span className="mtab-era-date">{ev.year}</span>
                    <span className="mtab-era-title">{ev.title}</span>
                  </div>
                ))}
              </div>
            ))
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 16 }}>
              No timeline data available.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
