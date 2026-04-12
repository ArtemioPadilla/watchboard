#!/usr/bin/env python3
"""Agent Triforce Dashboard -- multi-agent system overview.

Parses project files and renders a comprehensive dashboard in two modes:
  - Terminal (default): Rich terminal UI using the ``rich`` library
  - HTML (``--html``):  Self-contained dark-themed HTML file

Usage::

    python tools/dashboard.py              # Terminal (requires rich)
    python tools/dashboard.py --html       # HTML -> tools/dashboard.html
    python tools/dashboard.py --html -o /tmp/dash.html  # Custom path
"""
from __future__ import annotations

import argparse
import html as html_mod
import re
import subprocess
import sys
import webbrowser
from dataclasses import dataclass, field
from datetime import date, datetime
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

AGENT_DIR = PROJECT_ROOT / ".claude" / "agents"
SKILL_DIR = PROJECT_ROOT / ".claude" / "skills"
SPEC_DIR = PROJECT_ROOT / "docs" / "specs"
REVIEW_DIR = PROJECT_ROOT / "docs" / "reviews"
ADR_DIR = PROJECT_ROOT / "docs" / "adr"
MEMORY_DIR = PROJECT_ROOT / ".claude" / "agent-memory"
TECH_DEBT_FILE = PROJECT_ROOT / "TECH_DEBT.md"
CHANGELOG_FILE = PROJECT_ROOT / "CHANGELOG.md"

AGENT_FILES = ["prometeo-pm.md", "forja-dev.md", "centinela-qa.md"]

AGENT_DISPLAY_NAMES: Dict[str, str] = {
    "prometeo-pm": "Prometeo (PM)",
    "forja-dev": "Forja (Dev)",
    "centinela-qa": "Centinela (QA)",
}

DEFAULT_HTML_OUTPUT = PROJECT_ROOT / "tools" / "dashboard.html"

# Colors
COLOR_PROMETEO_HEX = "#F59E0B"
COLOR_FORJA_HEX = "#3B82F6"
COLOR_CENTINELA_HEX = "#10B981"
COLOR_CRITICAL_HEX = "#EF4444"
COLOR_WARNING_HEX = "#F59E0B"
COLOR_SUGGESTION_HEX = "#3B82F6"
COLOR_LOW_HEX = "#94a3b8"
COLOR_BG_HEX = "#0f172a"
COLOR_SURFACE_HEX = "#1e293b"
COLOR_HEALTHY_HEX = "#10B981"

AGENT_COLORS: Dict[str, str] = {
    "prometeo-pm": COLOR_PROMETEO_HEX,
    "forja-dev": COLOR_FORJA_HEX,
    "centinela-qa": COLOR_CENTINELA_HEX,
}

SEVERITY_COLORS: Dict[str, str] = {
    "Critical": COLOR_CRITICAL_HEX,
    "High": COLOR_WARNING_HEX,
    "Medium": COLOR_SUGGESTION_HEX,
    "Low": COLOR_LOW_HEX,
}

COMMIT_TYPE_COLORS: Dict[str, str] = {
    "feat": "#10B981",
    "fix": "#EF4444",
    "docs": "#3B82F6",
    "refactor": "#8B5CF6",
    "test": "#F59E0B",
    "chore": "#94a3b8",
}

PIPELINE_STAGES = ["Draft", "In Review", "Approved", "In Development", "Done"]


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------


class HealthStatus(Enum):
    """System-wide health indicator."""

    HEALTHY = "HEALTHY"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


@dataclass
class ChecklistInfo:
    """A single checklist parsed from an agent file."""

    name: str
    checklist_type: str  # DO-CONFIRM or READ-DO
    item_count: int


@dataclass
class AgentInfo:
    """Parsed agent configuration."""

    filename: str
    name: str
    description: str
    model: str
    memory: str
    permission_mode: str
    tools: List[str]
    skills: List[str]
    checklists: List[ChecklistInfo] = field(default_factory=list)


@dataclass
class SkillInfo:
    """Parsed skill configuration."""

    name: str
    description: str
    context: str
    agent: str


@dataclass
class SpecInfo:
    """Parsed feature specification metadata."""

    filename: str
    title: str
    status: str
    priority: str
    spec_date: str
    tier: str = ""
    ac_count: int = 0


@dataclass
class ReviewInfo:
    """Parsed review metadata."""

    filename: str
    review_type: str  # feature, security-audit, code-health, release-check
    verdict: str
    critical_count: int
    warning_count: int
    suggestion_count: int


@dataclass
class TechDebtItem:
    """Parsed tech debt entry."""

    item_id: str
    title: str
    debt_type: str
    severity: str
    found_date: str
    effort: str
    is_resolved: bool


@dataclass
class GitCommit:
    """A single git log entry."""

    short_hash: str
    timestamp: str
    message: str
    commit_type: str


@dataclass
class ChangelogSummary:
    """Counts per category in the Unreleased section."""

    categories: Dict[str, int] = field(default_factory=dict)


@dataclass
class MemorySnippet:
    """Preview of an agent's MEMORY.md."""

    agent_name: str
    preview: str


@dataclass
class NextAction:
    """A suggested next action for the user."""

    agent: str  # "PM", "Dev", "QA"
    command: str  # e.g. "/feature-spec"
    description: str
    details: str = ""


@dataclass
class CommRoute:
    """A communication handoff path between agents."""

    from_agent: str
    to_agent: str
    when: str
    what: str


@dataclass
class ADRRecord:
    """Parsed Architecture Decision Record."""

    number: str
    title: str
    status: str
    adr_date: str


# ---------------------------------------------------------------------------
# Parsers
# ---------------------------------------------------------------------------


def _read_file_safe(path: Path) -> str:
    """Read a file, returning empty string on any error."""
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return ""


def _parse_frontmatter(text: str) -> Dict[str, str]:
    """Parse YAML-like frontmatter between --- markers using regex.

    Returns a flat dict of key -> raw string value.
    """
    match = re.match(r"^---\s*\n(.*?)\n---", text, re.DOTALL)
    if not match:
        return {}
    block = match.group(1)
    result: Dict[str, str] = {}
    current_key: Optional[str] = None
    for line in block.splitlines():
        # list item under a key
        if re.match(r"^\s+-\s+", line) and current_key is not None:
            existing = result.get(current_key, "")
            item = re.sub(r"^\s+-\s+", "", line).strip()
            result[current_key] = f"{existing},{item}" if existing else item
            continue
        # key: value
        kv = re.match(r"^(\w[\w-]*):\s*(.*)", line)
        if kv:
            current_key = kv.group(1)
            value = kv.group(2).strip()
            # handle multiline '>' indicator
            if value == ">":
                value = ""
            result[current_key] = value
            continue
        # continuation line for multiline description
        if current_key is not None and line.strip():
            existing = result.get(current_key, "")
            result[current_key] = f"{existing} {line.strip()}" if existing else line.strip()
    return result


def _parse_checklists(text: str) -> List[ChecklistInfo]:
    """Extract checklist headings from the ## Checklists section."""
    checklists: List[ChecklistInfo] = []
    # Pattern: ### Name (TYPE) --- N items
    # Using both em-dash and regular dash for robustness
    pattern = re.compile(
        r"^###\s+(.+?)\s+\((DO-CONFIRM|READ-DO)\)\s+[\u2014\-]+\s+(\d+)\s+items?",
        re.MULTILINE,
    )
    for m in pattern.finditer(text):
        checklists.append(
            ChecklistInfo(
                name=m.group(1).strip(),
                checklist_type=m.group(2),
                item_count=int(m.group(3)),
            )
        )
    return checklists


def parse_agents() -> List[AgentInfo]:
    """Parse all agent configuration files."""
    agents: List[AgentInfo] = []
    for fname in AGENT_FILES:
        path = AGENT_DIR / fname
        text = _read_file_safe(path)
        if not text:
            continue
        fm = _parse_frontmatter(text)
        tools_raw = fm.get("tools", "")
        tools_list = [t.strip() for t in tools_raw.split(",") if t.strip()]
        skills_raw = fm.get("skills", "")
        skills_list = [s.strip() for s in skills_raw.split(",") if s.strip()]
        checklists = _parse_checklists(text)
        agents.append(
            AgentInfo(
                filename=fname,
                name=fm.get("name", fname.replace(".md", "")),
                description=fm.get("description", "").strip(),
                model=fm.get("model", "unknown"),
                memory=fm.get("memory", "unknown"),
                permission_mode=fm.get("permissionMode", "unknown"),
                tools=tools_list,
                skills=skills_list,
                checklists=checklists,
            )
        )
    return agents


def parse_skills() -> List[SkillInfo]:
    """Parse all skill configuration files."""
    skills: List[SkillInfo] = []
    if not SKILL_DIR.exists():
        return skills
    for skill_dir in sorted(SKILL_DIR.iterdir()):
        skill_file = skill_dir / "SKILL.md"
        if not skill_file.exists():
            continue
        text = _read_file_safe(skill_file)
        fm = _parse_frontmatter(text)
        if fm:
            skills.append(
                SkillInfo(
                    name=fm.get("name", skill_dir.name),
                    description=fm.get("description", "").strip(),
                    context=fm.get("context", ""),
                    agent=fm.get("agent", ""),
                )
            )
    return skills


