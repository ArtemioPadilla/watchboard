// src/lib/graph.ts
// Knowledge Graph data access utilities — cross-tracker relationships and entity lookup

import type { Entity, Relationship } from './schemas';

export interface RelatedTracker {
  slug: string;
  name: string;
  rel: string;
  weight: number;
  note?: string;
}

/**
 * Get trackers related to a given tracker slug, sorted by weight desc.
 */
export function getRelatedTrackers(
  slug: string,
  relationships: Relationship[],
  trackerNames: Record<string, string>,
  limit = 5
): RelatedTracker[] {
  return relationships
    .filter(
      (r) =>
        (r.fromType === 'tracker' && r.from === slug && r.toType === 'tracker') ||
        (r.toType === 'tracker' && r.to === slug && r.fromType === 'tracker')
    )
    .map((r) => {
      const targetSlug = r.from === slug ? r.to : r.from;
      return {
        slug: targetSlug,
        name: trackerNames[targetSlug] ?? targetSlug,
        rel: r.rel,
        weight: r.weight,
        note: r.note,
      };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}

/**
 * Get all entities that appear in a given tracker.
 */
export function getEntitiesForTracker(slug: string, entities: Entity[]): Entity[] {
  return entities.filter((e) => e.trackers.includes(slug));
}

/**
 * Find an entity by ID or alias match (case-insensitive).
 */
export function findEntity(query: string, entities: Entity[]): Entity | undefined {
  const q = query.toLowerCase();
  return entities.find(
    (e) =>
      e.id === q ||
      e.name.toLowerCase() === q ||
      e.aliases.some((a) => a.toLowerCase() === q)
  );
}

/**
 * Get all entities that match a partial query (for search/autocomplete).
 */
export function searchEntities(query: string, entities: Entity[]): Entity[] {
  const q = query.toLowerCase();
  return entities.filter(
    (e) =>
      e.id.includes(q) ||
      e.name.toLowerCase().includes(q) ||
      e.aliases.some((a) => a.toLowerCase().includes(q)) ||
      e.description.toLowerCase().includes(q)
  );
}
