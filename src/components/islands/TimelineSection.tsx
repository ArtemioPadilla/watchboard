import { useState } from 'react';
import type { TimelineEra, TimelineEvent } from '../../lib/schemas';

function tierClass(t: number): string {
  return t === 1 ? 't1' : t === 2 ? 't2' : t === 3 ? 't3' : 't4';
}

function tierLabel(t: number): string {
  return t === 1 ? 'Official' : t === 2 ? 'Major' : t === 3 ? 'Institutional' : 'Unverified';
}

function poleLabel(pole?: string): string | null {
  if (!pole) return null;
  switch (pole) {
    case 'western': return 'W';
    case 'middle_eastern': return 'ME';
    case 'eastern': return 'E';
    case 'international': return 'I';
    default: return null;
  }
}

interface Props {
  timeline: TimelineEra[];
}

export default function TimelineSection({ timeline }: Props) {
  const [selected, setSelected] = useState<TimelineEvent | null>(null);

  const handleClick = (ev: TimelineEvent) => {
    setSelected(prev => prev === ev ? null : ev);
  };

  const EVENT_TYPES = [
    { type: 'military', color: 'var(--accent-red)', label: 'Military' },
    { type: 'diplomatic', color: 'var(--accent-blue)', label: 'Diplomatic' },
    { type: 'humanitarian', color: 'var(--accent-amber)', label: 'Humanitarian' },
    { type: 'economic', color: 'var(--accent-green)', label: 'Economic' },
  ];

  return (
    <section className="section fade-in" id="sec-timeline">
      <div className="section-header">
        <span className="section-num">01</span>
        <h2 className="section-title">Historical Timeline</h2>
        <span className="section-count">1941 &ndash; Present</span>
      </div>
      <div className="tl-legend">
        {EVENT_TYPES.map(et => (
          <span key={et.type} className="tl-legend-item">
            <span className="tl-legend-dot" style={{ borderColor: et.color }} />
            {et.label}
          </span>
        ))}
        <span className="tl-legend-item">
          <span className="tl-legend-dot active-dot" />
          Active
        </span>
      </div>
      <div className="timeline-container">
        <div className="timeline-track">
          {timeline.map(era => (
            <div className="era-group" key={era.era}>
              <div className="era-label">{era.era}</div>
              <div className="tl-events">
                {era.events.map((ev, i) => (
                  <div
                    key={`${era.era}-${i}`}
                    className="tl-node"
                    style={{ opacity: selected && selected !== ev ? 0.5 : 1 }}
                    onClick={() => handleClick(ev)}
                  >
                    <div className="tl-year">{ev.year}</div>
                    <div className={`tl-dot ${ev.type}${ev.active ? ' active' : ''}`} />
                    <div className="tl-title">{ev.title}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {selected && (
        <div className="tl-detail visible">
          <div className="tl-detail-date">{selected.year}</div>
          <div className="tl-detail-title">{selected.title}</div>
          <div className="tl-detail-body">{selected.detail}</div>
          <div className="tl-detail-sources">
            {(selected.sources || []).map((s, i) => (
              <a
                key={i}
                className={`source-chip ${tierClass(s.tier)}`}
                href={s.url || '#'}
                target="_blank"
                rel="noopener noreferrer"
              >
                {s.pole && poleLabel(s.pole) && (
                  <span className={`source-pole ${s.pole}`}>{poleLabel(s.pole)}</span>
                )}
                {tierLabel(s.tier)} &middot; {s.name}
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