def parse_specs() -> List[SpecInfo]:
    """Parse feature specification files."""
    specs: List[SpecInfo] = []
    if not SPEC_DIR.exists():
        return specs
    for path in sorted(SPEC_DIR.glob("*.md")):
        if path.name.lower() == "readme.md":
            continue
        text = _read_file_safe(path)
        if not text:
            continue
        title_m = re.search(r"^#\s+Feature:\s+(.+)", text, re.MULTILINE)
        status_m = re.search(r"\*\*Status\*\*:\s*(.+)", text)
        priority_m = re.search(r"\*\*Priority\*\*:\s*(.+)", text)
        date_m = re.search(r"\*\*Date\*\*:\s*(.+)", text)
        tier_m = re.search(r"\*\*Tier\*\*:\s*([SML])", text)
        ac_count = len(re.findall(r"\*\*GIVEN\*\*", text))
        specs.append(
            SpecInfo(
                filename=path.name,
                title=title_m.group(1).strip() if title_m else path.stem,
                status=status_m.group(1).strip() if status_m else "Unknown",
                priority=priority_m.group(1).strip() if priority_m else "Unknown",
                spec_date=date_m.group(1).strip() if date_m else "",
                tier=tier_m.group(1) if tier_m else "",
                ac_count=ac_count,
            )
        )
    return specs


def parse_reviews() -> List[ReviewInfo]:
    """Parse review files for verdicts and finding counts."""
    reviews: List[ReviewInfo] = []
    if not REVIEW_DIR.exists():
        return reviews
    for path in sorted(REVIEW_DIR.glob("*.md")):
        if path.name.lower() == "readme.md":
            continue
        text = _read_file_safe(path)
        if not text:
            continue
        # Determine review type from filename
        if path.name.startswith("security-audit-"):
            rtype = "security-audit"
        elif path.name.startswith("code-health-"):
            rtype = "code-health"
        elif path.name.startswith("release-check-"):
            rtype = "release-check"
        else:
            rtype = "feature"
        # Count unique findings (IDs repeat across sections in review files)
        critical = len(set(re.findall(r"\*\*\[C-\d+\]\*\*", text)))
        warning = len(set(re.findall(r"\*\*\[W-\d+\]\*\*", text)))
        suggestion = len(set(re.findall(r"\*\*\[S-\d+\]\*\*", text)))
        # Verdict
        verdict = "Unknown"
        for v in ["CHANGES REQUIRED", "APPROVED WITH CONDITIONS", "APPROVED"]:
            if v in text.upper():
                verdict = v.title()
                break
        reviews.append(
            ReviewInfo(
                filename=path.name,
                review_type=rtype,
                verdict=verdict,
                critical_count=critical,
                warning_count=warning,
                suggestion_count=suggestion,
            )
        )
    return reviews


def parse_tech_debt() -> List[TechDebtItem]:
    """Parse TECH_DEBT.md for active and resolved debt items."""
    text = _read_file_safe(TECH_DEBT_FILE)
    if not text:
        return []
    items: List[TechDebtItem] = []
    # Split into active and resolved sections
    active_section = ""
    resolved_section = ""
    active_m = re.search(r"## Active Debt\s*\n(.*?)(?=\n## |\Z)", text, re.DOTALL)
    resolved_m = re.search(r"## Resolved Debt\s*\n(.*?)(?=\n## |\Z)", text, re.DOTALL)
    if active_m:
        active_section = active_m.group(1)
    if resolved_m:
        resolved_section = resolved_m.group(1)
    for section, is_resolved in [(active_section, False), (resolved_section, True)]:
        pattern = re.compile(
            r"###\s+\[(TD-\d+)\]\s+(.+?)(?=\n###|\Z)", re.DOTALL
        )
        for m in pattern.finditer(section):
            item_id = m.group(1)
            block = m.group(0)
            title = m.group(2).split("\n")[0].strip()
            type_m = re.search(r"\*\*Type\*\*:\s*(.+)", block)
            sev_m = re.search(r"\*\*Severity\*\*:\s*(.+)", block)
            found_m = re.search(r"\*\*Found\*\*:\s*(.+)", block)
            effort_m = re.search(r"\*\*Estimated effort\*\*:\s*(.+)", block)
            items.append(
                TechDebtItem(
                    item_id=item_id,
                    title=title,
                    debt_type=type_m.group(1).strip() if type_m else "Unknown",
                    severity=sev_m.group(1).strip() if sev_m else "Unknown",
                    found_date=found_m.group(1).strip() if found_m else "",
                    effort=effort_m.group(1).strip() if effort_m else "",
                    is_resolved=is_resolved,
                )
            )
    return items


def parse_changelog() -> ChangelogSummary:
    """Parse CHANGELOG.md for Unreleased section category counts."""
    text = _read_file_safe(CHANGELOG_FILE)
    summary = ChangelogSummary()
    if not text:
        return summary
    # Extract Unreleased section
    unreleased_m = re.search(
        r"## \[Unreleased\]\s*\n(.*?)(?=\n## \[|\Z)", text, re.DOTALL
    )
    if not unreleased_m:
        return summary
    unreleased = unreleased_m.group(1)
    # Count items per category
    categories = re.findall(r"### (\w+)", unreleased)
    for cat in categories:
        cat_m = re.search(
            rf"### {re.escape(cat)}\s*\n(.*?)(?=\n### |\Z)", unreleased, re.DOTALL
        )
        if cat_m:
            count = len(re.findall(r"^- ", cat_m.group(1), re.MULTILINE))
            if count > 0:
                summary.categories[cat] = count
    return summary


def parse_git_log() -> List[GitCommit]:
    """Get the last 10 git commits."""
    try:
        result = subprocess.run(
            ["git", "log", "--format=%h|%ai|%s", "-10"],
            capture_output=True,
            text=True,
            timeout=5,
            cwd=str(PROJECT_ROOT),
        )
        if result.returncode != 0:
            return []
    except (OSError, subprocess.TimeoutExpired):
        return []
    commits: List[GitCommit] = []
    for line in result.stdout.strip().splitlines():
        parts = line.split("|", 2)
        if len(parts) < 3:
            continue
        short_hash, timestamp, message = parts
        # Extract conventional commit type
        type_m = re.match(r"^(feat|fix|docs|refactor|test|chore)(\(.+?\))?:", message)
        commit_type = type_m.group(1) if type_m else "other"
        commits.append(
            GitCommit(
                short_hash=short_hash.strip(),
                timestamp=timestamp.strip()[:10],
                message=message.strip(),
                commit_type=commit_type,
            )
        )
    return commits


def parse_memory_snippets() -> List[MemorySnippet]:
    """Read first 500 chars of each agent's MEMORY.md."""
    snippets: List[MemorySnippet] = []
    if not MEMORY_DIR.exists():
        return snippets
    for agent_dir in sorted(MEMORY_DIR.iterdir()):
        if not agent_dir.is_dir():
            continue
        mem_file = agent_dir / "MEMORY.md"
        text = _read_file_safe(mem_file)
        preview = text[:500].strip() if text.strip() else "(empty)"
        snippets.append(
            MemorySnippet(agent_name=agent_dir.name, preview=preview)
        )
    return snippets


def parse_adrs() -> List[ADRRecord]:
    """Parse ADR files for status and metadata."""
    adrs: List[ADRRecord] = []
    if not ADR_DIR.exists():
        return adrs
    for p in sorted(ADR_DIR.glob("ADR-*.md")):
        text = _read_file_safe(p)
        if not text:
            continue
        # Extract number and title from filename or heading
        num_m = re.search(r"ADR-(\d+)", p.name)
        number = num_m.group(1) if num_m else "?"
        title_m = re.search(r"^#\s+ADR-\d+[:\s]+(.+)", text, re.MULTILINE)
        title = title_m.group(1).strip() if title_m else p.stem
        status_m = re.search(r"\*\*Status\*\*:\s*(Proposed|Accepted|Deprecated|Superseded)", text)
        status = status_m.group(1) if status_m else "Unknown"
        date_m = re.search(r"\*\*Date\*\*:\s*(\d{4}-\d{2}-\d{2})", text)
        adr_date = date_m.group(1) if date_m else ""
        adrs.append(ADRRecord(number=number, title=title, status=status, adr_date=adr_date))
    return adrs


def parse_comm_schedule() -> List[CommRoute]:
    """Parse the Communication Schedule table from CLAUDE.md."""
    claude_md = PROJECT_ROOT / "CLAUDE.md"
    text = _read_file_safe(claude_md)
    if not text:
        return []
    routes: List[CommRoute] = []
    # Find the table after "Communication Schedule"
    table_m = re.search(r"### Communication Schedule.*?\n\|.*?\n\|[-\s|]+\n(.*?)(?:\n\n|\n#)", text, re.DOTALL)
    if not table_m:
        # Try alternate: find "| From | To |" table
        table_m = re.search(r"\| From \| To \|.*?\n\|[-\s|]+\n(.*?)(?:\n\n|\n#)", text, re.DOTALL)
    if not table_m:
        return routes
    for line in table_m.group(1).strip().splitlines():
        cols = [c.strip() for c in line.split("|") if c.strip()]
        if len(cols) >= 4:
            routes.append(CommRoute(
                from_agent=cols[0],
                to_agent=cols[1],
                when=cols[2],
                what=cols[3],
            ))
    return routes


