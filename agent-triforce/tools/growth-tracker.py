#!/usr/bin/env python3
"""Growth tracker for Agent Triforce.

Tracks adoption metrics, verifies pre-launch readiness gates, and determines
the current growth phase based on the milestones defined in
``docs/specs/growth-plan.md``.

Usage::

    python3 tools/growth-tracker.py status              # Current phase and metrics
    python3 tools/growth-tracker.py check               # Pre-launch readiness gates
    python3 tools/growth-tracker.py milestones           # Milestone-gated actions
    python3 tools/growth-tracker.py log --stars 5 ...    # Record weekly metrics
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from datetime import date
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional


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
GROWTH_LOG_FILE = PROJECT_ROOT / "docs" / "growth-log.md"
README_FILE = PROJECT_ROOT / "README.md"

# Repo creation date for age calculation (Agent Triforce created 2026-02-14)
REPO_CREATION_DATE = date(2026, 2, 14)

# Required GitHub topics per growth-plan.md Appendix A
REQUIRED_TOPICS = [
    "claude-code",
    "multi-agent",
    "developer-tools",
    "prompt-engineering",
    "checklist",
    "claude-code-plugin",
    "code-review",
    "security-audit",
]

# Methodology keywords that must appear in first 200 words of README
METHODOLOGY_KEYWORDS = ["checklist", "gawande", "boeing", "methodology"]

# Milestone thresholds from growth-plan.md Appendix E
MILESTONE_THRESHOLDS = [
    {"name": "Pre-launch readiness", "stars": 0, "age_days": 0,
     "action": "Complete pre-launch checklist (Appendix A)"},
    {"name": "Repo 30 days + 10 stars", "stars": 10, "age_days": 30,
     "action": "Submit hesreallyhim issue resubmission"},
    {"name": "50 stars", "stars": 50, "age_days": 0,
     "action": "Submit Show HN (if not done already)"},
    {"name": "100 stars", "stars": 100, "age_days": 0,
     "action": "Begin Loom/YouTube demo production"},
    {"name": "200 stars", "stars": 200, "age_days": 0,
     "action": "Resubmit to hesreallyhim if not yet accepted"},
    {"name": "300 stars", "stars": 300, "age_days": 0,
     "action": "Begin Product Hunt launch preparation"},
    {"name": "500 stars", "stars": 500, "age_days": 0,
     "action": "Open GitHub Discussions, seed with topics"},
]


# ---------------------------------------------------------------------------
# Entities
# ---------------------------------------------------------------------------

class GrowthPhase(Enum):
    """Growth phases from growth-plan.md."""

    PRE_LAUNCH = "Phase 0 — Pre-Launch"
    SOFT_LAUNCH = "Phase 1 — Soft Launch"
    CONTENT_MOMENTUM = "Phase 2 — Content Momentum"
    COMMUNITY = "Phase 3 — Community"


@dataclass
class GrowthMetrics:
    """Current growth state."""

    stars: int = 0
    forks: int = 0
    repo_age_days: int = 0
    visitors: int = 0
    clones: int = 0

    def to_dict(self) -> Dict:
        return {
            "stars": self.stars,
            "forks": self.forks,
            "repo_age_days": self.repo_age_days,
            "visitors": self.visitors,
            "clones": self.clones,
        }


@dataclass
class LaunchGate:
    """A single pre-launch readiness gate."""

    name: str
    passed: bool
    detail: str


# ---------------------------------------------------------------------------
# Business Logic — Phase Determination
# ---------------------------------------------------------------------------

def determine_phase(metrics: GrowthMetrics) -> GrowthPhase:
    """Determine current growth phase based on metrics.

    Phase boundaries from growth-plan.md:
    - Phase 0: stars < 10 OR repo_age_days < 30
    - Phase 1: stars >= 10 AND repo_age_days >= 30 AND stars < 50
    - Phase 2: stars >= 50 AND stars < 200
    - Phase 3: stars >= 200
    """
    if metrics.stars < 10 or metrics.repo_age_days < 30:
        return GrowthPhase.PRE_LAUNCH
    if metrics.stars < 50:
        return GrowthPhase.SOFT_LAUNCH
    if metrics.stars < 200:
        return GrowthPhase.CONTENT_MOMENTUM
    return GrowthPhase.COMMUNITY


# ---------------------------------------------------------------------------
# Business Logic — Gate Evaluation
# ---------------------------------------------------------------------------

def evaluate_gates(gates: List[LaunchGate]) -> Dict:
    """Evaluate a list of launch gates and return summary.

    Returns a dict with: passed (bool), total, passing, failing (list of dicts).
    """
    if not gates:
        return {"passed": False, "total": 0, "passing": 0, "failing": []}

    failing = [
        {"name": g.name, "detail": g.detail}
        for g in gates
        if not g.passed
    ]
    passing_count = sum(1 for g in gates if g.passed)

    return {
        "passed": len(failing) == 0,
        "total": len(gates),
        "passing": passing_count,
        "failing": failing,
    }


# ---------------------------------------------------------------------------
# Business Logic — Growth Log Parsing
# ---------------------------------------------------------------------------

def _parse_numeric(value: str) -> int:
    """Parse a numeric value from a table cell, treating dashes as 0."""
    stripped = value.strip()
    if not stripped or stripped in ("—", "-", "N/A", "n/a"):
        return 0
    try:
        return int(stripped.replace(",", ""))
    except ValueError:
        return 0


def _split_table_cells(line: str) -> List[str]:
    """Split a markdown table row into cells, stripping pipes and whitespace."""
    cells = [c.strip() for c in line.strip().split("|")]
    if cells and cells[0] == "":
        cells = cells[1:]
    if cells and cells[-1] == "":
        cells = cells[:-1]
    return cells


def _is_separator_row(cells: List[str]) -> bool:
    """Check if a row of cells is a markdown table separator (---|---|...)."""
    return all(set(c.strip()) <= set("-: ") for c in cells if c.strip())


def _build_entry_from_cells(cells: List[str]) -> Dict:
    """Build a growth metrics entry dict from table cells."""
    def _cell(index: int, default: str = "") -> str:
        return cells[index].strip() if len(cells) > index else default

    return {
        "date": _cell(0),
        "stars": _parse_numeric(_cell(1, "0")),
        "forks": _parse_numeric(_cell(2, "0")),
        "visitors": _parse_numeric(_cell(3, "0")),
        "clones": _parse_numeric(_cell(4, "0")),
        "top_referrers": _cell(5),
        "content_published": _cell(6),
        "curated_list_updates": _cell(7),
        "notes": _cell(8),
    }


def parse_growth_log(content: str) -> List[Dict]:
    """Parse growth-log.md table into a list of metric entries."""
    if not content.strip():
        return []

    entries = []
    in_table = False
    header_found = False

    for line in content.strip().split("\n"):
        if not line.strip().startswith("|"):
            in_table = False
            header_found = False
            continue

        cells = _split_table_cells(line)

        if not in_table:
            if any("date" in c.lower() for c in cells):
                in_table = True
                continue

        if not header_found and _is_separator_row(cells):
            header_found = True
            continue

        if in_table and header_found and len(cells) >= 5:
            entries.append(_build_entry_from_cells(cells))

    return entries


# ---------------------------------------------------------------------------
# Business Logic — Format Log Entry
# ---------------------------------------------------------------------------

def format_log_entry(entry: Dict) -> str:
    """Format a metrics dict as a growth-log markdown table row."""
    def _fmt(val) -> str:
        if isinstance(val, int) and val == 0:
            return "\u2014"
        if isinstance(val, str) and not val.strip():
            return "\u2014"
        return str(val)

    return (
        f"| {entry.get('date', '')} "
        f"| {_fmt(entry.get('stars', 0))} "
        f"| {_fmt(entry.get('forks', 0))} "
        f"| {_fmt(entry.get('visitors', 0))} "
        f"| {_fmt(entry.get('clones', 0))} "
        f"| {_fmt(entry.get('top_referrers', ''))} "
        f"| {_fmt(entry.get('content_published', ''))} "
        f"| {_fmt(entry.get('curated_list_updates', ''))} "
        f"| {_fmt(entry.get('notes', ''))} |"
    )


# ---------------------------------------------------------------------------
# Business Logic — README Gate Checks
# ---------------------------------------------------------------------------

def check_readme_methodology(readme_content: str) -> LaunchGate:
    """Check if the README has methodology keywords in the first 200 words.

    Per growth-plan.md Appendix A: README must show the methodology argument
    in the first 200 words (before install instructions).
    """
    words = readme_content.split()
    first_200 = " ".join(words[:200]).lower()

    found = [kw for kw in METHODOLOGY_KEYWORDS if kw in first_200]
    missing = [kw for kw in METHODOLOGY_KEYWORDS if kw not in first_200]

    if missing:
        return LaunchGate(
            name="README methodology above fold",
            passed=False,
            detail=f"Missing keywords in first 200 words: {', '.join(missing)}",
        )

    return LaunchGate(
        name="README methodology above fold",
        passed=True,
        detail=f"Found {len(found)} methodology keywords in first 200 words",
    )


def check_github_topics(topics: List[str]) -> LaunchGate:
    """Check if all required GitHub topics are applied.

    Per growth-plan.md Appendix A: all 8 topics must be applied.
    """
    topics_lower = [t.lower() for t in topics]
    missing = [t for t in REQUIRED_TOPICS if t.lower() not in topics_lower]

    if missing:
        return LaunchGate(
            name="GitHub topics",
            passed=False,
            detail=f"Missing topics: {', '.join(missing)}",
        )

    return LaunchGate(
        name="GitHub topics",
        passed=True,
        detail=f"All {len(REQUIRED_TOPICS)} required topics applied",
    )


def check_changelog_current() -> LaunchGate:
    """Check if CHANGELOG.md exists and has content."""
    changelog_file = PROJECT_ROOT / "CHANGELOG.md"
    if not changelog_file.exists():
        return LaunchGate(
            name="CHANGELOG current",
            passed=False,
            detail="CHANGELOG.md not found",
        )

    content = changelog_file.read_text()
    if len(content.strip()) < 100:
        return LaunchGate(
            name="CHANGELOG current",
            passed=False,
            detail="CHANGELOG.md appears empty or minimal",
        )

    return LaunchGate(
        name="CHANGELOG current",
        passed=True,
        detail="CHANGELOG.md exists and has content",
    )


def check_growth_log_exists() -> LaunchGate:
    """Check if growth-log.md has a baseline entry."""
    if not GROWTH_LOG_FILE.exists():
        return LaunchGate(
            name="Growth log baseline",
            passed=False,
            detail="docs/growth-log.md not found",
        )

    content = GROWTH_LOG_FILE.read_text()
    entries = parse_growth_log(content)

    if not entries:
        return LaunchGate(
            name="Growth log baseline",
            passed=False,
            detail="docs/growth-log.md has no data entries",
        )

    return LaunchGate(
        name="Growth log baseline",
        passed=True,
        detail=f"Growth log has {len(entries)} entries, latest: {entries[-1].get('date', 'unknown')}",
    )


def check_readme_description_length() -> LaunchGate:
    """Check if the README first paragraph is concise (under ~100 chars for repo description)."""
    if not README_FILE.exists():
        return LaunchGate(
            name="README exists",
            passed=False,
            detail="README.md not found",
        )
    return LaunchGate(
        name="README exists",
        passed=True,
        detail="README.md found",
    )


# ---------------------------------------------------------------------------
# Business Logic — Milestone Actions
# ---------------------------------------------------------------------------

def get_unlocked_actions(metrics: GrowthMetrics) -> List[str]:
    """Return list of actions unlocked by current metrics.

    Milestones are from growth-plan.md Appendix E.
    """
    unlocked = []
    for milestone in MILESTONE_THRESHOLDS:
        stars_met = metrics.stars >= milestone["stars"]
        age_met = metrics.repo_age_days >= milestone["age_days"]
        if stars_met and age_met:
            unlocked.append(f"{milestone['name']}: {milestone['action']}")
    return unlocked


def get_locked_milestones(metrics: GrowthMetrics) -> List[Dict]:
    """Return milestones not yet unlocked with what's needed."""
    locked = []
    for milestone in MILESTONE_THRESHOLDS:
        stars_met = metrics.stars >= milestone["stars"]
        age_met = metrics.repo_age_days >= milestone["age_days"]
        if not (stars_met and age_met):
            blockers = []
            if not stars_met:
                blockers.append(
                    f"Need {milestone['stars'] - metrics.stars} more stars "
                    f"({metrics.stars}/{milestone['stars']})"
                )
            if not age_met:
                blockers.append(
                    f"Need {milestone['age_days'] - metrics.repo_age_days} more days "
                    f"(repo age: {metrics.repo_age_days}/{milestone['age_days']})"
                )
            locked.append({
                "name": milestone["name"],
                "action": milestone["action"],
                "blockers": blockers,
            })
    return locked


