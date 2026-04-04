#!/usr/bin/env python3
"""Codebase Knowledge Index Generator for Agent Triforce (F20).

Builds a lightweight, persistent codebase map shared across all three agents.
Contains module structure, public function signatures, inter-module dependency
graph, architecture patterns, and known hotspots.

Usage:
    python3 tools/codebase-indexer.py [--output PATH] [--src-dir DIR] [--incremental]

Zero external dependencies. Python 3.9+.
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

INDEX_VERSION = "1.0.0"
DEFAULT_OUTPUT = "docs/codebase-index.json"
DEFAULT_SRC_DIR = "src"
MAX_FILES_FULL = 500


def find_source_files(src_dir: str) -> list[dict]:
    """Recursively find all source files in the given directory."""
    extensions = {
        ".py": "python",
        ".ts": "typescript",
        ".tsx": "typescript",
        ".js": "javascript",
        ".jsx": "javascript",
        ".rs": "rust",
        ".go": "go",
        ".java": "java",
        ".sol": "solidity",
    }
    files = []
    src_path = Path(src_dir)
    if not src_path.exists():
        return files

    for path in sorted(src_path.rglob("*")):
        if path.is_file() and path.suffix in extensions:
            files.append({
                "path": str(path),
                "language": extensions[path.suffix],
                "extension": path.suffix,
            })
    return files


def count_lines(filepath: str) -> int:
    """Count lines in a file."""
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            return sum(1 for _ in f)
    except OSError:
        return 0


def extract_python_symbols(filepath: str) -> dict:
    """Extract public functions, classes, and imports from a Python file."""
    symbols = {"functions": [], "classes": [], "imports": []}
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except OSError:
        return symbols

    # Functions (public only - skip _private)
    for match in re.finditer(
        r"^def\s+([a-zA-Z][a-zA-Z0-9_]*)\s*\(([^)]*)\)", content, re.MULTILINE
    ):
        name = match.group(1)
        params = match.group(2).strip()
        symbols["functions"].append({"name": name, "params": params})

    # Classes
    for match in re.finditer(
        r"^class\s+([a-zA-Z][a-zA-Z0-9_]*)\s*(?:\(([^)]*)\))?:", content, re.MULTILINE
    ):
        name = match.group(1)
        bases = match.group(2) or ""
        symbols["classes"].append({"name": name, "bases": bases.strip()})

    # Imports
    for match in re.finditer(
        r"^(?:from\s+([\w.]+)\s+)?import\s+(.+?)$", content, re.MULTILINE
    ):
        module = match.group(1) or ""
        names = match.group(2).strip()
        symbols["imports"].append({"from": module, "import": names})

    return symbols


def extract_typescript_symbols(filepath: str) -> dict:
    """Extract exported functions, classes, and imports from TypeScript/JS."""
    symbols = {"functions": [], "classes": [], "imports": []}
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except OSError:
        return symbols

    # Exported functions
    for match in re.finditer(
        r"export\s+(?:async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)",
        content,
    ):
        symbols["functions"].append({
            "name": match.group(1),
            "params": match.group(2).strip(),
        })

    # Export const arrow functions
    for match in re.finditer(
        r"export\s+const\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>",
        content,
    ):
        symbols["functions"].append({"name": match.group(1), "params": "..."})

    # Exported classes
    for match in re.finditer(
        r"export\s+(?:default\s+)?class\s+(\w+)", content
    ):
        symbols["classes"].append({"name": match.group(1), "bases": ""})

    # Imports
    for match in re.finditer(
        r"import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+['\"]([^'\"]+)['\"]", content
    ):
        names = (match.group(1) or match.group(2) or "").strip()
        module = match.group(3)
        symbols["imports"].append({"from": module, "import": names})

    return symbols


def extract_symbols(filepath: str, language: str) -> dict:
    """Extract symbols based on language."""
    extractors = {
        "python": extract_python_symbols,
        "typescript": extract_typescript_symbols,
        "javascript": extract_typescript_symbols,
    }
    extractor = extractors.get(language)
    if extractor:
        return extractor(filepath)
    return {"functions": [], "classes": [], "imports": []}


def build_dependency_graph(modules: list[dict]) -> dict:
    """Build inter-module dependency edges from import statements."""
    edges = []
    module_paths = {m["path"] for m in modules}
    circular = []

    # Build adjacency for circular detection
    adjacency: dict[str, set[str]] = {}
    for module in modules:
        adjacency[module["path"]] = set()
        for imp in module.get("symbols", {}).get("imports", []):
            source = imp.get("from", "")
            if source:
                # Try to resolve relative imports to actual files
                for target_path in module_paths:
                    target_name = Path(target_path).stem
                    if target_name in source or source in target_path:
                        edges.append({
                            "from": module["path"],
                            "to": target_path,
                            "import": imp.get("import", ""),
                        })
                        adjacency[module["path"]].add(target_path)

    # Detect circular dependencies (simple DFS)
    visited: set[str] = set()
    path_set: set[str] = set()

    def dfs(node: str, path: list[str]) -> None:
        if node in path_set:
            cycle_start = path.index(node)
            circular.append(path[cycle_start:] + [node])
            return
        if node in visited:
            return
        visited.add(node)
        path_set.add(node)
        path.append(node)
        for neighbor in adjacency.get(node, set()):
            dfs(neighbor, path)
        path.pop()
        path_set.remove(node)

    for node in adjacency:
        dfs(node, [])

    # Find orphans
    imported_modules = {e["to"] for e in edges}
    orphans = [m["path"] for m in modules if m["path"] not in imported_modules]

    return {
        "edges": edges,
        "circular_dependencies": circular[:10],  # Cap to avoid huge output
        "orphan_modules": orphans,
    }


def load_tech_debt_hotspots(project_root: str) -> list[str]:
    """Extract file paths mentioned in TECH_DEBT.md."""
    tech_debt_path = os.path.join(project_root, "TECH_DEBT.md")
    hotspots = []
    if not os.path.exists(tech_debt_path):
        return hotspots
    try:
        with open(tech_debt_path, "r", encoding="utf-8") as f:
            content = f.read()
        # Find file path patterns
        for match in re.finditer(r"`([^`]*(?:src|lib|app)/[^`]+)`", content):
            hotspots.append(match.group(1))
        for match in re.finditer(r"(src/\S+\.\w+)", content):
            if match.group(1) not in hotspots:
                hotspots.append(match.group(1))
    except OSError:
        pass
    return hotspots


def load_security_hotspots(project_root: str) -> list[str]:
    """Extract files with recent security findings from reviews."""
    reviews_dir = os.path.join(project_root, "docs", "reviews")
    hotspots = []
    if not os.path.isdir(reviews_dir):
        return hotspots
    try:
        for review_file in os.listdir(reviews_dir):
            if not review_file.endswith(".md"):
                continue
            filepath = os.path.join(reviews_dir, review_file)
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
            for match in re.finditer(r"(src/\S+\.\w+)", content):
                if match.group(1) not in hotspots:
                    hotspots.append(match.group(1))
    except OSError:
        pass
    return hotspots


def build_index(
    src_dir: str, project_root: str, existing_index: dict | None = None
) -> dict:
    """Build the full codebase index."""
    start_time = time.time()

    source_files = find_source_files(src_dir)
    modules = []

    for file_info in source_files:
        filepath = file_info["path"]
        language = file_info["language"]

        # Incremental: skip unchanged files
        if existing_index:
            mtime = os.path.getmtime(filepath)
            existing_entry = None
            for m in existing_index.get("modules", []):
                if m["path"] == filepath:
                    existing_entry = m
                    break
            if existing_entry and existing_entry.get("mtime", 0) >= mtime:
                modules.append(existing_entry)
                continue

        symbols = extract_symbols(filepath, language)
        line_count = count_lines(filepath)

        modules.append({
            "path": filepath,
            "language": language,
            "lines": line_count,
            "symbols": symbols,
            "mtime": os.path.getmtime(filepath),
        })

    # Build dependency graph
    dep_graph = build_dependency_graph(modules)

    # Load hotspots
    tech_debt_hotspots = load_tech_debt_hotspots(project_root)
    security_hotspots = load_security_hotspots(project_root)
    all_hotspots = list(set(tech_debt_hotspots + security_hotspots))

    # Mark hotspot modules
    for module in modules:
        module["is_hotspot"] = module["path"] in all_hotspots

    build_time = time.time() - start_time

    # Summary stats
    total_functions = sum(
        len(m.get("symbols", {}).get("functions", [])) for m in modules
    )
    total_classes = sum(
        len(m.get("symbols", {}).get("classes", [])) for m in modules
    )

    return {
        "version": INDEX_VERSION,
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "build_time_seconds": round(build_time, 2),
        "summary": {
            "file_count": len(modules),
            "total_lines": sum(m.get("lines", 0) for m in modules),
            "total_functions": total_functions,
            "total_classes": total_classes,
            "dependency_edges": len(dep_graph["edges"]),
            "circular_dependencies": len(dep_graph["circular_dependencies"]),
            "orphan_modules": len(dep_graph["orphan_modules"]),
            "hotspot_count": sum(1 for m in modules if m.get("is_hotspot")),
            "languages": list(set(m["language"] for m in modules)),
        },
        "modules": modules,
        "dependency_graph": dep_graph,
        "hotspots": {
            "tech_debt": tech_debt_hotspots,
            "security": security_hotspots,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build codebase knowledge index for Agent Triforce"
    )
    parser.add_argument(
        "--output",
        default=DEFAULT_OUTPUT,
        help=f"Output path for the index (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--src-dir",
        default=DEFAULT_SRC_DIR,
        help=f"Source directory to scan (default: {DEFAULT_SRC_DIR})",
    )
    parser.add_argument(
        "--incremental",
        action="store_true",
        help="Incremental update: only re-index changed files",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output summary as JSON to stdout",
    )
    args = parser.parse_args()

    project_root = os.getcwd()

    # Load existing index for incremental builds
    existing_index = None
    if args.incremental and os.path.exists(args.output):
        try:
            with open(args.output, "r") as f:
                existing_index = json.load(f)
            if existing_index.get("version") != INDEX_VERSION:
                print(
                    f"Index version mismatch ({existing_index.get('version')} vs {INDEX_VERSION}). Full rebuild.",
                    file=sys.stderr,
                )
                existing_index = None
        except (json.JSONDecodeError, OSError):
            existing_index = None

    index = build_index(args.src_dir, project_root, existing_index)

    # Ensure output directory exists
    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)

    with open(args.output, "w") as f:
        json.dump(index, f, indent=2)

    summary = index["summary"]

    if args.json:
        json.dump(summary, sys.stdout, indent=2)
        print()
    else:
        print(f"Codebase index built in {index['build_time_seconds']}s")
        print(f"  Files:        {summary['file_count']}")
        print(f"  Lines:        {summary['total_lines']}")
        print(f"  Functions:    {summary['total_functions']}")
        print(f"  Classes:      {summary['total_classes']}")
        print(f"  Dependencies: {summary['dependency_edges']} edges")
        print(f"  Circular:     {summary['circular_dependencies']}")
        print(f"  Orphans:      {summary['orphan_modules']}")
        print(f"  Hotspots:     {summary['hotspot_count']}")
        print(f"  Languages:    {', '.join(summary['languages']) or 'none'}")
        print(f"  Output:       {args.output}")


if __name__ == "__main__":
    main()