# ---------------------------------------------------------------------------
# Health assessment
# ---------------------------------------------------------------------------


def compute_health(
    tech_debt: List[TechDebtItem],
    reviews: List[ReviewInfo],
    specs: List[SpecInfo],
) -> HealthStatus:
    """Determine system health status."""
    active_debt = [d for d in tech_debt if not d.is_resolved]
    # CRITICAL: any critical tech debt or CHANGES REQUIRED with critical findings
    if any(d.severity == "Critical" for d in active_debt):
        return HealthStatus.CRITICAL
    for r in reviews:
        if "changes required" in r.verdict.lower() and r.critical_count > 0:
            return HealthStatus.CRITICAL
    # WARNING: high tech debt, approved with conditions, in-dev without QA review
    if any(d.severity == "High" for d in active_debt):
        return HealthStatus.WARNING
    if any("conditions" in r.verdict.lower() for r in reviews):
        return HealthStatus.WARNING
    in_dev_specs = {s.filename.replace(".md", "") for s in specs if s.status == "In Development"}
    reviewed_specs = {r.filename.replace("-review.md", "") for r in reviews}
    if in_dev_specs and not in_dev_specs.intersection(reviewed_specs):
        return HealthStatus.WARNING
    return HealthStatus.HEALTHY


def _days_since(date_str: str) -> int:
    """Compute days since a date string (YYYY-MM-DD). Returns 0 on failure."""
    try:
        found = datetime.strptime(date_str[:10], "%Y-%m-%d").date()
        return (date.today() - found).days
    except (ValueError, TypeError):
        return 0


# ---------------------------------------------------------------------------
# Dashboard data aggregation
# ---------------------------------------------------------------------------


@dataclass
class DashboardData:
    """All parsed data needed to render the dashboard."""

    agents: List[AgentInfo]
    skills: List[SkillInfo]
    specs: List[SpecInfo]
    reviews: List[ReviewInfo]
    tech_debt: List[TechDebtItem]
    changelog: ChangelogSummary
    commits: List[GitCommit]
    memories: List[MemorySnippet]
    adrs: List[ADRRecord]
    comm_routes: List[CommRoute]
    health: HealthStatus
    project_name: str = ""
    next_actions: List[NextAction] = field(default_factory=list)


def _compute_next_actions(
    specs: List[SpecInfo],
    reviews: List[ReviewInfo],
    tech_debt: List[TechDebtItem],
) -> List[NextAction]:
    """Determine suggested next actions based on system state."""
    actions: List[NextAction] = []
    active_debt = [d for d in tech_debt if not d.is_resolved]

    # Check for reviews needing fixes
    changes_required = [r for r in reviews if "CHANGES REQUIRED" in r.verdict.upper()]
    if changes_required:
        names = ", ".join(r.filename for r in changes_required)
        actions.append(NextAction(
            agent="Dev",
            command="/review-findings",
            description="Fix review findings",
            details=f"Reviews requiring changes: {names}",
        ))

    # Check for reviews approved with conditions
    conditions_reviews = [r for r in reviews if "CONDITIONS" in r.verdict.upper()]
    if conditions_reviews:
        names = ", ".join(r.filename for r in conditions_reviews)
        actions.append(NextAction(
            agent="QA",
            command="/release-check",
            description="Verify review conditions are met",
            details=f"Reviews with conditions: {names}",
        ))

    # Check for critical/high tech debt
    urgent_debt = [d for d in active_debt if d.severity in ("Critical", "High")]
    if urgent_debt:
        ids = ", ".join(d.item_id for d in urgent_debt)
        actions.append(NextAction(
            agent="Dev",
            command="(manual)",
            description=f"Address {urgent_debt[0].severity.lower()} tech debt",
            details=f"Items: {ids}",
        ))

    # Specs in development without reviews
    in_dev = [s for s in specs if s.status == "In Development"]
    if in_dev and not reviews:
        names = ", ".join(s.title for s in in_dev)
        actions.append(NextAction(
            agent="QA",
            command="/security-audit",
            description="Run QA audit on in-development features",
            details=f"Features in development: {names}",
        ))

    # Approved specs not yet in development
    approved = [s for s in specs if s.status == "Approved"]
    if approved:
        names = ", ".join(s.title for s in approved)
        actions.append(NextAction(
            agent="Dev",
            command="/implement-feature",
            description="Implement approved features",
            details=f"Ready to build: {names}",
        ))

    # Draft specs to review
    drafts = [s for s in specs if s.status == "Draft"]
    if drafts:
        names = ", ".join(s.title for s in drafts)
        actions.append(NextAction(
            agent="PM",
            command="(review spec)",
            description="Review and finalize draft specs",
            details=f"Drafts: {names}",
        ))

    # No specs at all
    if not specs:
        actions.append(NextAction(
            agent="PM",
            command="/feature-spec",
            description="Define your first feature",
            details="Start the development cycle by creating a feature specification",
        ))

    # Periodic maintenance suggestions
    if not any(r.review_type == "code-health" for r in reviews):
        actions.append(NextAction(
            agent="QA",
            command="/code-health",
            description="Run a code health scan",
            details="Check for dead code, outdated dependencies, and code quality issues",
        ))

    # Everything done
    all_done = specs and all(s.status == "Done" for s in specs)
    all_approved = reviews and all("APPROVED" in r.verdict.upper() and "CONDITIONS" not in r.verdict.upper() for r in reviews)
    if all_done and all_approved and not urgent_debt:
        actions.clear()
        actions.append(NextAction(
            agent="PM",
            command="/feature-spec",
            description="All features complete",
            details="System idle. Define a new feature to start the next cycle.",
        ))

    return actions


def collect_data() -> DashboardData:
    """Parse all project files and assemble dashboard data."""
    agents = parse_agents()
    specs = parse_specs()
    reviews = parse_reviews()
    tech_debt = parse_tech_debt()
    return DashboardData(
        agents=agents,
        skills=parse_skills(),
        specs=specs,
        reviews=reviews,
        tech_debt=tech_debt,
        changelog=parse_changelog(),
        commits=parse_git_log(),
        memories=parse_memory_snippets(),
        adrs=parse_adrs(),
        comm_routes=parse_comm_schedule(),
        health=compute_health(tech_debt, reviews, specs),
        project_name=PROJECT_ROOT.name,
        next_actions=_compute_next_actions(specs, reviews, tech_debt),
    )


# ---------------------------------------------------------------------------
# Terminal renderer (rich)
# ---------------------------------------------------------------------------

RICH_AGENT_STYLES: Dict[str, str] = {
    "prometeo-pm": "bold yellow",
    "forja-dev": "bold blue",
    "centinela-qa": "bold green",
}

RICH_SEVERITY_STYLES: Dict[str, str] = {
    "Critical": "bold red",
    "High": "yellow",
    "Medium": "blue",
    "Low": "dim",
}


def _term_header(console: object, data: DashboardData) -> None:
    """Render the title banner with system health indicator."""
    from rich.panel import Panel
    from rich.text import Text

    health_style = {"HEALTHY": "green", "WARNING": "yellow", "CRITICAL": "bold red"}[data.health.value]
    term_title = f"{data.project_name} — Agent Triforce" if data.project_name else "Agent Triforce Dashboard"
    title_text = Text.assemble(
        (term_title, "bold white"),
        ("  |  System: ", "dim"),
    )
    console.print(
        Panel(
            title_text + Text(data.health.value, style=health_style),
            border_style="bright_blue",
            padding=(0, 2),
        )
    )


def _term_stats(console: object, data: DashboardData) -> None:
    """Render the stats summary bar."""
    from rich.panel import Panel
    from rich.text import Text

    total_checklists = sum(len(a.checklists) for a in data.agents)
    total_items = sum(c.item_count for a in data.agents for c in a.checklists)
    active_debt_count = sum(1 for d in data.tech_debt if not d.is_resolved)
    stats_text = Text()
    stats_parts = [
        ("Specs", str(len(data.specs))),
        ("Reviews", str(len(data.reviews))),
        ("Active Debt", str(active_debt_count)),
        ("ADRs", str(len(data.adrs))),
        ("Checklists", f"{total_checklists} ({total_items} items)"),
        ("Commits", str(len(data.commits))),
    ]
    for i, (label, val) in enumerate(stats_parts):
        stats_text.append(f"{label}: ", style="dim")
        stats_text.append(val, style="bold white")
        if i < len(stats_parts) - 1:
            stats_text.append("  |  ", style="dim")
    console.print(Panel(stats_text, border_style="dim", padding=(0, 1)))


