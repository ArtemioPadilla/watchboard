/**
 * ai-utils.ts — shared utilities for the AI data-update scripts.
 *
 * Extracted from update-data.ts (canonical versions) to remove the literal
 * duplication that had diverged between update-data.ts and backfill.ts.
 */
import { writeFileSync, renameSync } from 'fs';
import { z } from 'zod';

// ─── Atomic writes ───

/** Atomic write: write to temp file then rename (rename is atomic on POSIX). */
export function atomicWriteFile(filePath: string, content: string): void {
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, content);
  renameSync(tmpPath, filePath);
}

// ─── JSON Utilities ───

export function extractJSON(text: string): string {
  let json = text.trim();

  // 1. Strip code fences — try regex first, then manual fallback
  const codeBlock = json.match(/```\w*\s*\n([\s\S]*?)\n\s*```/);
  if (codeBlock) {
    json = codeBlock[1].trim();
  } else if (json.includes('```')) {
    json = json.replace(/^```\w*\s*\n?/, '').replace(/\n?\s*```\s*$/, '').trim();
  }

  // 2. Extract by matching brackets (string-aware)
  const start = json.search(/[\[{]/);
  if (start === -1) throw new Error('No JSON array or object found in response');

  const openChar = json[start];
  const closeChar = openChar === '[' ? ']' : '}';
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;

  for (let i = start; i < json.length; i++) {
    const ch = json[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === openChar) depth++;
    if (ch === closeChar) depth--;
    if (depth === 0) { end = i; break; }
  }

  if (end !== -1) {
    json = json.substring(start, end + 1);
  } else {
    // 2b. Truncated JSON — try to repair by closing open structures
    json = repairTruncatedJSON(json.substring(start));
  }

  // 3. Remove trailing commas before ] or }
  json = removeTrailingCommas(json);

  return json;
}

/** Attempt to repair truncated JSON by closing open brackets/braces and strings */
export function repairTruncatedJSON(json: string): string {
  // Walk through and track open structures
  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '[' || ch === '{') stack.push(ch === '[' ? ']' : '}');
    if (ch === ']' || ch === '}') {
      stack.pop();
    }
  }

  if (stack.length === 0) return json;

  // Truncate to last complete value boundary (after a comma, colon+value, or bracket)
  // Find the last comma or closing bracket outside a string
  let truncateAt = json.length;
  let inStr2 = false;
  let esc2 = false;
  let lastComma = -1;
  let lastCloseBracket = -1;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (esc2) { esc2 = false; continue; }
    if (ch === '\\' && inStr2) { esc2 = true; continue; }
    if (ch === '"') { inStr2 = !inStr2; continue; }
    if (inStr2) continue;
    if (ch === ',') lastComma = i;
    if (ch === ']' || ch === '}') lastCloseBracket = i;
  }

  // Prefer truncating at the last complete item (after closing bracket > after comma)
  if (lastCloseBracket > lastComma && lastCloseBracket > 0) {
    truncateAt = lastCloseBracket + 1;
  } else if (lastComma > 0) {
    truncateAt = lastComma;
  }

  let repaired = json.substring(0, truncateAt);

  // Recount what still needs closing
  const stack2: string[] = [];
  let inStr3 = false;
  let esc3 = false;
  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (esc3) { esc3 = false; continue; }
    if (ch === '\\' && inStr3) { esc3 = true; continue; }
    if (ch === '"') { inStr3 = !inStr3; continue; }
    if (inStr3) continue;
    if (ch === '[' || ch === '{') stack2.push(ch === '[' ? ']' : '}');
    if (ch === ']' || ch === '}') stack2.pop();
  }

  // Close all open structures
  repaired += stack2.reverse().join('');

  return repaired;
}

/** Remove trailing commas before ] or } */
export function removeTrailingCommas(json: string): string {
  let result = '';
  let inStr = false;
  let esc = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (esc) { esc = false; result += ch; continue; }
    if (ch === '\\' && inStr) { esc = true; result += ch; continue; }
    if (ch === '"') { inStr = !inStr; result += ch; continue; }
    if (inStr) { result += ch; continue; }
    if (ch === ',') {
      const rest = json.substring(i + 1).match(/^\s*([\]}])/);
      if (rest) continue;
    }
    result += ch;
  }
  return result;
}

// ─── Normalization & itemwise validation ───

/** ISO-like date patterns we are willing to normalize: YYYY-MM-DD, YYYY/MM/DD,
 *  or a full ISO timestamp. Anything else is left unchanged — passing arbitrary
 *  strings through `new Date()` coerces things like "Mar 7" into a date in the
 *  current year, silently corrupting historical data. */
const ISO_LIKE_DATE_RE = /^(\d{4})[-/](\d{2})[-/](\d{2})(?:[T\s].*)?$/;

