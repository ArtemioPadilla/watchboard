Rebuild the codebase knowledge index for the project.

The index is a lightweight map of the codebase shared across all three agents: module structure, public function signatures, inter-module dependencies, and known hotspots.

## Steps

1. Run the codebase indexer:
   ```bash
   python3 tools/codebase-indexer.py --output docs/codebase-index.json
   ```
   For incremental updates (only re-index changed files):
   ```bash
   python3 tools/codebase-indexer.py --output docs/codebase-index.json --incremental
   ```

2. Display the summary output to the user

3. If `--src-dir` is specified, pass it through:
   ```bash
   python3 tools/codebase-indexer.py --src-dir {dir} --output docs/codebase-index.json
   ```

4. Report the index location and key stats:
   - File count, line count, function count, class count
   - Dependency edges and circular dependencies (if any)
   - Hotspot count (files flagged in TECH_DEBT.md or security reviews)

## Notes

- The index is stored at `docs/codebase-index.json` and should be committed to version control
- Index build should complete in under 60 seconds for codebases up to 500 files
- If the index is stale (>24h old or >50 file changes), agents will warn on spawn
- Zero external dependencies — uses Python 3.9+ standard library only