def _term_quick_actions(console: object, data: DashboardData) -> None:
    """Render the quick actions command bar."""
    from rich.panel import Panel
    from rich.text import Text

    actions_text = Text()
    actions_text.append("Available commands: ", style="dim")
    cmds = [
        ("/feature-spec", "yellow"),
        ("/implement-feature", "blue"),
        ("/review-findings", "blue"),
        ("/security-audit", "green"),
        ("/code-health", "green"),
        ("/release-check", "green"),
    ]
    for i, (cmd, color) in enumerate(cmds):
        actions_text.append(cmd, style=f"bold {color}")
        if i < len(cmds) - 1:
            actions_text.append("  ", style="dim")
    console.print(Panel(actions_text, border_style="dim", padding=(0, 1)))


def _term_whats_next(console: object, data: DashboardData) -> None:
    """Render the What's Next panel if there are pending actions."""
    from rich.panel import Panel

    if not data.next_actions:
        return
    next_lines: List[str] = []
    agent_styles = {"PM": "yellow", "Dev": "blue", "QA": "green"}
    for i, action in enumerate(data.next_actions, 1):
        style = agent_styles.get(action.agent, "white")
        cmd_str = f" [bold]{action.command}[/]" if action.command != "(manual)" and action.command != "(review spec)" else ""
        next_lines.append(f"  [{style}]{action.agent}[/] {action.description}{cmd_str}")
        if action.details:
            next_lines.append(f"      [dim]{action.details}[/]")
    console.print(Panel("\n".join(next_lines), title="[bold]What's Next[/]", border_style="cyan"))


def _term_system_overview(console: object, data: DashboardData) -> None:
    """Render agent cards in the System Overview section."""
    from rich.columns import Columns
    from rich.panel import Panel

    agent_panels: List[Panel] = []
    for agent in data.agents:
        style = RICH_AGENT_STYLES.get(agent.name, "white")
        display = AGENT_DISPLAY_NAMES.get(agent.name, agent.name)
        do_confirm = sum(1 for c in agent.checklists if c.checklist_type == "DO-CONFIRM")
        read_do = sum(1 for c in agent.checklists if c.checklist_type == "READ-DO")
        total_items = sum(c.item_count for c in agent.checklists)
        lines = [
            f"[dim]Model:[/] {agent.model}",
            f"[dim]Mode:[/]  {agent.permission_mode}",
            f"[dim]Tools:[/] {', '.join(agent.tools) if agent.tools else 'inherited'}",
            f"[dim]Skills:[/] {', '.join(agent.skills)}",
            f"[dim]Checklists:[/] {len(agent.checklists)} ({do_confirm} DO-CONFIRM, {read_do} READ-DO)",
            f"[dim]Items:[/] {total_items}",
        ]
        agent_panels.append(
            Panel("\n".join(lines), title=f"[{style}]{display}[/]", border_style=style, width=38)
        )
    console.print(Panel(Columns(agent_panels, equal=True, expand=True), title="[bold]System Overview[/]"))


def _term_feature_pipeline(console: object, data: DashboardData) -> None:
    """Render the feature pipeline Kanban table."""
    from rich.panel import Panel
    from rich.table import Table

    pipeline_table = Table(show_header=True, header_style="bold", expand=True)
    for stage in PIPELINE_STAGES:
        pipeline_table.add_column(stage, justify="center")
    row: List[str] = []
    for stage in PIPELINE_STAGES:
        items = [s for s in data.specs if s.status == stage]
        if items:
            cell = "\n".join(f"[dim]{s.priority}[/]{f' ({s.tier})' if s.tier else ''}{f' [blue]{s.ac_count} AC[/]' if s.ac_count else ''} {s.title}" for s in items)
        else:
            cell = "[dim]--[/]"
        row.append(cell)
    pipeline_table.add_row(*row)
    pipeline_subtitle = "[dim]Features flow Draft -> Done. Start with /feature-spec[/]" if not data.specs else None
    console.print(Panel(pipeline_table, title="[bold]Feature Pipeline[/]", subtitle=pipeline_subtitle))


def _term_quality_gate(console: object, data: DashboardData) -> None:
    """Render the Quality Gate review table."""
    from rich.panel import Panel
    from rich.table import Table

    if data.reviews:
        review_table = Table(show_header=True, header_style="bold", expand=True)
        review_table.add_column("Review")
        review_table.add_column("Type")
        review_table.add_column("Verdict")
        review_table.add_column("Critical", justify="center")
        review_table.add_column("Warning", justify="center")
        review_table.add_column("Suggestion", justify="center")
        for r in data.reviews:
            verdict_style = "green" if "approved" == r.verdict.lower() else "yellow" if "conditions" in r.verdict.lower() else "red"
            review_table.add_row(
                r.filename,
                r.review_type,
                f"[{verdict_style}]{r.verdict}[/]",
                f"[red]{r.critical_count}[/]" if r.critical_count else "0",
                f"[yellow]{r.warning_count}[/]" if r.warning_count else "0",
                f"[blue]{r.suggestion_count}[/]" if r.suggestion_count else "0",
            )
        console.print(Panel(review_table, title="[bold]Quality Gate[/]"))
    else:
        console.print(
            Panel(
                "[dim]Reviews appear here after QA audits.\n"
                "Run /security-audit after implementing a feature, or /code-health for a codebase scan.[/]",
                title="[bold]Quality Gate[/]",
            )
        )


def _term_tech_debt(console: object, data: DashboardData) -> None:
    """Render the Tech Debt Register table."""
    from rich.panel import Panel
    from rich.table import Table

    active_debt = [d for d in data.tech_debt if not d.is_resolved]
    if active_debt:
        debt_table = Table(show_header=True, header_style="bold", expand=True)
        debt_table.add_column("ID")
        debt_table.add_column("Title")
        debt_table.add_column("Type")
        debt_table.add_column("Severity")
        debt_table.add_column("Age (days)", justify="right")
        debt_table.add_column("Effort")
        for d in active_debt:
            sev_style = RICH_SEVERITY_STYLES.get(d.severity, "white")
            age = _days_since(d.found_date)
            debt_table.add_row(
                d.item_id,
                d.title,
                d.debt_type,
                f"[{sev_style}]{d.severity}[/]",
                str(age),
                d.effort,
            )
        console.print(Panel(debt_table, title="[bold]Tech Debt Register[/]"))
    else:
        console.print(
            Panel(
                "[dim]No active technical debt.\n"
                "Items appear here when Dev or QA discover debt during implementation or review.[/]",
                title="[bold]Tech Debt Register[/]",
            )
        )


def _term_workflow(console: object, data: DashboardData) -> None:
    """Render the Workflow Status tree with active stage indicator."""
    from rich.panel import Panel
    from rich.tree import Tree

    active_agent = data.next_actions[0].agent if data.next_actions else None
    pm_marker = " [bold cyan]<-- active[/]" if active_agent == "PM" else ""
    dev_marker = " [bold cyan]<-- active[/]" if active_agent == "Dev" else ""
    qa_marker = " [bold cyan]<-- active[/]" if active_agent == "QA" else ""
    workflow_tree = Tree("[bold]Workflow Flows[/]")
    feature_flow = workflow_tree.add("[bold]Standard Feature Flow[/]")
    feature_flow.add(f"[yellow]PM[/]  SIGN IN -> spec -> TIME OUT -> SIGN OUT{pm_marker}")
    feature_flow.add(f"[blue]Dev[/] SIGN IN -> implement -> TIME OUT x2 -> SIGN OUT{dev_marker}")
    feature_flow.add(f"[green]QA[/]  SIGN IN -> audit -> TIME OUT -> SIGN OUT{qa_marker}")
    feature_flow.add(f"[blue]Dev[/] SIGN IN -> fix -> TIME OUT x2 -> SIGN OUT")
    feature_flow.add(f"[green]QA[/]  SIGN IN -> re-verify -> SIGN OUT")
    health_flow = workflow_tree.add("[bold]Code Health Flow[/]")
    health_flow.add("[green]QA[/]  SIGN IN -> scan -> TIME OUT -> SIGN OUT")
    health_flow.add("[blue]Dev[/] SIGN IN -> cleanup -> TIME OUT -> SIGN OUT")
    health_flow.add("[green]QA[/]  SIGN IN -> verify -> SIGN OUT")
    console.print(Panel(workflow_tree, title="[bold]Workflow Status[/]"))


def _term_comm_schedule(console: object, data: DashboardData) -> None:
    """Render the Communication Schedule table."""
    from rich.panel import Panel
    from rich.table import Table

    if not data.comm_routes:
        return
    comm_table = Table(show_header=True, header_style="bold", expand=True)
    comm_table.add_column("From")
    comm_table.add_column("To")
    comm_table.add_column("When")
    comm_table.add_column("What")
    for route in data.comm_routes:
        from_style = "yellow" if "Prometeo" in route.from_agent else "blue" if "Forja" in route.from_agent else "green" if "Centinela" in route.from_agent else "white"
        to_style = "yellow" if "Prometeo" in route.to_agent else "blue" if "Forja" in route.to_agent else "green" if "Centinela" in route.to_agent else "white"
        comm_table.add_row(
            f"[{from_style}]{route.from_agent}[/]",
            f"[{to_style}]{route.to_agent}[/]",
            route.when,
            route.what,
        )
    console.print(Panel(comm_table, title="[bold]Communication Schedule[/]"))


