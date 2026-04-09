import { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react';
import type { CSSProperties } from 'react';
import { buildGeoTree, type GeoNode, type GeoTree } from '../../../lib/geo-utils';
import { computeFreshness } from '../../../lib/tracker-directory-utils';
import type { TrackerCardData } from '../../../lib/tracker-directory-utils';

// ── Props ──

interface Props {
  trackers: TrackerCardData[];
  basePath: string;
  activeTracker: string | null;
  onSelectTracker: (slug: string | null) => void;
  onHoverTracker: (slug: string | null) => void;
  // Controlled expansion (optional — falls back to internal state when absent)
  expandedKeys?: Set<string>;
  onExpandedKeysChange?: (keys: Set<string>) => void;
  // Geo interaction callbacks
  onHoverGeoNode?: (nodeId: string, level: GeoNode['level']) => void;
  onLeaveGeoNode?: () => void;
  // Click on a geo node header (not a tracker leaf)
  onClickGeoNode?: (nodeId: string, level: GeoNode['level']) => void;
  // Highlight path from globe click
  activeGeoPath?: string[] | null;
}

// ── TrackerLeaf ──

const TrackerLeaf = memo(function TrackerLeaf({
  tracker,
  basePath,
  isActive,
  onSelect,
  onHover,
}: {
  tracker: TrackerCardData;
  basePath: string;
  isActive: boolean;
  onSelect: (slug: string | null) => void;
  onHover: (slug: string | null) => void;
}) {
  const color = tracker.color || '#3498db';
  const freshness = computeFreshness(tracker.lastUpdated);

  const freshnessColor =
    freshness.className === 'fresh'
      ? 'var(--accent-green)'
      : freshness.className === 'recent'
        ? 'var(--accent-amber)'
        : 'var(--text-muted)';

  return (
    <div
      style={{
        ...S.leaf,
        borderLeftColor: isActive ? color : `${color}55`,
        background: isActive ? `${color}12` : 'transparent',
      }}
      onClick={() => onSelect(isActive ? null : tracker.slug)}
      onDoubleClick={() => { window.location.href = `${basePath}${tracker.slug}/`; }}
      onMouseEnter={() => onHover(tracker.slug)}
      onMouseLeave={() => onHover(null)}
      title={tracker.name}
    >
      <div style={S.leafLeft}>
        {tracker.icon && <span style={S.leafIcon}>{tracker.icon}</span>}
        <span style={{ ...S.leafName, color: isActive ? color : 'var(--text-primary)' }}>
          {tracker.shortName}
        </span>
      </div>
      <span style={{ ...S.leafAge, color: freshnessColor }}>
        {freshness.ageText}
      </span>
    </div>
  );
});

// ── SecondarySection ──

const SecondarySection = memo(function SecondarySection({
  trackers,
  basePath,
  activeTracker,
  onSelect,
  onHover,
}: {
  trackers: TrackerCardData[];
  basePath: string;
  activeTracker: string | null;
  onSelect: (slug: string | null) => void;
  onHover: (slug: string | null) => void;
}) {
  if (trackers.length === 0) return null;

  return (
    <div style={S.secondarySection}>
      <div style={S.secondaryLabel}>Also covers:</div>
      {trackers.map(tracker => (
        <TrackerLeaf
          key={tracker.slug}
          tracker={tracker}
          basePath={basePath}
          isActive={activeTracker === tracker.slug}
          onSelect={onSelect}
          onHover={onHover}
        />
      ))}
    </div>
  );
});

// ── RegionNode ──

const RegionNode = memo(function RegionNode({
  node,
  depth,
  expandedKeys,
  onToggle,
  basePath,
  activeTracker,
  onSelect,
  onHover,
  onHoverGeoNode,
  onLeaveGeoNode,
  onClickGeoNode,
  activeGeoPath,
  scrollTargetKey,
}: {
  node: GeoNode;
  depth: number;
  expandedKeys: Set<string>;
  onToggle: (key: string) => void;
  basePath: string;
  activeTracker: string | null;
  onSelect: (slug: string | null) => void;
  onHover: (slug: string | null) => void;
  onHoverGeoNode?: (nodeId: string, level: GeoNode['level']) => void;
  onLeaveGeoNode?: () => void;
  onClickGeoNode?: (nodeId: string, level: GeoNode['level']) => void;
  activeGeoPath?: string[] | null;
  scrollTargetKey?: string | null;
}) {
  const nodeKey = `${depth}-${node.id}`;
  const isExpanded = expandedKeys.has(nodeKey);
  const headerRef = useRef<HTMLDivElement>(null);

  const chevron = isExpanded ? '▾' : '▸';

  const isActiveNode = activeGeoPath?.includes(node.id) ?? false;

  const levelColor =
    node.level === 'region'
      ? 'var(--accent-blue)'
      : node.level === 'country'
        ? 'var(--accent-amber)'
        : 'var(--text-muted)';

  const hasChildren =
    node.children.length > 0 ||
    node.trackers.length > 0 ||
    node.aggregateTracker !== undefined ||
    node.secondaryTrackers.length > 0;

  // Auto-scroll when this node is the scroll target
  useEffect(() => {
    if (scrollTargetKey === nodeKey && headerRef.current) {
      headerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [scrollTargetKey, nodeKey, expandedKeys]);

  return (
    <div style={{ marginLeft: depth > 0 ? 12 : 0 }}>
      {/* Node header */}
      <div
        ref={headerRef}
        style={{
          ...S.nodeHeader,
          color: isActiveNode ? 'var(--accent-blue)' : levelColor,
          borderLeft: isActiveNode ? '2px solid var(--accent-blue)' : '2px solid transparent',
          cursor: hasChildren ? 'pointer' : 'default',
        }}
        onClick={() => {
          if (hasChildren) onToggle(nodeKey);
          onClickGeoNode?.(node.id, node.level);
        }}
        onMouseEnter={() => onHoverGeoNode?.(node.id, node.level)}
        onMouseLeave={() => onLeaveGeoNode?.()}
      >
        <div style={S.nodeHeaderLeft}>
          {hasChildren && (
            <span style={S.chevron}>{chevron}</span>
          )}
          {!hasChildren && <span style={S.chevronPlaceholder} />}
          <span style={S.nodeLabel}>{node.label}</span>
          {node.aggregateTracker && (
            <span style={S.hubBadge}>HUB</span>
          )}
        </div>
        <span style={S.nodeCount}>{node.trackerCount}</span>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div>
          {/* Aggregate tracker first */}
          {node.aggregateTracker && (
            <TrackerLeaf
              tracker={node.aggregateTracker}
              basePath={basePath}
              isActive={activeTracker === node.aggregateTracker.slug}
              onSelect={onSelect}
              onHover={onHover}
            />
          )}

          {/* Own trackers */}
          {node.trackers.map(tracker => (
            <TrackerLeaf
              key={tracker.slug}
              tracker={tracker}
              basePath={basePath}
              isActive={activeTracker === tracker.slug}
              onSelect={onSelect}
              onHover={onHover}
            />
          ))}

          {/* Child nodes (recursive) */}
          {node.children.map(child => (
            <RegionNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedKeys={expandedKeys}
              onToggle={onToggle}
              basePath={basePath}
              activeTracker={activeTracker}
              onSelect={onSelect}
              onHover={onHover}
              onHoverGeoNode={onHoverGeoNode}
              onLeaveGeoNode={onLeaveGeoNode}
              onClickGeoNode={onClickGeoNode}
              activeGeoPath={activeGeoPath}
              scrollTargetKey={scrollTargetKey}
            />
          ))}

          {/* Secondary trackers */}
          {node.secondaryTrackers.length > 0 && (
            <SecondarySection
              trackers={node.secondaryTrackers}
              basePath={basePath}
              activeTracker={activeTracker}
              onSelect={onSelect}
              onHover={onHover}
            />
          )}
        </div>
      )}
    </div>
  );
});

// ── GeoAccordion (main) ──

const GeoAccordion = memo(function GeoAccordion(props: Props) {
  const {
    trackers,
    basePath,
    activeTracker,
    onSelectTracker,
    onHoverTracker,
    onHoverGeoNode,
    onLeaveGeoNode,
    onClickGeoNode,
    activeGeoPath,
  } = props;

  const [internalExpandedKeys, setInternalExpandedKeys] = useState<Set<string>>(new Set());

  // Controlled vs uncontrolled expansion
  const isControlled = props.expandedKeys !== undefined;
  const expandedKeys = isControlled ? props.expandedKeys! : internalExpandedKeys;
  const updateExpandedKeys = useCallback((updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    if (isControlled) {
      const next = typeof updater === 'function' ? updater(props.expandedKeys!) : updater;
      props.onExpandedKeysChange?.(next);
    } else {
      setInternalExpandedKeys(prev => typeof updater === 'function' ? updater(prev) : updater);
    }
  }, [isControlled, props.expandedKeys, props.onExpandedKeysChange]);

  const tree = useMemo(() => buildGeoTree(trackers), [trackers]);

  const handleToggle = useCallback((key: string) => {
    updateExpandedKeys((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, [updateExpandedKeys]);

  // Compute scroll target from activeGeoPath
  const scrollTargetRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeGeoPath || activeGeoPath.length === 0) {
      scrollTargetRef.current = null;
      return;
    }
    // The node key for the country level is "1-{ISO_A2}" (depth=1 for country under region)
    scrollTargetRef.current = `1-${activeGeoPath[activeGeoPath.length - 1]}`;
  }, [activeGeoPath]);

  return (
    <div style={S.container}>
      {/* Global trackers */}
      {tree.global.length > 0 && (
        <div style={S.globalSection}>
          <div style={S.globalHeader}>
            <span style={S.globalDot}>◎</span>
            <span>GLOBAL</span>
            <span style={S.nodeCount}>{tree.global.length}</span>
          </div>
          {tree.global.map(tracker => (
            <TrackerLeaf
              key={tracker.slug}
              tracker={tracker}
              basePath={basePath}
              isActive={activeTracker === tracker.slug}
              onSelect={onSelectTracker}
              onHover={onHoverTracker}
            />
          ))}
        </div>
      )}

      {/* Region nodes */}
      {tree.children.map(regionNode => (
        <RegionNode
          key={regionNode.id}
          node={regionNode}
          depth={0}
          expandedKeys={expandedKeys}
          onToggle={handleToggle}
          basePath={basePath}
          activeTracker={activeTracker}
          onSelect={onSelectTracker}
          onHover={onHoverTracker}
          onHoverGeoNode={onHoverGeoNode}
          onLeaveGeoNode={onLeaveGeoNode}
          onClickGeoNode={onClickGeoNode}
          activeGeoPath={activeGeoPath}
          scrollTargetKey={scrollTargetRef.current}
        />
      ))}

      {/* Ungrouped trackers */}
      {tree.ungrouped.length > 0 && (
        <div style={S.ungroupedSection}>
          <div style={{ ...S.globalHeader, color: 'var(--text-muted)' }}>
            <span>OTHER</span>
            <span style={S.nodeCount}>{tree.ungrouped.length}</span>
          </div>
          {tree.ungrouped.map(tracker => (
            <TrackerLeaf
              key={tracker.slug}
              tracker={tracker}
              basePath={basePath}
              isActive={activeTracker === tracker.slug}
              onSelect={onSelectTracker}
              onHover={onHoverTracker}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export default GeoAccordion;

// ── Styles ──

const S = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '4px 0',
  } as CSSProperties,

  // Node header (region / country / state)
  nodeHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '5px 12px 5px 8px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.6rem',
    fontWeight: 600,
    letterSpacing: '0.1em',
    userSelect: 'none' as const,
    transition: 'background 0.12s',
  } as CSSProperties,

  nodeHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    minWidth: 0,
  } as CSSProperties,

  chevron: {
    fontSize: '0.6rem',
    lineHeight: 1,
    flexShrink: 0,
    width: 12,
    textAlign: 'center' as const,
  } as CSSProperties,

  chevronPlaceholder: {
    display: 'inline-block',
    width: 12,
    flexShrink: 0,
  } as CSSProperties,

  nodeLabel: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as CSSProperties,

  nodeCount: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.52rem',
    color: 'var(--text-muted)',
    opacity: 0.7,
    flexShrink: 0,
    marginLeft: 4,
  } as CSSProperties,

  hubBadge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.45rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: 'var(--accent-blue)',
    background: 'rgba(52,152,219,0.12)',
    border: '1px solid rgba(52,152,219,0.25)',
    borderRadius: 3,
    padding: '0 4px',
    flexShrink: 0,
  } as CSSProperties,

  // Tracker leaf row
  leaf: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '5px 12px 5px 20px',
    borderLeft: '2px solid transparent',
    cursor: 'pointer',
    transition: 'background 0.12s, border-color 0.12s',
    userSelect: 'none' as const,
  } as CSSProperties,

  leafLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    minWidth: 0,
  } as CSSProperties,

  leafIcon: {
    fontSize: '0.75rem',
    lineHeight: 1,
    flexShrink: 0,
  } as CSSProperties,

  leafName: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.72rem',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as CSSProperties,

  leafAge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.55rem',
    flexShrink: 0,
    marginLeft: 6,
  } as CSSProperties,

  // Global section
  globalSection: {
    borderBottom: '1px solid var(--border)',
    marginBottom: 4,
    paddingBottom: 4,
  } as CSSProperties,

  globalHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px 4px 8px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.6rem',
    fontWeight: 600,
    letterSpacing: '0.1em',
    color: 'var(--accent-blue)',
  } as CSSProperties,

  globalDot: {
    fontSize: '0.65rem',
    lineHeight: 1,
  } as CSSProperties,

  // Ungrouped section
  ungroupedSection: {
    borderTop: '1px solid var(--border)',
    marginTop: 4,
    paddingTop: 4,
  } as CSSProperties,

  // Secondary "Also covers:" section
  secondarySection: {
    margin: '2px 8px 4px 20px',
    border: '1px dashed var(--border)',
    borderRadius: 4,
    padding: '4px 0',
    background: 'var(--bg-card, #161b22)',
  } as CSSProperties,

  secondaryLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.5rem',
    color: 'var(--text-muted)',
    letterSpacing: '0.06em',
    padding: '0 8px 3px',
    opacity: 0.7,
  } as CSSProperties,
};
