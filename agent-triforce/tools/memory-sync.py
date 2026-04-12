#!/usr/bin/env python3
"""Cross-Agent Memory Sync with Conflict Detection.

Reads all agent MEMORY.md files, detects conflicting assessments of the same
entities across agents, and provides resolution workflows.

Usage::

    python3 tools/memory-sync.py check                     # Detect conflicts
    python3 tools/memory-sync.py check --json               # JSON output
    python3 tools/memory-sync.py resolve <conflict-id> <a|b|investigate>
    python3 tools/memory-sync.py show                       # Show all memory entries

Zero external dependencies. Python 3.9+.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

def _find_project_root() -> Path:
    """Find the project root directory.

    When run as a plugin hook, __file__ is inside the plugin cache
    (~/.claude/plugins/cache/), so we check CWD first for project markers.
    Falls back to __file__-relative resolution for direct invocation.
    """
    cwd = Path.cwd()
    if (cwd / "CLAUDE.md").exists() or (cwd / ".claude" / "agents").exists():
        return cwd
    return Path(__file__).resolve().parent.parent


PROJECT_ROOT = _find_project_root()

MEMORY_DIR = PROJECT_ROOT / ".claude" / "agent-memory"
ARCHIVE_DIR = PROJECT_ROOT / "docs" / "memory-archive"

AGENT_DIRS = {
    "prometeo-pm": MEMORY_DIR / "prometeo-pm",
    "forja-dev": MEMORY_DIR / "forja-dev",
    "centinela-qa": MEMORY_DIR / "centinela-qa",
}

AGENT_DISPLAY = {
    "prometeo-pm": "Prometeo (PM)",
    "forja-dev": "Forja (Dev)",
    "centinela-qa": "Centinela (QA)",
}

# Sentiment pairs: opposing assessments that signal a conflict.
# Each tuple is (positive_set, negative_set) -- if agent A uses a word from
# one set and agent B uses a word from the other set for the same entity,
# that is a conflict.
SENTIMENT_PAIRS: List[Tuple[frozenset, frozenset]] = [
    (frozenset({"stable", "solid", "reliable", "robust", "healthy"}),
     frozenset({"fragile", "unstable", "brittle", "flaky", "broken"})),
    (frozenset({"simple", "straightforward", "clean", "minimal"}),
     frozenset({"complex", "complicated", "convoluted", "messy"})),
    (frozenset({"complete", "done", "finished", "resolved", "fixed"}),
     frozenset({"incomplete", "partial", "pending", "unfinished", "in progress"})),
    (frozenset({"safe", "secure", "hardened", "protected"}),
     frozenset({"vulnerable", "insecure", "exposed", "risky", "unsafe"})),
    (frozenset({"fast", "performant", "efficient", "optimized"}),
     frozenset({"slow", "inefficient", "bottleneck", "degraded"})),
    (frozenset({"tested", "covered", "verified"}),
     frozenset({"untested", "uncovered", "unverified"})),
    (frozenset({"low risk", "no issues", "no known issues"}),
     frozenset({"high risk", "critical", "vulnerability", "critical vulnerability"})),
]


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------


@dataclass
class MemoryEntry:
    """A single structured entry from an agent's MEMORY.md."""

    agent: str
    section: str
    content: str
    entities: List[str] = field(default_factory=list)
    sentiments: List[str] = field(default_factory=list)
    line_number: int = 0


@dataclass
class Conflict:
    """A detected conflict between two agents' memory entries."""

    conflict_id: str
    entity: str
    agent_a: str
    entry_a: str
    sentiment_a: str
    agent_b: str
    entry_b: str
    sentiment_b: str
    detected_at: str = ""

    def __post_init__(self) -> None:
        if not self.detected_at:
            self.detected_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")


@dataclass
class Resolution:
    """A resolved conflict."""

    conflict_id: str
    resolution: str  # "accept_a", "accept_b", "investigate"
    resolved_at: str
    note: str = ""


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------