def _term_adrs(console: object, data: DashboardData) -> None:
    """Render the Architecture Decisions table."""
    from rich.panel import Panel
    from rich.table import Table

    if not data.adrs:
        return
    adr_table = Table(show_header=True, header_style="bold", expand=True)
    adr_table.add_column("ADR")
    adr_table.add_column("Title")
    adr_table.add_column("Status")
    adr_table.add_column("Date")
    for adr in data.adrs:
        status_style = "green" if adr.status == "Accepted" else "yellow" if adr.status == "Proposed" else "dim"
        adr_table.add_row(
            f"ADR-{adr.number}",
            adr.title,
            f"[{status_style}]{adr.status}[/]",
            adr.adr_date,
        )
    console.print(Panel(adr_table, title="[bold]Architecture Decisions[/]"))


def _term_recent_activity(console: object, data: DashboardData) -> None:
    """Render the Recent Activity panel with commits, changelog, and memory."""
    from rich.panel import Panel

    activity_lines: List[str] = []
    if data.commits:
        for c in data.commits:
            badge_style = {"feat": "green", "fix": "red", "docs": "blue", "refactor": "magenta", "test": "yellow", "chore": "dim"}.get(c.commit_type, "white")
            activity_lines.append(
                f"[dim]{c.short_hash}[/] [{badge_style}]{c.commit_type:8}[/] {c.message[:60]}  [dim]{c.timestamp}[/]"
            )
    else:
        activity_lines.append("[dim]No git history available[/]")
    if data.changelog.categories:
        activity_lines.append("")
        activity_lines.append("[bold]Changelog (Unreleased):[/]")
        for cat, count in data.changelog.categories.items():
            activity_lines.append(f"  {cat}: {count} item{'s' if count != 1 else ''}")
    if data.memories:
        activity_lines.append("")
        activity_lines.append("[bold]Agent Memory Snippets:[/]")
        for mem in data.memories:
            display = AGENT_DISPLAY_NAMES.get(mem.agent_name, mem.agent_name)
            preview = mem.preview[:80].replace("\n", " ")
            activity_lines.append(f"  [dim]{display}:[/] {preview}")
    console.print(Panel("\n".join(activity_lines), title="[bold]Recent Activity[/]"))


def _term_checklist_inventory(console: object, data: DashboardData) -> None:
    """Render the Checklist Inventory with summary table and per-agent breakdown."""
    from rich.columns import Columns
    from rich.panel import Panel
    from rich.table import Table

    checklist_table = Table(show_header=True, header_style="bold", expand=True)
    checklist_table.add_column("Agent")
    checklist_table.add_column("DO-CONFIRM", justify="center")
    checklist_table.add_column("READ-DO", justify="center")
    checklist_table.add_column("Total Items", justify="center")
    for agent in data.agents:
        style = RICH_AGENT_STYLES.get(agent.name, "white")
        display = AGENT_DISPLAY_NAMES.get(agent.name, agent.name)
        do_c = sum(1 for c in agent.checklists if c.checklist_type == "DO-CONFIRM")
        rd = sum(1 for c in agent.checklists if c.checklist_type == "READ-DO")
        total = sum(c.item_count for c in agent.checklists)
        checklist_table.add_row(f"[{style}]{display}[/]", str(do_c), str(rd), str(total))
    # Totals row
    all_do = sum(
        1 for a in data.agents for c in a.checklists if c.checklist_type == "DO-CONFIRM"
    )
    all_rd = sum(
        1 for a in data.agents for c in a.checklists if c.checklist_type == "READ-DO"
    )
    all_items = sum(c.item_count for a in data.agents for c in a.checklists)
    checklist_table.add_row("[bold]Total[/]", f"[bold]{all_do}[/]", f"[bold]{all_rd}[/]", f"[bold]{all_items}[/]")
    # Per-agent breakdown
    breakdown_lines: List[str] = []
    for agent in data.agents:
        style = RICH_AGENT_STYLES.get(agent.name, "white")
        display = AGENT_DISPLAY_NAMES.get(agent.name, agent.name)
        breakdown_lines.append(f"[{style}]{display}[/]")
        for cl in agent.checklists:
            breakdown_lines.append(f"  ({cl.checklist_type}) {cl.name} -- {cl.item_count} items")
    detail_panel = Panel("\n".join(breakdown_lines), title="Per-Agent Breakdown", border_style="dim")
    console.print(
        Panel(
            Columns([checklist_table, detail_panel], expand=True),
            title="[bold]Checklist Inventory[/]",
        )
    )


def render_terminal(data: DashboardData) -> None:
    """Render dashboard to terminal using rich."""
    try:
        from rich.console import Console
    except ImportError:
        print(
            "Error: The 'rich' library is required for terminal mode.\n"
            "Install it with: pip install rich\n"
            "Or use --html mode for zero-dependency HTML output.",
            file=sys.stderr,
        )
        sys.exit(1)

    console = Console()
    console.print()
    _term_header(console, data)
    _term_stats(console, data)
    _term_quick_actions(console, data)
    _term_whats_next(console, data)
    _term_system_overview(console, data)
    _term_feature_pipeline(console, data)
    _term_quality_gate(console, data)
    _term_tech_debt(console, data)
    _term_workflow(console, data)
    _term_comm_schedule(console, data)
    _term_adrs(console, data)
    _term_recent_activity(console, data)
    _term_checklist_inventory(console, data)
    console.print()


# ---------------------------------------------------------------------------
# HTML renderer
# ---------------------------------------------------------------------------


def _esc(text: str) -> str:
    """HTML-escape a string."""
    return html_mod.escape(str(text))


def _health_color(status: HealthStatus) -> str:
    """Return hex color for health status."""
    return {
        HealthStatus.HEALTHY: COLOR_HEALTHY_HEX,
        HealthStatus.WARNING: COLOR_WARNING_HEX,
        HealthStatus.CRITICAL: COLOR_CRITICAL_HEX,
    }[status]


def render_html(data: DashboardData, output_path: Path) -> Path:
    """Render dashboard as a self-contained HTML file."""
    h = _HtmlBuilder()
    h.open_page(data.health, data.project_name)
    h.section_header_and_nav(data)
    h.section_whats_next(data)
    h.section_system_overview(data)
    h.section_feature_pipeline(data)
    h.section_quality_gate(data)
    h.section_tech_debt(data)
    h.section_workflow(data)
    h.section_comm_schedule(data)
    h.section_adrs(data)
    h.section_recent_activity(data)
    h.section_checklist_inventory(data)
    h.close_page()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(h.html, encoding="utf-8")
    return output_path