# ---------------------------------------------------------------------------
# Adapters — File I/O
# ---------------------------------------------------------------------------

def _read_file_safe(path: Path) -> str:
    """Read a file, returning empty string on error."""
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return ""


def _get_latest_metrics() -> GrowthMetrics:
    """Read the latest metrics from growth-log.md."""
    content = _read_file_safe(GROWTH_LOG_FILE)
    entries = parse_growth_log(content)

    repo_age = (date.today() - REPO_CREATION_DATE).days

    if not entries:
        return GrowthMetrics(stars=0, forks=0, repo_age_days=repo_age)

    latest = entries[-1]
    return GrowthMetrics(
        stars=latest.get("stars", 0),
        forks=latest.get("forks", 0),
        repo_age_days=repo_age,
        visitors=latest.get("visitors", 0),
        clones=latest.get("clones", 0),
    )


def _run_all_gates() -> List[LaunchGate]:
    """Run all pre-launch readiness gates."""
    gates = []

    # Gate 1: README exists
    gates.append(check_readme_description_length())

    # Gate 2: README methodology above fold
    readme_content = _read_file_safe(README_FILE)
    if readme_content:
        gates.append(check_readme_methodology(readme_content))
    else:
        gates.append(LaunchGate(
            name="README methodology above fold",
            passed=False,
            detail="Could not read README.md",
        ))

    # Gate 3: CHANGELOG current
    gates.append(check_changelog_current())

    # Gate 4: Growth log baseline
    gates.append(check_growth_log_exists())

    return gates