def _read_file_safe(path: Path) -> str:
    """Read a file, returning empty string on any error."""
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return ""


def _extract_entities(text: str) -> List[str]:
    """Extract potential entity names from text.

    Looks for module names, component names, feature names, and quoted terms.
    Uses heuristics: words after common patterns like "module", "component",
    paths like src/foo/bar, and backtick-quoted identifiers.
    """
    entities: List[str] = []

    # Backtick-quoted identifiers: `auth module`, `dashboard.py`
    entities.extend(re.findall(r"`([^`]+)`", text))

    # Path-like references: src/auth/login.py, tools/dashboard.py
    entities.extend(re.findall(r"(?:src|tools|tests|docs)/[\w/.-]+", text))

    # Word after "module", "component", "service", "feature", "system"
    for keyword in ("module", "component", "service", "feature", "system", "file"):
        pattern = rf"\b{keyword}\s*[:\-]?\s*(\w[\w.-]*)"
        for match in re.finditer(pattern, text, re.IGNORECASE):
            entities.append(match.group(1).lower())

    # Normalize: lowercase, strip extensions for comparison
    normalized: List[str] = []
    for entity in entities:
        clean = entity.strip().lower()
        clean = re.sub(r"\.(py|ts|js|md)$", "", clean)
        if len(clean) >= 2:
            normalized.append(clean)

    return list(set(normalized))


def _extract_sentiments(text: str) -> List[str]:
    """Extract sentiment words from text that match our conflict pairs."""
    found: List[str] = []
    text_lower = text.lower()
    for positive, negative in SENTIMENT_PAIRS:
        for word in positive:
            if word in text_lower:
                found.append(word)
        for word in negative:
            if word in text_lower:
                found.append(word)
    return found


def parse_memory_file(agent: str, path: Path) -> List[MemoryEntry]:
    """Parse an agent's MEMORY.md into structured entries.

    Splits on ## headings and further on ### sub-headings, extracting
    entities and sentiments from each block.
    """
    text = _read_file_safe(path)
    if not text.strip():
        return []

    entries: List[MemoryEntry] = []
    current_section = "General"
    current_content_lines: List[str] = []
    current_line_start = 1

    for line_num, line in enumerate(text.splitlines(), start=1):
        heading_match = re.match(r"^(#{1,3})\s+(.+)", line)
        if heading_match:
            # Flush previous block
            if current_content_lines:
                content = "\n".join(current_content_lines).strip()
                if content:
                    entities = _extract_entities(content)
                    sentiments = _extract_sentiments(content)
                    entries.append(MemoryEntry(
                        agent=agent,
                        section=current_section,
                        content=content,
                        entities=entities,
                        sentiments=sentiments,
                        line_number=current_line_start,
                    ))
            current_section = heading_match.group(2).strip()
            current_content_lines = []
            current_line_start = line_num
        else:
            current_content_lines.append(line)

    # Flush final block
    if current_content_lines:
        content = "\n".join(current_content_lines).strip()
        if content:
            entities = _extract_entities(content)
            sentiments = _extract_sentiments(content)
            entries.append(MemoryEntry(
                agent=agent,
                section=current_section,
                content=content,
                entities=entities,
                sentiments=sentiments,
                line_number=current_line_start,
            ))

    return entries


def load_all_memories() -> Dict[str, List[MemoryEntry]]:
    """Load memory entries from all agents."""
    result: Dict[str, List[MemoryEntry]] = {}
    for agent, agent_dir in AGENT_DIRS.items():
        mem_file = agent_dir / "MEMORY.md"
        if mem_file.exists():
            result[agent] = parse_memory_file(agent, mem_file)
        else:
            result[agent] = []
    return result


# ---------------------------------------------------------------------------
# Conflict detection
# ---------------------------------------------------------------------------


def _sentiment_opposes(sentiment_a: str, sentiment_b: str) -> bool:
    """Check if two sentiments are in opposing sets."""
    for positive, negative in SENTIMENT_PAIRS:
        if sentiment_a in positive and sentiment_b in negative:
            return True
        if sentiment_a in negative and sentiment_b in positive:
            return True
    return False