class _HtmlBuilder:
    """Assembles the self-contained HTML dashboard."""

    def __init__(self) -> None:
        self.html = ""

    def _w(self, text: str) -> None:
        self.html += text + "\n"

    # -- Page shell ---------------------------------------------------------

    def open_page(self, health: HealthStatus, project_name: str = "") -> None:
        health_color = _health_color(health)
        page_title = f"{project_name} — Agent Triforce" if project_name else "Agent Triforce Dashboard"
        self._w(f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{page_title}</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🔱</text></svg>">
<style>
:root {{
  --bg: {COLOR_BG_HEX};
  --surface: {COLOR_SURFACE_HEX};
  --border: #334155;
  --text: #e2e8f0;
  --text-dim: #94a3b8;
  --prometeo: {COLOR_PROMETEO_HEX};
  --forja: {COLOR_FORJA_HEX};
  --centinela: {COLOR_CENTINELA_HEX};
  --critical: {COLOR_CRITICAL_HEX};
  --warning: {COLOR_WARNING_HEX};
  --suggestion: {COLOR_SUGGESTION_HEX};
  --low: {COLOR_LOW_HEX};
  --healthy: {COLOR_HEALTHY_HEX};
  --radius: 8px;
}}
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
html {{ scroll-behavior: smooth; scroll-padding-top: 56px; }}
body {{
  background: var(--bg);
  color: var(--text);
  font-family: "SF Mono", "Fira Code", "JetBrains Mono", "Cascadia Code", "Consolas", monospace;
  font-size: 14px;
  line-height: 1.6;
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}}
h1 {{
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 4px;
}}
h2 {{
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}}
h3 {{
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}}
.header {{
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 24px;
}}
.health-badge {{
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.5px;
  color: var(--bg);
  background: {health_color};
}}
.section {{
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px 24px;
  margin-bottom: 20px;
}}
.grid-3 {{
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}}
.agent-card {{
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  border-top: 3px solid var(--border);
}}
.agent-card.prometeo {{ border-top-color: var(--prometeo); }}
.agent-card.forja {{ border-top-color: var(--forja); }}
.agent-card.centinela {{ border-top-color: var(--centinela); }}
.agent-card h3 {{ margin-bottom: 12px; }}
.agent-card .label {{ color: var(--text-dim); font-size: 12px; }}
.agent-card .value {{ margin-bottom: 6px; }}
.kanban {{
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}}
.kanban-col {{
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  min-height: 80px;
}}
.kanban-col h4 {{
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
  text-align: center;
}}
.kanban-item {{
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 8px;
  margin-bottom: 6px;
  font-size: 12px;
}}
.kanban-item .priority {{
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
  display: inline-block;
  margin-bottom: 4px;
}}
table {{
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}}
th {{
  text-align: left;
  padding: 8px 12px;
  border-bottom: 2px solid var(--border);
  color: var(--text-dim);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}}
td {{
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}}
tr:last-child td {{ border-bottom: none; }}
.sev-critical {{ color: var(--critical); font-weight: 700; }}
.sev-high {{ color: var(--warning); }}
.sev-medium {{ color: var(--suggestion); }}
.sev-low {{ color: var(--low); }}
.verdict-approved {{ color: var(--healthy); font-weight: 600; }}
.verdict-conditions {{ color: var(--warning); font-weight: 600; }}
.verdict-changes {{ color: var(--critical); font-weight: 600; }}
.empty {{ color: var(--text-dim); font-style: italic; padding: 20px 0; text-align: center; }}
.workflow {{
  display: flex;
  flex-direction: column;
  gap: 12px;
}}
.workflow-row {{
  display: flex;
  align-items: center;
  gap: 0;
}}
.workflow-label {{
  font-weight: 600;
  font-size: 12px;
  min-width: 50px;
  padding-right: 8px;
}}
.workflow-step {{
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px 12px;
  font-size: 12px;
  white-space: nowrap;
}}
.workflow-arrow {{
  color: var(--text-dim);
  padding: 0 4px;
  font-size: 14px;
}}
.commit-line {{
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
  font-size: 13px;
}}
.commit-hash {{
  color: var(--text-dim);
  font-size: 12px;
  min-width: 60px;
}}
.commit-badge {{
  display: inline-block;
  padding: 1px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
  min-width: 65px;
  text-align: center;
  color: var(--bg);
}}
.commit-msg {{ flex: 1; }}
.commit-date {{ color: var(--text-dim); font-size: 12px; min-width: 90px; text-align: right; }}
.memory-block {{
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 8px;
  font-size: 12px;
  white-space: pre-wrap;
  max-height: 120px;
  overflow-y: auto;
}}
.subtitle {{ color: var(--text-dim); font-size: 12px; margin-bottom: 12px; }}
.totals-row {{ font-weight: 700; }}
.cl-breakdown {{
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}}
.cl-agent-block {{
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
}}
.cl-agent-block h4 {{
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}}
.cl-item {{
  font-size: 12px;
  color: var(--text-dim);
  padding: 2px 0;
}}
.cl-type {{
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 3px;
  display: inline-block;
}}
.cl-do {{ background: rgba(59,130,246,0.2); color: var(--forja); }}
.cl-rd {{ background: rgba(245,158,11,0.2); color: var(--prometeo); }}
.changelog-cats {{
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 8px;
}}
.changelog-cat {{
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 12px;
}}
.flow-title {{
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 8px;
  margin-top: 16px;
}}
.flow-title:first-child {{ margin-top: 0; }}
.priority-p0 {{ background: var(--critical); color: white; }}
.priority-p1 {{ background: var(--warning); color: var(--bg); }}
.priority-p2 {{ background: var(--suggestion); color: white; }}
.priority-p3 {{ background: var(--low); color: var(--bg); }}
.gen-time {{
  text-align: center;
  color: var(--text-dim);
  font-size: 11px;
  padding: 16px 0 8px;
}}
.nav {{
  display: flex;
  gap: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 20px;
  position: sticky;
  top: 0;
  z-index: 100;
  overflow-x: auto;
}}
.nav a {{
  color: var(--text-dim);
  text-decoration: none;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 600;
  border-right: 1px solid var(--border);
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
}}
.nav a:last-child {{ border-right: none; }}
.nav a:hover {{ background: rgba(255,255,255,0.05); color: var(--text); }}
.quick-actions {{
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}}
.quick-action {{
  display: inline-block;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.03);
  cursor: default;
}}
.quick-action.pm {{ color: var(--prometeo); border-color: rgba(245,158,11,0.3); }}
.quick-action.dev {{ color: var(--forja); border-color: rgba(59,130,246,0.3); }}
.quick-action.qa {{ color: var(--centinela); border-color: rgba(16,185,129,0.3); }}
.next-section {{
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 3px solid #06b6d4;
  border-radius: var(--radius);
  padding: 20px 24px;
  margin-bottom: 20px;
}}
.next-action {{
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}}
.next-action:last-child {{ border-bottom: none; }}
.next-agent {{
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  min-width: 36px;
  text-align: center;
  color: var(--bg);
  flex-shrink: 0;
}}
.next-agent.pm {{ background: var(--prometeo); }}
.next-agent.dev {{ background: var(--forja); }}
.next-agent.qa {{ background: var(--centinela); }}
.next-desc {{ font-size: 13px; }}
.next-detail {{ font-size: 12px; color: var(--text-dim); margin-top: 2px; }}
.next-cmd {{ font-weight: 700; }}
.empty-guide {{
  color: var(--text-dim);
  text-align: center;
  padding: 16px 0;
  font-size: 13px;
  line-height: 1.8;
}}
.empty-guide code {{
  background: rgba(255,255,255,0.08);
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 600;
  color: var(--text);
}}
.stats-bar {{
  display: flex;
  gap: 0;
  flex-wrap: wrap;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 20px;
}}
.stat-item {{
  padding: 10px 20px;
  border-right: 1px solid var(--border);
  text-align: center;
  flex: 1;
  min-width: 100px;
}}
.stat-item:last-child {{ border-right: none; }}
.stat-value {{
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.2;
}}
.stat-label {{
  font-size: 11px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}}
.comm-from {{ font-weight: 600; }}
.comm-arrow {{ color: var(--text-dim); padding: 0 8px; }}
.comm-to {{ font-weight: 600; }}
.adr-status-accepted {{ color: var(--healthy); font-weight: 600; }}
.adr-status-proposed {{ color: var(--warning); font-weight: 600; }}
.adr-status-deprecated {{ color: var(--text-dim); font-weight: 600; }}
.workflow-step.active {{
  background: rgba(6,182,212,0.15);
  border-color: #06b6d4 !important;
  color: #06b6d4;
  font-weight: 700;
  box-shadow: 0 0 8px rgba(6,182,212,0.3);
}}
@media (max-width: 900px) {{
  .grid-3 {{ grid-template-columns: 1fr; }}
  .kanban {{ grid-template-columns: repeat(2, 1fr); }}
  .cl-breakdown {{ grid-template-columns: 1fr; }}
  .stats-bar {{ flex-wrap: wrap; }}
  .stat-item {{ min-width: 33%; border-bottom: 1px solid var(--border); }}
  .workflow-row {{ flex-wrap: wrap; gap: 4px; }}
  .nav {{ flex-wrap: wrap; }}
}}
@media (max-width: 600px) {{
  body {{ padding: 12px; }}
  .kanban {{ grid-template-columns: 1fr; }}
  .header {{ flex-direction: column; gap: 12px; }}
  .stat-item {{ min-width: 50%; }}
}}
</style>
</head>
<body>""")

    def close_page(self) -> None:
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self._w(f'<div class="gen-time">Generated {_esc(ts)} by tools/dashboard.py</div>')
        self._w("</body>\n</html>")

    # -- Sections -----------------------------------------------------------

    def section_header_and_nav(self, data: DashboardData) -> None:
        """Render header with health badge, quick actions, and sticky nav."""
        header_title = f"{data.project_name} — Agent Triforce" if data.project_name else "Agent Triforce Dashboard"
        self._w(f"""<div class="header">
  <div>
    <h1>{header_title}</h1>
    <div class="quick-actions">
      <span class="quick-action pm" title="Define a feature spec (Prometeo)">/feature-spec</span>
      <span class="quick-action dev" title="Implement from spec (Forja)">/implement-feature</span>
      <span class="quick-action dev" title="Fix QA findings (Forja)">/review-findings</span>
      <span class="quick-action qa" title="OWASP security audit (Centinela)">/security-audit</span>
      <span class="quick-action qa" title="Dead code and hygiene scan (Centinela)">/code-health</span>
      <span class="quick-action qa" title="Pre-release verification (Centinela)">/release-check</span>
    </div>
  </div>
  <span class="health-badge">{data.health.value}</span>
</div>""")
        # Stats summary bar
        total_checklists = sum(len(a.checklists) for a in data.agents)
        total_items = sum(c.item_count for a in data.agents for c in a.checklists)
        active_debt_count = sum(1 for d in data.tech_debt if not d.is_resolved)
        next_summary = ""
        if data.next_actions:
            na = data.next_actions[0]
            next_summary = f'<div class="stat-item" style="border-left:2px solid #60a5fa;padding-left:12px"><div class="stat-value" style="font-size:13px;color:#60a5fa">{_esc(na.agent)} {_esc(na.command)}</div><div class="stat-label">Next Step</div></div>'
        self._w(f"""<div class="stats-bar">
  <div class="stat-item"><div class="stat-value">{len(data.specs)}</div><div class="stat-label">Specs</div></div>
  <div class="stat-item"><div class="stat-value">{len(data.reviews)}</div><div class="stat-label">Reviews</div></div>
  <div class="stat-item"><div class="stat-value">{active_debt_count}</div><div class="stat-label">Active Debt</div></div>
  <div class="stat-item"><div class="stat-value">{len(data.adrs)}</div><div class="stat-label">ADRs</div></div>
  <div class="stat-item"><div class="stat-value">{total_checklists}<span style="font-size:12px;font-weight:400;color:var(--text-dim)"> ({total_items})</span></div><div class="stat-label">Checklists (items)</div></div>
  <div class="stat-item"><div class="stat-value">{len(data.commits)}</div><div class="stat-label">Commits</div></div>
  {next_summary}
