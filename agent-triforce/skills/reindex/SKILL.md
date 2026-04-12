---
name: reindex
description: >
  Rebuilds the codebase knowledge index at docs/codebase-index.json.
  Scans all source files for module structure, exports, dependencies,
  and tech debt hotspots. Shared across all three agents.
context: fork
agent: forja-dev
---

Rebuild the codebase knowledge index.

Follow these steps:

**SIGN IN:**
- Run the SIGN IN checklist from your agent file
- Check if `docs/codebase-index.json` exists (rebuild vs fresh build)

**INDEX:**
1. Use `tools/codebase-indexer.py` if available, otherwise perform manual indexing:
   ```bash
   python3 tools/codebase-indexer.py --output docs/codebase-index.json
   ```
2. If manual indexing is needed, scan `src/` recursively:
   - For each file, extract:
     - Module path (relative to project root)
     - Language (from extension)
     - Exported functions/classes with signatures
     - Import statements (to build dependency graph)
     - File size (lines of code)
3. Cross-reference with `TECH_DEBT.md`:
   - Flag files mentioned in tech debt entries as hotspots
4. Cross-reference with `docs/reviews/`:
   - Flag files with recent security findings
5. Build the dependency graph:
   - Module A imports Module B -> edge from A to B
   - Identify circular dependencies
   - Identify orphan modules (not imported by any other module)

**VERIFY:**

**TIME OUT — Index Verification (DO-CONFIRM):**
- [ ] All `src/` files indexed (count matches `find src/ -type f | wc -l`)
- [ ] Exported symbols extracted for each file
- [ ] Dependency graph has no missing nodes (every import resolves to a file)
- [ ] Tech debt hotspots flagged
- [ ] Index file is valid JSON
- [ ] Build time under 60 seconds for up to 500 files

**SIGN OUT:**
6. Report index summary: file count, symbol count, dependency edge count, hotspot count
7. Note if circular dependencies were found
8. Run the SIGN OUT checklist from your agent file
