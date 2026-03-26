import { useState, useEffect } from 'react';

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

export default function MetricsDashboard() {
  const [index, setIndex] = useState<MetricsIndexEntry[]>([]);
  const [selectedRun, setSelectedRun] = useState<MetricsRun | null>(null);
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

  const loadRun = async (entry: MetricsIndexEntry) => {
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

  const renderErrorTrend = () => {
    if (index.length < 2) return null;
    const recent = [...index].reverse().slice(-30);
    const maxErrors = Math.max(...recent.map(r => r.errorCount), 1);
    const w = 600;
    const h = 80;
    const pad = 4;
    const step = (w - pad * 2) / Math.max(recent.length - 1, 1);

    const points = recent.map((r, i) => {
      const x = pad + i * step;
      const y = h - pad - ((r.errorCount / maxErrors) * (h - pad * 2));
      return `${x},${y}`;
    }).join(' ');

    return (
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
          Validation Errors (last {recent.length} runs)
        </h3>
        <svg
          viewBox={`0 0 ${w} ${h}`}
          style={{ width: '100%', maxWidth: '600px', background: 'var(--bg-secondary)', borderRadius: '8px' }}
        >
          <polyline
            points={points}
            fill="none"
            stroke="var(--accent-red)"
            strokeWidth="2"
          />
          {recent.map((r, i) => {
            const x = pad + i * step;
            const y = h - pad - ((r.errorCount / maxErrors) * (h - pad * 2));
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={3}
                fill={r.status === 'success' ? 'var(--accent-green)' : 'var(--accent-red)'}
              />
            );
          })}
        </svg>
      </div>
    );
  };

  if (loading) {
    return <p style={{ color: 'var(--text-secondary)' }}>Loading metrics...</p>;
  }

  if (index.length === 0) {
    return <p style={{ color: 'var(--text-secondary)' }}>No ingestion runs recorded yet.</p>;
  }

  return (
    <div>
      {renderErrorTrend()}

      <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
        Run History
      </h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '2rem' }}>
        {[...index].reverse().map((entry, i) => (
          <button
            key={i}
            onClick={() => loadRun(entry)}
            title={`${entry.timestamp} — ${entry.status} — ${entry.errorCount} errors`}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              background: entry.status === 'success' ? 'var(--accent-green)' : 'var(--accent-red)',
              opacity: selectedRun?.timestamp === entry.timestamp ? 1 : 0.6,
            }}
          />
        ))}
      </div>

      {loadingRun && <p style={{ color: 'var(--text-secondary)' }}>Loading run details...</p>}

      {selectedRun && !loadingRun && (
        <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <span style={{
              padding: '2px 10px',
              borderRadius: '4px',
              fontSize: '0.8rem',
              fontWeight: 600,
              background: selectedRun.status === 'success' ? 'var(--accent-green)' : 'var(--accent-red)',
              color: '#000',
            }}>
              {selectedRun.status.toUpperCase()}
            </span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              {new Date(selectedRun.timestamp).toLocaleString()}
            </span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              {selectedRun.trigger}
            </span>
            {selectedRun.validation.fixAgentInvoked && (
              <span style={{
                padding: '2px 10px',
                borderRadius: '4px',
                fontSize: '0.8rem',
                background: 'var(--accent-amber)',
                color: '#000',
              }}>
                Fix Agent: {selectedRun.validation.fixAgentResult}
                {selectedRun.validation.errorsBeforeFix != null &&
                  ` (${selectedRun.validation.errorsBeforeFix} → ${selectedRun.validation.errorsAfterFix})`}
              </span>
            )}
          </div>

          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Trackers: {selectedRun.trackersResolved.join(', ')}
          </p>

          {selectedRun.validation.errors.length > 0 && (
            <>
              <h4 style={{ color: 'var(--accent-red)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                Validation Errors ({selectedRun.validation.errors.length})
              </h4>
              <div style={{ maxHeight: '300px', overflow: 'auto', marginBottom: '1rem' }}>
                <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '4px 8px' }}>Tracker</th>
                      <th style={{ textAlign: 'left', padding: '4px 8px' }}>File</th>
                      <th style={{ textAlign: 'left', padding: '4px 8px' }}>Field</th>
                      <th style={{ textAlign: 'left', padding: '4px 8px' }}>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRun.validation.errors.map((err, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                        <td style={{ padding: '4px 8px' }}>{err.tracker}</td>
                        <td style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)' }}>{err.file}</td>
                        <td style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)' }}>{err.field}</td>
                        <td style={{ padding: '4px 8px' }}>{err.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            Data Inventory
          </h4>
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px' }}>Tracker</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px' }}>KPIs</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px' }}>Timeline</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px' }}>Map Pts</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px' }}>Map Lines</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px' }}>Claims</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px' }}>Political</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px' }}>Casualties</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px' }}>Events</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(selectedRun.inventory).map(([tracker, inv]) => (
                  <tr key={tracker} style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                    <td style={{ padding: '4px 8px' }}>{tracker}</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>{inv.kpis}</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>{inv.timeline}</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>{inv.mapPoints}</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>{inv.mapLines}</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>{inv.claims}</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>{inv.political}</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>{inv.casualties}</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>{inv.events}</td>
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