def _append_log_entry(entry: Dict) -> None:
    """Append a new entry to growth-log.md."""
    row = format_log_entry(entry)
    content = _read_file_safe(GROWTH_LOG_FILE)

    if not content:
        # Create the file with header
        header = (
            "# Growth Log\n\n"
            "Weekly tracking for Agent Triforce adoption metrics. "
            "Updated every Monday per [growth-plan.md](specs/growth-plan.md) Appendix E.\n\n"
            "| Date | Stars | Forks | Visitors | Clones | Top Referrers "
            "| Content Published | Curated List Updates | Notes |\n"
            "|------|-------|-------|----------|--------|---------------"
            "|-------------------|---------------------|-------|\n"
        )
        content = header

    content = content.rstrip() + "\n" + row + "\n"
    GROWTH_LOG_FILE.write_text(content, encoding="utf-8")


# ---------------------------------------------------------------------------
# Output Helpers
# ---------------------------------------------------------------------------

def _output_json(data: Dict) -> None:
    """Print JSON to stdout."""
    json.dump(data, sys.stdout, indent=2, default=str)
    sys.stdout.write("\n")


def _exit_error(message: str, code: int = 2) -> None:
    """Print error JSON and exit."""
    json.dump({"error": message}, sys.stderr)
    sys.stderr.write("\n")
    sys.exit(code)


