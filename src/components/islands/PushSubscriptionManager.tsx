import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  updatePreferences,
  getCurrentSubscription,
  getLocalPrefs,
} from '../../lib/push-client';

// Domain categories for grouping trackers in the picker
const DOMAIN_LABELS: Record<string, string> = {
  conflict: 'Conflicts',
  security: 'Security',
  disaster: 'Disasters',
  culture: 'Culture',
  science: 'Science',
  historical: 'Historical',
  sports: 'Sports',
  other: 'Other',
};

interface TrackerInfo {
  slug: string;
  shortName: string;
  icon?: string;
  domain?: string;
}

interface Props {
  trackers: TrackerInfo[];
}

type SubscriptionState = 'loading' | 'unsupported' | 'denied' | 'unsubscribed' | 'subscribed';

export default function PushSubscriptionManager({ trackers }: Props) {
  const [state, setState] = useState<SubscriptionState>('loading');
  const [selectedTrackers, setSelectedTrackers] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<Set<string>>(new Set(['breaking', 'daily']));
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Group trackers by domain
  const grouped = useMemo(() => {
    const groups: Record<string, TrackerInfo[]> = {};
    for (const t of trackers) {
      const domain = t.domain || 'other';
      if (!groups[domain]) groups[domain] = [];
      groups[domain].push(t);
    }
    return groups;
  }, [trackers]);

  // Check current subscription status on mount
  useEffect(() => {
    if (!isPushSupported()) {
      setState('unsupported');
      return;
    }

    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }

    getCurrentSubscription().then(sub => {
      if (sub) {
        setState('subscribed');
        const prefs = getLocalPrefs();
        if (prefs) {
          setSelectedTrackers(new Set(prefs.trackers));
          setCategories(new Set(prefs.categories));
        }
      } else {
        setState('unsubscribed');
      }
    }).catch(() => setState('unsubscribed'));
  }, []);

  const toggleTracker = useCallback((slug: string) => {
    setSelectedTrackers(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }, []);

  const toggleCategory = useCallback((cat: string) => {
    setCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedTrackers(new Set(trackers.map(t => t.slug)));
  }, [trackers]);

  const selectNone = useCallback(() => {
    setSelectedTrackers(new Set());
  }, []);

  const handleSubscribe = useCallback(async () => {
    if (selectedTrackers.size === 0) {
      setError('Select at least one tracker');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await subscribeToPush([...selectedTrackers], [...categories]);
      setState('subscribed');
      setIsOpen(false);
    } catch (e: any) {
      if (e.message?.includes('denied')) {
        setState('denied');
      }
      setError(e.message || 'Failed to subscribe');
    } finally {
      setSaving(false);
    }
  }, [selectedTrackers, categories]);

  const handleUpdate = useCallback(async () => {
    if (selectedTrackers.size === 0) {
      setError('Select at least one tracker');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updatePreferences([...selectedTrackers], [...categories]);
      setIsOpen(false);
    } catch (e: any) {
      setError(e.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  }, [selectedTrackers, categories]);

  const handleUnsubscribe = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await unsubscribeFromPush();
      setState('unsubscribed');
      setSelectedTrackers(new Set());
      setIsOpen(false);
    } catch (e: any) {
      setError(e.message || 'Failed to unsubscribe');
    } finally {
      setSaving(false);
    }
  }, []);

  // Don't render anything if push isn't supported
  if (state === 'unsupported') return null;

  return (
    <>
      {/* Bell button */}
      <button
        onClick={() => setIsOpen(true)}
        className="push-bell-btn"
        title={state === 'subscribed' ? 'Notification preferences' : 'Enable notifications'}
        aria-label="Push notifications"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {state === 'subscribed' && <span className="push-bell-dot" />}
      </button>

      {/* Modal overlay */}
      {isOpen && (
        <div className="push-overlay" onClick={() => setIsOpen(false)}>
          <div className="push-modal" onClick={e => e.stopPropagation()}>
            <div className="push-modal-header">
              <h3>Push Notifications</h3>
              <button onClick={() => setIsOpen(false)} className="push-close-btn" aria-label="Close">
                &times;
              </button>
            </div>

            {state === 'denied' ? (
              <div className="push-modal-body">
                <p className="push-denied-msg">
                  Notifications are blocked. Please enable them in your browser settings and reload.
                </p>
              </div>
            ) : (
              <div className="push-modal-body">
                {/* Category toggles */}
                <div className="push-categories">
                  <span className="push-label">Notify me for:</span>
                  <div className="push-cat-toggles">
                    <button
                      className={`push-cat-btn ${categories.has('breaking') ? 'active' : ''}`}
                      onClick={() => toggleCategory('breaking')}
                    >
                      Breaking News
                    </button>
                    <button
                      className={`push-cat-btn ${categories.has('daily') ? 'active' : ''}`}
                      onClick={() => toggleCategory('daily')}
                    >
                      Daily Digests
                    </button>
                  </div>
                </div>

                {/* Tracker picker */}
                <div className="push-tracker-picker">
                  <div className="push-picker-header">
                    <span className="push-label">
                      Trackers ({selectedTrackers.size}/{trackers.length})
                    </span>
                    <div className="push-select-btns">
                      <button onClick={selectAll} className="push-link-btn">All</button>
                      <button onClick={selectNone} className="push-link-btn">None</button>
                    </div>
                  </div>

                  <div className="push-tracker-groups">
                    {Object.entries(grouped).map(([domain, items]) => (
                      <div key={domain} className="push-group">
                        <div className="push-group-label">{DOMAIN_LABELS[domain] || domain}</div>
                        <div className="push-group-items">
                          {items.map(t => (
                            <button
                              key={t.slug}
                              className={`push-tracker-chip ${selectedTrackers.has(t.slug) ? 'selected' : ''}`}
                              onClick={() => toggleTracker(t.slug)}
                            >
                              {t.icon && <span className="push-tracker-icon">{t.icon}</span>}
                              {t.shortName}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {error && <p className="push-error">{error}</p>}

                <div className="push-modal-actions">
                  {state === 'subscribed' ? (
                    <>
                      <button
                        className="push-action-btn primary"
                        onClick={handleUpdate}
                        disabled={saving}
                      >
                        {saving ? 'Saving...' : 'Update Preferences'}
                      </button>
                      <button
                        className="push-action-btn danger"
                        onClick={handleUnsubscribe}
                        disabled={saving}
                      >
                        Unsubscribe
                      </button>
                    </>
                  ) : (
                    <button
                      className="push-action-btn primary"
                      onClick={handleSubscribe}
                      disabled={saving || selectedTrackers.size === 0}
                    >
                      {saving ? 'Enabling...' : 'Enable Notifications'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