/** Normalize parsed JSON arrays — coerce dates, fill missing fields */
export function normalizeItems(items: unknown[]): unknown[] {
  const today = new Date().toISOString().split('T')[0];
  return items.map(item => {
    if (typeof item !== 'object' || item === null) return item;
    const obj = item as Record<string, unknown>;

    // Coerce date fields to YYYY-MM-DD strings — ISO-like inputs only
    if ('date' in obj) {
      const d = obj.date;
      if (d === null || d === undefined) {
        obj.date = today;
      } else if (typeof d === 'number') {
        obj.date = String(d);
      } else if (typeof d === 'string') {
        const isoLike = d.match(ISO_LIKE_DATE_RE);
        if (isoLike) {
          obj.date = `${isoLike[1]}-${isoLike[2]}-${isoLike[3]}`;
        }
        // Non-ISO strings are left unchanged (Zod will flag invalid ones)
      }
    }

    // Coerce tier to number
    if ('tier' in obj && typeof obj.tier === 'string') {
      const n = parseInt(obj.tier, 10);
      if (!isNaN(n)) obj.tier = n;
    }

    // Coerce lat/lon to numbers
    for (const key of ['lat', 'lon']) {
      if (key in obj && typeof obj[key] === 'string') {
        const n = parseFloat(obj[key] as string);
        if (!isNaN(n)) obj[key] = n;
      }
    }

    // Ensure base is boolean
    if ('base' in obj && typeof obj.base !== 'boolean') {
      obj.base = obj.base === 'true' || obj.base === true;
    }

    // Coerce launched/intercepted from string to number
    for (const key of ['launched', 'intercepted']) {
      if (key in obj && typeof obj[key] === 'string') {
        const match = (obj[key] as string).match(/(\d+)/);
        if (match) obj[key] = parseInt(match[1], 10);
        else delete obj[key];
      }
    }

    return obj;
  });
}

/** Validate array items individually, keeping valid ones and logging rejects */
export function validateItemwise<T>(items: unknown[], schema: z.ZodType<T>, label: string): T[] {
  const valid: T[] = [];
  let rejected = 0;
  for (let i = 0; i < items.length; i++) {
    const result = schema.safeParse(items[i]);
    if (result.success) {
      valid.push(result.data);
    } else {
      rejected++;
      console.warn(`[${label}] Item ${i} rejected:`, JSON.stringify(result.error.format()));
    }
  }
  if (rejected > 0) {
    console.warn(`[${label}] ${rejected}/${items.length} items failed validation, keeping ${valid.length} valid items`);
  }
  return valid;
}

// ─── Schema-Driven Prompt Generation ───

export function describeType(type: z.ZodType): string {
  if (type instanceof z.ZodString) return 'string';
  if (type instanceof z.ZodNumber) return 'number';
  if (type instanceof z.ZodBoolean) return 'boolean';
  if (type instanceof z.ZodEnum) return (type as z.ZodEnum<[string, ...string[]]>).options.map((o: string) => `"${o}"`).join(' | ');
  if (type instanceof z.ZodOptional) return describeType((type as z.ZodOptional<z.ZodType>).unwrap()) + ' (optional)';
  if (type instanceof z.ZodArray) return describeType((type as z.ZodArray<z.ZodType>).element) + '[]';
  if (type instanceof z.ZodUnion) return (type as z.ZodUnion<[z.ZodType, ...z.ZodType[]]>).options.map((o: z.ZodType) => describeType(o)).join(' | ');
  if (type instanceof z.ZodLiteral) return JSON.stringify((type as z.ZodLiteral<unknown>).value);
  if (type instanceof z.ZodTuple) {
    const items = (type as z.ZodTuple<[z.ZodType, ...z.ZodType[]]>).items.map((i: z.ZodType) => describeType(i));
    return `[${items.join(', ')}]`;
  }
  if (type instanceof z.ZodObject) {
    const shape = (type as z.ZodObject<z.ZodRawShape>).shape;
    const fields = Object.entries(shape).map(([k, v]) => `"${k}": ${describeType(v as z.ZodType)}`);
    return `{ ${fields.join(', ')} }`;
  }
  return 'any';
}

/** Generate a JSON field description from a Zod object schema, excluding lastUpdated */
export function describeFields(schema: z.ZodObject<z.ZodRawShape>): string {
  const lines: string[] = [];
  for (const [key, type] of Object.entries(schema.shape)) {
    if (key === 'lastUpdated') continue;
    lines.push(`  "${key}": ${describeType(type as z.ZodType)}`);
  }
  return `{\n${lines.join(',\n')}\n}`;
}

// ─── Merge by ID ───

export function mergeById<T extends { id: string }>(
  existing: T[],
  incoming: T[],
): { merged: T[]; newCount: number; updatedCount: number } {
  const now = new Date().toISOString();
  const map = new Map(existing.map(item => [item.id, { ...item }]));
  let newCount = 0;
  let updatedCount = 0;

  for (const item of incoming) {
    if (!item.id) continue;
    const prev = map.get(item.id);
    if (prev) {
      // Only stamp lastUpdated if something changed
      const merged = { ...prev, ...item, lastUpdated: now };
      if (JSON.stringify({ ...prev, lastUpdated: now }) !== JSON.stringify(merged)) {
        updatedCount++;
      }
      map.set(item.id, merged as T);
    } else {
      map.set(item.id, { ...item, lastUpdated: now } as T);
      newCount++;
    }
  }

  // Preserve original order, append new items at end
  const result: T[] = [];
  const seen = new Set<string>();
  for (const item of existing) {
    result.push(map.get(item.id)!);
    seen.add(item.id);
  }
  for (const [id, item] of map) {
    if (!seen.has(id)) result.push(item);
  }

  return { merged: result, newCount, updatedCount };
}