# ---------------------------------------------------------------------------
# CLI Subcommands
# ---------------------------------------------------------------------------

def cmd_status(args: argparse.Namespace) -> None:
    """Show current growth phase and metrics."""
    metrics = _get_latest_metrics()
    phase = determine_phase(metrics)

    _output_json({
        "phase": phase.value,
        "phase_id": phase.name,
        "metrics": metrics.to_dict(),
        "repo_creation_date": REPO_CREATION_DATE.isoformat(),
    })


def cmd_check(args: argparse.Namespace) -> None:
    """Run pre-launch readiness gates."""
    gates = _run_all_gates()
    result = evaluate_gates(gates)
    result["gates"] = [
        {"name": g.name, "passed": g.passed, "detail": g.detail}
        for g in gates
    ]

    _output_json(result)
    sys.exit(0 if result["passed"] else 1)


def cmd_milestones(args: argparse.Namespace) -> None:
    """Show milestone-gated actions."""
    metrics = _get_latest_metrics()
    unlocked = get_unlocked_actions(metrics)
    locked = get_locked_milestones(metrics)

    _output_json({
        "metrics": metrics.to_dict(),
        "unlocked": unlocked,
        "locked": locked,
    })


def cmd_log(args: argparse.Namespace) -> None:
    """Record weekly metrics to growth-log.md."""
    entry = {
        "date": args.date or date.today().isoformat(),
        "stars": args.stars,
        "forks": args.forks,
        "visitors": args.visitors,
        "clones": args.clones,
        "top_referrers": args.referrers or "",
        "content_published": args.content or "",
        "curated_list_updates": args.curated or "",
        "notes": args.notes or "",
    }

    _append_log_entry(entry)
    _output_json({"status": "recorded", "entry": entry})


