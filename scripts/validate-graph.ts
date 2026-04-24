#!/usr/bin/env node
// scripts/validate-graph.ts
// Run: npx tsx scripts/validate-graph.ts
// Validates graph/ directory against Zod schemas and referential integrity

import { readFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';
import { EntitySchema, RelationshipSchema } from '../src/lib/schemas';

const GRAPH_DIR = path.join(process.cwd(), 'graph');
const TRACKERS_DIR = path.join(process.cwd(), 'trackers');

function main() {
  const errors: string[] = [];

  // Check graph directory exists
  if (!existsSync(GRAPH_DIR)) {
    console.log('ℹ️  No graph/ directory found — skipping validation');
    process.exit(0);
  }

  // Load known tracker slugs
  const knownSlugs = new Set(readdirSync(TRACKERS_DIR));

  // Load + validate entities
  const entityIndexPath = path.join(GRAPH_DIR, 'entities', 'index.json');
  if (!existsSync(entityIndexPath)) {
    console.log('ℹ️  No graph/entities/index.json found — skipping');
    process.exit(0);
  }

  const entityIndex = JSON.parse(readFileSync(entityIndexPath, 'utf-8'));
  const entityIds = new Set<string>();

  for (const raw of entityIndex.entities ?? []) {
    const result = EntitySchema.safeParse(raw);
    if (!result.success) {
      errors.push(`Entity "${raw.id ?? '??'}": ${result.error.issues.map((i) => i.message).join(', ')}`);
      continue;
    }
    const entity = result.data;
    if (entityIds.has(entity.id)) {
      errors.push(`Duplicate entity ID: ${entity.id}`);
    }
    entityIds.add(entity.id);

    // Referential integrity: all tracker slugs must exist
    for (const slug of entity.trackers) {
      if (!knownSlugs.has(slug)) {
        errors.push(`Entity "${entity.id}" references unknown tracker: "${slug}"`);
      }
    }
  }

  // Load + validate relationships
  const relIndexPath = path.join(GRAPH_DIR, 'relationships', 'index.json');
  if (!existsSync(relIndexPath)) {
    console.log('ℹ️  No graph/relationships/index.json found — skipping relationships');
  } else {
    const relIndex = JSON.parse(readFileSync(relIndexPath, 'utf-8'));
    const relIds = new Set<string>();

    for (const raw of relIndex.relationships ?? []) {
      const result = RelationshipSchema.safeParse(raw);
      if (!result.success) {
        errors.push(`Relationship "${raw.id ?? '??'}": ${result.error.issues.map((i) => i.message).join(', ')}`);
        continue;
      }
      const rel = result.data;
      if (relIds.has(rel.id)) {
        errors.push(`Duplicate relationship ID: ${rel.id}`);
      }
      relIds.add(rel.id);

      // Referential integrity
      if (rel.fromType === 'tracker' && !knownSlugs.has(rel.from)) {
        errors.push(`Relationship "${rel.id}": unknown tracker slug "${rel.from}"`);
      }
      if (rel.toType === 'tracker' && !knownSlugs.has(rel.to)) {
        errors.push(`Relationship "${rel.id}": unknown tracker slug "${rel.to}"`);
      }
      if (rel.fromType === 'entity' && !entityIds.has(rel.from)) {
        errors.push(`Relationship "${rel.id}": unknown entity ID "${rel.from}"`);
      }
      if (rel.toType === 'entity' && !entityIds.has(rel.to)) {
        errors.push(`Relationship "${rel.id}": unknown entity ID "${rel.to}"`);
      }
    }

    if (errors.length === 0) {
      console.log(`✅ Graph valid: ${entityIds.size} entities, ${relIds.size} relationships`);
    }
  }

  if (errors.length > 0) {
    console.error('❌ Graph validation failed:');
    for (const e of errors) {
      console.error(`  - ${e}`);
    }
    process.exit(1);
  }
}

main();
