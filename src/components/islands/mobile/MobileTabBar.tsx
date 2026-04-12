// src/components/islands/mobile/MobileTabBar.tsx
import { t, getPreferredLocale } from '../../../i18n/translations';

export type MobileTab = 'map' | 'feed' | 'data' | 'intel';

interface Props {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  feedBadge?: number;
}

const TAB_ICONS: Record<MobileTab, string> = {
  map: '🗺️',
  feed: '📰',
  data: '📊',
  intel: '💬',
};

const TAB_LABEL_KEYS: Record<MobileTab, string> = {
  map: 'mobile.map',
  feed: 'mobile.feed',
  data: 'mobile.data',
  intel: 'mobile.intel',
};

const TAB_ORDER: MobileTab[] = ['map', 'feed', 'data', 'intel'];

export default function MobileTabBar({ activeTab, onTabChange, feedBadge }: Props) {
  const locale = getPreferredLocale();
  return (
    <nav className="mtab-bar" role="tablist" aria-label={t('mobile.dashboardSections', locale)}>
      {TAB_ORDER.map(tabId => (
        <button
          key={tabId}
          id={`tab-${tabId}`}
          className={`mtab-tab${activeTab === tabId ? ' active' : ''}`}
          onClick={() => onTabChange(tabId)}
          role="tab"
          aria-selected={activeTab === tabId}
          aria-controls={`tabpanel-${tabId}`}
        >
          <span className="mtab-tab-icon">{TAB_ICONS[tabId]}</span>
          <span className="mtab-tab-label">{t(TAB_LABEL_KEYS[tabId] as any, locale)}</span>
          {activeTab === tabId && <span className="mtab-tab-indicator" />}
          {tabId === 'feed' && feedBadge != null && feedBadge > 0 && (
            <span className="mtab-badge">{feedBadge}</span>
          )}
        </button>
      ))}
    </nav>
  );
}