def _entities_overlap(entities_a: List[str], entities_b: List[str]) -> List[str]:
    """Find overlapping entities between two lists using substring matching."""
    matches: List[str] = []
    for ea in entities_a:
        for eb in entities_b:
            if ea == eb:
                matches.append(ea)
            elif len(ea) >= 3 and len(eb) >= 3:
                if ea in eb or eb in ea:
                    matches.append(ea if len(ea) >= len(eb) else eb)
    return list(set(matches))


def _make_conflict_id(entity: str, agent_a: str, agent_b: str) -> str:
    """Generate a stable conflict ID from the entity and agents."""
    agents_sorted = sorted([agent_a, agent_b])
    raw = f"{entity}|{agents_sorted[0]}|{agents_sorted[1]}"
    return "MC-" + hashlib.md5(raw.encode()).hexdigest()[:8]


def detect_conflicts(memories: Dict[str, List[MemoryEntry]]) -> List[Conflict]:
    """Detect conflicts across agent memories.

    A conflict exists when two agents reference the same entity with
    opposing sentiments.
    """
    conflicts: List[Conflict] = []
    agents = list(memories.keys())
    seen_pairs: set = set()

    for i, agent_a in enumerate(agents):
        for agent_b in agents[i + 1:]:
            for entry_a in memories[agent_a]:
                if not entry_a.entities or not entry_a.sentiments:
                    continue
                for entry_b in memories[agent_b]:
                    if not entry_b.entities or not entry_b.sentiments:
                        continue

                    overlapping = _entities_overlap(entry_a.entities, entry_b.entities)
                    if not overlapping:
                        continue

                    for entity in overlapping:
                        for sa in entry_a.sentiments:
                            for sb in entry_b.sentiments:
                                if _sentiment_opposes(sa, sb):
                                    pair_key = (entity, min(agent_a, agent_b), max(agent_a, agent_b))
                                    if pair_key in seen_pairs:
                                        continue
                                    seen_pairs.add(pair_key)

                                    conflict_id = _make_conflict_id(entity, agent_a, agent_b)
                                    # Truncate content for display
                                    content_a = entry_a.content[:200].strip()
                                    content_b = entry_b.content[:200].strip()
                                    conflicts.append(Conflict(
                                        conflict_id=conflict_id,
                                        entity=entity,
                                        agent_a=agent_a,
                                        entry_a=content_a,
                                        sentiment_a=sa,
                                        agent_b=agent_b,
                                        entry_b=content_b,
                                        sentiment_b=sb,
                                    ))

    return conflicts


# ---------------------------------------------------------------------------
# Resolution
# ---------------------------------------------------------------------------


def _load_resolutions() -> List[Resolution]:
    """Load previously resolved conflicts from the archive."""
    resolutions_file = ARCHIVE_DIR / "resolutions.json"
    if not resolutions_file.exists():
        return []
    try:
        data = json.loads(resolutions_file.read_text(encoding="utf-8"))
        return [Resolution(**r) for r in data]
    except (json.JSONDecodeError, OSError, TypeError):
        return []