</div>""")

        self._w("""<nav class="nav">
  <a href="#whats-next">Recommended Next Steps</a>
  <a href="#overview">Overview</a>
  <a href="#pipeline">Pipeline</a>
  <a href="#quality">Quality</a>
  <a href="#debt">Debt</a>
  <a href="#workflow">Workflow</a>
  <a href="#comms">Comms</a>
  <a href="#adrs">ADRs</a>
  <a href="#activity">Activity</a>
  <a href="#checklists">Checklists</a>
</nav>""")

    def section_whats_next(self, data: DashboardData) -> None:
        """Render the What's Next section with suggested actions."""
        self._w('<div class="next-section" id="whats-next"><h2>Recommended Next Steps</h2>')
        if not data.next_actions:
            self._w('<div class="empty-guide">No pending actions. The system is idle.</div>')
        else:
            agent_css = {"PM": "pm", "Dev": "dev", "QA": "qa"}
            for action in data.next_actions:
                css = agent_css.get(action.agent, "dev")
                cmd_html = f' <span class="next-cmd">{_esc(action.command)}</span>' if action.command not in ("(manual)", "(review spec)") else ""
                detail_html = f'<div class="next-detail">{_esc(action.details)}</div>' if action.details else ""
                self._w(f"""<div class="next-action">
  <span class="next-agent {css}">{_esc(action.agent)}</span>
  <div><div class="next-desc">{_esc(action.description)}{cmd_html}</div>{detail_html}</div>
</div>""")
        self._w("</div>")

    def section_system_overview(self, data: DashboardData) -> None:
        self._w('<div class="section" id="overview"><h2>System Overview</h2><div class="grid-3">')
        agent_css = {"prometeo-pm": "prometeo", "forja-dev": "forja", "centinela-qa": "centinela"}
        for agent in data.agents:
            css = agent_css.get(agent.name, "")
            display = _esc(AGENT_DISPLAY_NAMES.get(agent.name, agent.name))
            color = AGENT_COLORS.get(agent.name, "#fff")
            do_c = sum(1 for c in agent.checklists if c.checklist_type == "DO-CONFIRM")
            rd = sum(1 for c in agent.checklists if c.checklist_type == "READ-DO")
            total = sum(c.item_count for c in agent.checklists)
            tools_str = _esc(", ".join(agent.tools)) if agent.tools else "inherited"
            skills_str = _esc(", ".join(agent.skills))
            self._w(f"""<div class="agent-card {css}">
  <h3 style="color:{color}">{display}</h3>
  <div class="value"><span class="label">Model:</span> {_esc(agent.model)}</div>
  <div class="value"><span class="label">Mode:</span> {_esc(agent.permission_mode)}</div>
  <div class="value"><span class="label">Tools:</span> {tools_str}</div>
  <div class="value"><span class="label">Skills:</span> {skills_str}</div>
  <div class="value"><span class="label">Checklists:</span> {len(agent.checklists)} ({do_c} DO-CONFIRM, {rd} READ-DO)</div>
  <div class="value"><span class="label">Total items:</span> {total}</div>
</div>""")
        self._w("</div></div>")

    def section_feature_pipeline(self, data: DashboardData) -> None:
        self._w('<div class="section" id="pipeline"><h2>Feature Pipeline</h2>')
        self._w('<div class="kanban">')
        for stage in PIPELINE_STAGES:
            items = [s for s in data.specs if s.status == stage]
            self._w(f'<div class="kanban-col"><h4>{_esc(stage)}</h4>')
            if items:
                for s in items:
                    pri_css = _priority_css(s.priority)
                    tier_badge = f' <span style="color:#94a3b8;font-size:10px;font-weight:bold">({s.tier})</span>' if s.tier else ""
                    ac_badge = f' <span style="color:#60a5fa;font-size:10px;font-weight:bold">{s.ac_count} AC</span>' if s.ac_count else ""
                    self._w(f'<div class="kanban-item"><span class="priority {pri_css}">{_esc(s.priority)}</span>{tier_badge}{ac_badge}<br>{_esc(s.title)}</div>')
            else:
                self._w('<div style="color:var(--text-dim);font-size:12px;text-align:center">--</div>')
            self._w("</div>")
        self._w("</div>")
        if not data.specs:
            self._w('<div class="empty-guide">Features flow left to right as they progress.<br>Run <code>/feature-spec [description]</code> with Prometeo to define your first feature.</div>')
        self._w("</div>")

    def section_quality_gate(self, data: DashboardData) -> None:
        self._w('<div class="section" id="quality"><h2>Quality Gate</h2>')
        if not data.reviews:
            self._w('<div class="empty-guide">Reviews appear here after QA audits.<br>Run <code>/security-audit</code> with Centinela after implementing a feature,<br>or <code>/code-health</code> for a codebase scan.</div>')
        else:
            self._w("<table><tr><th>Review</th><th>Type</th><th>Verdict</th><th>Critical</th><th>Warning</th><th>Suggestion</th></tr>")
            for r in data.reviews:
                verdict_css = _verdict_css(r.verdict)
                self._w(f"""<tr>
  <td>{_esc(r.filename)}</td>
  <td>{_esc(r.review_type)}</td>
  <td class="{verdict_css}">{_esc(r.verdict)}</td>
  <td class="sev-critical">{r.critical_count}</td>
  <td class="sev-high">{r.warning_count}</td>
  <td class="sev-medium">{r.suggestion_count}</td>
</tr>""")
            self._w("</table>")
        self._w("</div>")

    def section_tech_debt(self, data: DashboardData) -> None:
        active = [d for d in data.tech_debt if not d.is_resolved]
        self._w('<div class="section" id="debt"><h2>Tech Debt Register</h2>')
        if not active:
            self._w('<div class="empty-guide">No active technical debt.<br>Items appear here when Dev (Forja) or QA (Centinela) discover debt during implementation or review.</div>')
        else:
            self._w("<table><tr><th>ID</th><th>Title</th><th>Type</th><th>Severity</th><th>Age (days)</th><th>Effort</th></tr>")
            for d in active:
                sev_css = _severity_css(d.severity)
                age = _days_since(d.found_date)
                self._w(f"""<tr>
  <td>{_esc(d.item_id)}</td>
  <td>{_esc(d.title[:60])}</td>
  <td>{_esc(d.debt_type)}</td>
  <td class="{sev_css}">{_esc(d.severity)}</td>
  <td>{age}</td>
  <td>{_esc(d.effort)}</td>
</tr>""")
            self._w("</table>")
        self._w("</div>")

    def section_workflow(self, data: DashboardData) -> None:
        # Determine active stage from next_actions
        active_agent = data.next_actions[0].agent if data.next_actions else None
        # Map active agent to the first matching row index in feature flow
        active_row_idx = {"PM": 0, "Dev": 1, "QA": 2}.get(active_agent, -1) if active_agent else -1

        self._w('<div class="section" id="workflow"><h2>Workflow Status</h2>')
        self._w('<div class="flow-title">Standard Feature Flow</div>')
        self._w('<div class="workflow">')
        _feature_steps = [
            ("PM", "prometeo", ["SIGN IN", "spec", "TIME OUT", "SIGN OUT"]),
            ("Dev", "forja", ["SIGN IN", "implement", "TIME OUT x2", "SIGN OUT"]),
            ("QA", "centinela", ["SIGN IN", "audit", "TIME OUT", "SIGN OUT"]),
            ("Dev", "forja", ["SIGN IN", "fix", "TIME OUT x2", "SIGN OUT"]),
            ("QA", "centinela", ["SIGN IN", "re-verify", "SIGN OUT"]),
        ]
        for row_idx, (label, agent_css, steps) in enumerate(_feature_steps):
            color = AGENT_COLORS.get(f"{agent_css}-{'pm' if agent_css == 'prometeo' else 'dev' if agent_css == 'forja' else 'qa'}", "#fff")
            is_active_row = row_idx == active_row_idx
            self._w(f'<div class="workflow-row"><span class="workflow-label" style="color:{color}">{label}</span>')
            for i, step in enumerate(steps):
                border_color = color if step.startswith(("SIGN", "TIME")) else "var(--border)"
                active_cls = " active" if is_active_row and step not in ("SIGN IN", "SIGN OUT") else ""
                self._w(f'<span class="workflow-step{active_cls}" style="border-color:{border_color}">{_esc(step)}</span>')
                if i < len(steps) - 1:
                    self._w('<span class="workflow-arrow">&rarr;</span>')
            self._w("</div>")
        self._w("</div>")
        self._w('<div class="flow-title">Code Health Flow</div>')
        self._w('<div class="workflow">')
        _health_steps = [
            ("QA", "centinela", ["SIGN IN", "scan", "TIME OUT", "SIGN OUT"]),
            ("Dev", "forja", ["SIGN IN", "cleanup", "TIME OUT", "SIGN OUT"]),
            ("QA", "centinela", ["SIGN IN", "verify", "SIGN OUT"]),
        ]
        for label, agent_css, steps in _health_steps:
            color = AGENT_COLORS.get(f"{agent_css}-{'pm' if agent_css == 'prometeo' else 'dev' if agent_css == 'forja' else 'qa'}", "#fff")
            self._w(f'<div class="workflow-row"><span class="workflow-label" style="color:{color}">{label}</span>')
            for i, step in enumerate(steps):
                border_color = color if step.startswith(("SIGN", "TIME")) else "var(--border)"
                self._w(f'<span class="workflow-step" style="border-color:{border_color}">{_esc(step)}</span>')
                if i < len(steps) - 1:
                    self._w('<span class="workflow-arrow">&rarr;</span>')
            self._w("</div>")
        self._w("</div>")
        self._w("</div>")

    def section_comm_schedule(self, data: DashboardData) -> None:
        """Render the Communication Schedule section."""
        self._w('<div class="section" id="comms"><h2>Communication Schedule</h2>')
        if not data.comm_routes:
            self._w('<div class="empty-guide">No communication schedule found in CLAUDE.md.</div>')
        else:
            self._w("<table><tr><th>From</th><th>To</th><th>When</th><th>What</th></tr>")
            agent_color_map = {
                "Prometeo": COLOR_PROMETEO_HEX, "Forja": COLOR_FORJA_HEX,
                "Centinela": COLOR_CENTINELA_HEX, "Any agent": "#94a3b8",
            }
            for route in data.comm_routes:
                from_color = next((v for k, v in agent_color_map.items() if k in route.from_agent), "#e2e8f0")
                to_color = next((v for k, v in agent_color_map.items() if k in route.to_agent), "#e2e8f0")
                self._w(f"""<tr>
  <td><span class="comm-from" style="color:{from_color}">{_esc(route.from_agent)}</span></td>
  <td><span class="comm-to" style="color:{to_color}">{_esc(route.to_agent)}</span></td>
  <td>{_esc(route.when)}</td>
  <td>{_esc(route.what)}</td>
</tr>""")
            self._w("</table>")
        self._w("</div>")

    def section_adrs(self, data: DashboardData) -> None:
        """Render the Architecture Decision Records section."""
        self._w('<div class="section" id="adrs"><h2>Architecture Decisions</h2>')
        if not data.adrs:
            self._w('<div class="empty-guide">No ADRs yet.<br>Create decisions in <code>docs/adr/ADR-NNN-title.md</code> when making architectural choices.</div>')
        else:
            self._w("<table><tr><th>ADR</th><th>Title</th><th>Status</th><th>Date</th></tr>")
            for adr in data.adrs:
                status_css = {"Accepted": "adr-status-accepted", "Proposed": "adr-status-proposed"}.get(adr.status, "adr-status-deprecated")
                self._w(f"""<tr>
  <td>ADR-{_esc(adr.number)}</td>
  <td>{_esc(adr.title)}</td>
  <td class="{status_css}">{_esc(adr.status)}</td>
  <td>{_esc(adr.adr_date)}</td>
</tr>""")
            self._w("</table>")
        self._w("</div>")

    def section_recent_activity(self, data: DashboardData) -> None:
        self._w('<div class="section" id="activity"><h2>Recent Activity</h2>')
        # Git commits
        self._w("<h3>Git Log</h3>")
        if data.commits:
            for c in data.commits:
                badge_color = COMMIT_TYPE_COLORS.get(c.commit_type, "#64748b")
                self._w(f"""<div class="commit-line">
  <span class="commit-hash">{_esc(c.short_hash)}</span>
  <span class="commit-badge" style="background:{badge_color}">{_esc(c.commit_type)}</span>
  <span class="commit-msg">{_esc(c.message[:70])}</span>
  <span class="commit-date">{_esc(c.timestamp)}</span>
</div>""")
        else:
            self._w('<div class="empty">No git history available</div>')
        # Changelog
        if data.changelog.categories:
            self._w("<h3 style='margin-top:16px'>Changelog (Unreleased)</h3>")
            self._w('<div class="changelog-cats">')
            for cat, count in data.changelog.categories.items():
                suffix = "s" if count != 1 else ""
                self._w(f'<span class="changelog-cat">{_esc(cat)}: {count} item{suffix}</span>')
            self._w("</div>")
        # Agent memories
        if data.memories:
            self._w("<h3 style='margin-top:16px'>Agent Memory Snippets</h3>")
            for mem in data.memories:
                display = AGENT_DISPLAY_NAMES.get(mem.agent_name, mem.agent_name)
                color = AGENT_COLORS.get(mem.agent_name, "#fff")
                self._w(f'<div style="margin-bottom:4px"><span style="color:{color};font-weight:600">{_esc(display)}</span></div>')
                self._w(f'<div class="memory-block">{_esc(mem.preview)}</div>')
        self._w("</div>")

    def section_checklist_inventory(self, data: DashboardData) -> None:
        self._w('<div class="section" id="checklists"><h2>Checklist Inventory</h2>')
        self._w("<table><tr><th>Agent</th><th>DO-CONFIRM</th><th>READ-DO</th><th>Total Items</th></tr>")
        all_do = 0
        all_rd = 0
        all_items = 0
        for agent in data.agents:
            display = AGENT_DISPLAY_NAMES.get(agent.name, agent.name)
            color = AGENT_COLORS.get(agent.name, "#fff")
            do_c = sum(1 for c in agent.checklists if c.checklist_type == "DO-CONFIRM")
            rd = sum(1 for c in agent.checklists if c.checklist_type == "READ-DO")
            total = sum(c.item_count for c in agent.checklists)
            all_do += do_c
            all_rd += rd
            all_items += total
            self._w(f'<tr><td style="color:{color};font-weight:600">{_esc(display)}</td><td>{do_c}</td><td>{rd}</td><td>{total}</td></tr>')
        self._w(f'<tr class="totals-row"><td>Total</td><td>{all_do}</td><td>{all_rd}</td><td>{all_items}</td></tr>')
        self._w("</table>")
        # Per-agent breakdown
        self._w('<div class="cl-breakdown">')
        for agent in data.agents:
            display = AGENT_DISPLAY_NAMES.get(agent.name, agent.name)
            color = AGENT_COLORS.get(agent.name, "#fff")
            self._w(f'<div class="cl-agent-block"><h4 style="color:{color}">{_esc(display)}</h4>')
            for cl in agent.checklists:
                type_css = "cl-do" if cl.checklist_type == "DO-CONFIRM" else "cl-rd"
                self._w(f'<div class="cl-item"><span class="cl-type {type_css}">{cl.checklist_type}</span> {_esc(cl.name)} -- {cl.item_count} items</div>')
            self._w("</div>")
        self._w("</div>")
        self._w("</div>")


