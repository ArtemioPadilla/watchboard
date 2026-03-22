/**
 * Declarative map of translatable fields per data file type.
 * Used by the translation workflow to know which fields to translate
 * and which to preserve as-is (numbers, dates, coordinates, IDs).
 */

export interface FieldSpec {
  /** Dot-path to the field (e.g., 'label', '[].title', '[].sideA.text') */
  path: string;
}

export const TRANSLATABLE_FIELDS: Record<string, FieldSpec[]> = {
  'meta.json': [
    { path: 'heroHeadline' },
    { path: 'heroSubtitle' },
    { path: 'dateline' },
    { path: 'footerNote' },
    { path: 'operationName' },
  ],

  'kpis.json': [
    { path: '[].label' },
    { path: '[].contestNote' },
    { path: '[].deltaNote' },
  ],

  'timeline.json': [
    { path: '[].era' },
    { path: '[].events[].title' },
    { path: '[].events[].detail' },
  ],

  'events/*.json': [
    { path: '[].title' },
    { path: '[].detail' },
  ],

  'map-points.json': [
    { path: '[].label' },
    { path: '[].sub' },
  ],

  'casualties.json': [
    { path: '[].category' },
    { path: '[].note' },
  ],

  'econ.json': [
    { path: '[].label' },
  ],

  'claims.json': [
    { path: '[].question' },
    { path: '[].sideA.label' },
    { path: '[].sideA.text' },
    { path: '[].sideB.label' },
    { path: '[].sideB.text' },
    { path: '[].resolution' },
  ],

  'political.json': [
    { path: '[].role' },
    { path: '[].quote' },
  ],

  'strike-targets.json': [
    { path: '[].label' },
    { path: '[].detail' },
  ],

  'retaliation.json': [
    { path: '[].label' },
    { path: '[].detail' },
  ],

  'assets.json': [
    { path: '[].label' },
    { path: '[].detail' },
  ],
};

/** Phase 1 files — highest visibility, lowest volume */
export const PHASE1_FILES = ['meta.json', 'kpis.json'];

/** All translatable file patterns */
export const ALL_FILES = Object.keys(TRANSLATABLE_FIELDS);