def _save_resolutions(resolutions: List[Resolution]) -> None:
    """Save resolved conflicts to the archive."""
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    resolutions_file = ARCHIVE_DIR / "resolutions.json"
    data = [asdict(r) for r in resolutions]
    resolutions_file.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def resolve_conflict(conflict_id: str, resolution: str, note: str = "") -> bool:
    """Resolve a conflict by ID.

    Args:
        conflict_id: The MC-XXXXXXXX conflict identifier.
        resolution: One of "a", "b", or "investigate".
        note: Optional note for the resolution.

    Returns:
        True if the conflict was found and resolved, False otherwise.
    """
    resolution_map = {"a": "accept_a", "b": "accept_b", "investigate": "investigate"}
    resolution_value = resolution_map.get(resolution, resolution)

    if resolution_value not in ("accept_a", "accept_b", "investigate"):
        print(f"Error: Invalid resolution '{resolution}'. Use: a, b, or investigate", file=sys.stderr)
        return False

    # Verify conflict exists
    memories = load_all_memories()
    conflicts = detect_conflicts(memories)
    target = None
    for c in conflicts:
        if c.conflict_id == conflict_id:
            target = c
            break

    if target is None:
        print(f"Error: Conflict '{conflict_id}' not found.", file=sys.stderr)
        return False

    # Save resolution
    resolutions = _load_resolutions()
    resolutions.append(Resolution(
        conflict_id=conflict_id,
        resolution=resolution_value,
        resolved_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        note=note,
    ))
    _save_resolutions(resolutions)

    # Archive the losing entry
    _archive_conflict(target, resolution_value)

    return True


def _archive_conflict(conflict: Conflict, resolution: str) -> None:
    """Archive a resolved conflict to docs/memory-archive/."""
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    archive_file = ARCHIVE_DIR / f"resolved-{conflict.conflict_id}-{timestamp}.md"

    winner = conflict.agent_a if resolution == "accept_a" else (
        conflict.agent_b if resolution == "accept_b" else "under investigation"
    )
    loser = conflict.agent_b if resolution == "accept_a" else (
        conflict.agent_a if resolution == "accept_b" else "both entries retained"
    )

    content = f"""# Resolved Memory Conflict: {conflict.conflict_id}
**Entity**: {conflict.entity}
**Resolved**: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
**Resolution**: {resolution}
**Winner**: {AGENT_DISPLAY.get(winner, winner)}
**Archived from**: {AGENT_DISPLAY.get(loser, loser)}

## Agent A: {AGENT_DISPLAY.get(conflict.agent_a, conflict.agent_a)}
**Sentiment**: {conflict.sentiment_a}
{conflict.entry_a}

## Agent B: {AGENT_DISPLAY.get(conflict.agent_b, conflict.agent_b)}
**Sentiment**: {conflict.sentiment_b}
{conflict.entry_b}
"""
    archive_file.write_text(content, encoding="utf-8")


# ---------------------------------------------------------------------------
# Output formatters
# ---------------------------------------------------------------------------


def _filter_unresolved(conflicts: List[Conflict]) -> List[Conflict]:
    """Remove already-resolved conflicts."""
    resolutions = _load_resolutions()
    resolved_ids = {r.conflict_id for r in resolutions}
    return [c for c in conflicts if c.conflict_id not in resolved_ids]


def format_conflicts_markdown(conflicts: List[Conflict]) -> str:
    """Format conflicts as readable markdown."""
    if not conflicts:
        return "No memory conflicts detected across agents.\n"

    lines = [
        "# Cross-Agent Memory Conflicts",
        f"**Detected**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"**Conflicts found**: {len(conflicts)}",
        "",
    ]

    for c in conflicts:
        display_a = AGENT_DISPLAY.get(c.agent_a, c.agent_a)
        display_b = AGENT_DISPLAY.get(c.agent_b, c.agent_b)
        lines.extend([
            f"## {c.conflict_id}: {c.entity}",
            "",
            f"**Entity**: `{c.entity}`",
            "",
            f"### {display_a}",
            f"**Assessment**: {c.sentiment_a}",
            f"> {c.entry_a}",
            "",
            f"### {display_b}",
            f"**Assessment**: {c.sentiment_b}",
            f"> {c.entry_b}",
            "",
            "**Resolution options**:",
            f"- `python3 tools/memory-sync.py resolve {c.conflict_id} a` -- Accept {display_a}'s assessment",
            f"- `python3 tools/memory-sync.py resolve {c.conflict_id} b` -- Accept {display_b}'s assessment",
            f"- `python3 tools/memory-sync.py resolve {c.conflict_id} investigate` -- Mark as under investigation",
            "",
            "---",
            "",
        ])

    return "\n".join(lines)