# -- HTML helper functions --


def _priority_css(priority: str) -> str:
    """Return CSS class for priority badge."""
    if "P0" in priority:
        return "priority-p0"
    if "P1" in priority:
        return "priority-p1"
    if "P2" in priority:
        return "priority-p2"
    return "priority-p3"


def _severity_css(severity: str) -> str:
    """Return CSS class for severity text."""
    return {
        "Critical": "sev-critical",
        "High": "sev-high",
        "Medium": "sev-medium",
        "Low": "sev-low",
    }.get(severity, "")


def _verdict_css(verdict: str) -> str:
    """Return CSS class for verdict text."""
    lower = verdict.lower()
    if "changes" in lower:
        return "verdict-changes"
    if "conditions" in lower:
        return "verdict-conditions"
    return "verdict-approved"


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> None:
    """Entry point for the dashboard CLI."""
    parser = argparse.ArgumentParser(
        description="Agent Triforce Dashboard -- multi-agent system overview",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python tools/dashboard.py              # Terminal mode (requires rich)\n"
            "  python tools/dashboard.py --html       # HTML mode -> tools/dashboard.html\n"
            "  python tools/dashboard.py --html -o /tmp/dash.html  # Custom path\n"
        ),
    )
    parser.add_argument(
        "--html",
        action="store_true",
        help="Generate self-contained HTML dashboard instead of terminal output",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=None,
        help="Output path for HTML file (default: tools/dashboard.html)",
    )
    parser.add_argument(
        "--no-open",
        action="store_true",
        help="Generate HTML without opening browser (used by hooks)",
    )
    args = parser.parse_args()
    data = collect_data()

    if args.html:
        output_path = args.output if args.output else DEFAULT_HTML_OUTPUT
        result = render_html(data, output_path)
        print(f"Dashboard written to {result}")
        if not args.no_open:
            webbrowser.open(f"file://{result.resolve()}")
    else:
        render_terminal(data)


if __name__ == "__main__":
    main()
