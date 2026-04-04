// src/components/islands/mobile/MobileTabBar.tsx

export type MobileTab = 'map' | 'feed' | 'data' | 'intel';

interface TabDef {
  id: MobileTab;
  icon: string;
  label: string;
}

interface Props {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  feedBadge?: number;
}

const TABS: TabDef[] = [
  { id: 'map',   icon: '◎', label: 'MAP'  },
  { id: 'feed',  icon: '◉', label: 'FEED' },
  { id: 'data',  icon: '▤', label: 'DATA' },
  { id: 'intel', icon: '☷', label: 'INTEL' },
];

export default function MobileTabBar({ activeTab, onTabChange, feedBadge }: Props) {
  return (
    <nav className="mtab-bar" role="tablist" aria-label="Dashboard sections">
      {TABS.map(tab => (
        <button
          key={tab.id}
          id={`tab-${tab.id}`}
          className={`mtab-tab${activeTab === tab.id ? ' active' : ''}`}
          onClick={() => onTabChange(tab.id)}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={`tabpanel-${tab.id}`}
        >
          <span className="mtab-tab-icon">{tab.icon}</span>
          <span className="mtab-tab-label">{tab.label}</span>
          {tab.id === 'feed' && feedBadge != null && feedBadge > 0 && (
            <span className="mtab-badge">{feedBadge}</span>
          )}
        </button>
      ))}
    </nav>
  );
}