def format_conflicts_json(conflicts: List[Conflict]) -> str:
    """Format conflicts as JSON."""
    data = {
        "version": "1.0.0",
        "detectedAt": datetime.now().isoformat(),
        "conflictCount": len(conflicts),
        "conflicts": [asdict(c) for c in conflicts],
    }
    return json.dumps(data, indent=2, ensure_ascii=False)


def format_memories_summary(memories: Dict[str, List[MemoryEntry]]) -> str:
    """Format a summary of all agent memories."""
    lines = [
        "# Cross-Agent Memory Summary",
        f"**Generated**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "",
    ]

    for agent, entries in memories.items():
        display = AGENT_DISPLAY.get(agent, agent)
        lines.append(f"## {display}")
        lines.append(f"**Entries**: {len(entries)}")
        entities_all = set()
        for e in entries:
            entities_all.update(e.entities)
        if entities_all:
            lines.append(f"**Entities referenced**: {', '.join(sorted(entities_all))}")
        lines.append("")
        for entry in entries:
            lines.append(f"### {entry.section}")
            if entry.entities:
                lines.append(f"Entities: {', '.join(entry.entities)}")
            if entry.sentiments:
                lines.append(f"Sentiments: {', '.join(entry.sentiments)}")
            lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def cmd_check(args: argparse.Namespace) -> int:
    """Run conflict detection and output results."""
    memories = load_all_memories()
    all_conflicts = detect_conflicts(memories)
    conflicts = _filter_unresolved(all_conflicts)

    if args.json:
        print(format_conflicts_json(conflicts))
    else:
        print(format_conflicts_markdown(conflicts))

    if conflicts:
        print(f"Found {len(conflicts)} unresolved conflict(s).", file=sys.stderr)
    else:
        total_entries = sum(len(v) for v in memories.values())
        print(f"Scanned {total_entries} memory entries across {len(memories)} agents. No conflicts.", file=sys.stderr)

    return 1 if conflicts else 0


def cmd_resolve(args: argparse.Namespace) -> int:
    """Resolve a detected conflict."""
    success = resolve_conflict(
        conflict_id=args.conflict_id,
        resolution=args.resolution,
        note=args.note or "",
    )
    if success:
        print(f"Conflict {args.conflict_id} resolved as '{args.resolution}'.")
        return 0
    return 1


def cmd_show(args: argparse.Namespace) -> int:
    """Show all memory entries across agents."""
    memories = load_all_memories()
    print(format_memories_summary(memories))
    return 0


def main() -> None:
    """Entry point for the memory sync CLI."""
    parser = argparse.ArgumentParser(
        description="Cross-Agent Memory Sync with Conflict Detection",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python3 tools/memory-sync.py check              # Detect conflicts\n"
            "  python3 tools/memory-sync.py check --json        # JSON output\n"
            "  python3 tools/memory-sync.py resolve MC-a1b2c3d4 a  # Accept agent A\n"
            "  python3 tools/memory-sync.py resolve MC-a1b2c3d4 investigate\n"
            "  python3 tools/memory-sync.py show                # Show all entries\n"
        ),
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    # check
    check_parser = subparsers.add_parser("check", help="Detect memory conflicts")
    check_parser.add_argument("--json", action="store_true", help="Output as JSON")
    check_parser.set_defaults(func=cmd_check)

    # resolve
    resolve_parser = subparsers.add_parser("resolve", help="Resolve a conflict")
    resolve_parser.add_argument("conflict_id", help="Conflict ID (MC-XXXXXXXX)")
    resolve_parser.add_argument("resolution", choices=["a", "b", "investigate"],
                                help="Accept A, accept B, or mark as under investigation")
    resolve_parser.add_argument("--note", default="", help="Resolution note")
    resolve_parser.set_defaults(func=cmd_resolve)

    # show
    show_parser = subparsers.add_parser("show", help="Show all memory entries")
    show_parser.set_defaults(func=cmd_show)

    args = parser.parse_args()
    sys.exit(args.func(args))


if __name__ == "__main__":
    main()