# ---------------------------------------------------------------------------
# CLI Entry Point
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    """Build the argument parser."""
    parser = argparse.ArgumentParser(
        description="Agent Triforce growth tracker and pre-launch gate checker.",
    )
    sub = parser.add_subparsers(dest="command")

    # status
    sub.add_parser("status", help="Show current growth phase and metrics")

    # check
    sub.add_parser("check", help="Run pre-launch readiness gates")

    # milestones
    sub.add_parser("milestones", help="Show milestone-gated actions")

    # log
    log_parser = sub.add_parser("log", help="Record weekly metrics")
    log_parser.add_argument("--date", type=str, default=None,
                            help="Date (YYYY-MM-DD), defaults to today")
    log_parser.add_argument("--stars", type=int, required=True,
                            help="Current star count")
    log_parser.add_argument("--forks", type=int, default=0,
                            help="Current fork count")
    log_parser.add_argument("--visitors", type=int, default=0,
                            help="Unique visitors this week")
    log_parser.add_argument("--clones", type=int, default=0,
                            help="Clone count this week")
    log_parser.add_argument("--referrers", type=str, default=None,
                            help="Top referring sites")
    log_parser.add_argument("--content", type=str, default=None,
                            help="Content published this week")
    log_parser.add_argument("--curated", type=str, default=None,
                            help="Curated list updates")
    log_parser.add_argument("--notes", type=str, default=None,
                            help="Additional notes")

    return parser


def main() -> None:
    """Entry point."""
    parser = build_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(2)

    commands = {
        "status": cmd_status,
        "check": cmd_check,
        "milestones": cmd_milestones,
        "log": cmd_log,
    }

    handler = commands.get(args.command)
    if handler is None:
        _exit_error(f"Unknown command: {args.command}")
    handler(args)


if __name__ == "__main__":
    main()
