#!/usr/bin/env python3
"""Session analytics tracker for Agent Triforce.

Tracks per-agent metrics from workflow state and estimates costs based on
model pricing configuration. Outputs session reports as JSON to
``docs/analytics/session-{date}.json``.

Usage::

    python3 tools/session-tracker.py report              # Generate session report
    python3 tools/session-tracker.py report --pretty      # Pretty-printed output
    python3 tools/session-tracker.py export               # Export to docs/analytics/
    python3 tools/session-tracker.py summary              # One-line cost summary
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
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
WORKFLOW_STATE_FILE = PROJECT_ROOT / "docs" / "workflow-state.json"
ANALYTICS_DIR = PROJECT_ROOT / "docs" / "analytics"
ROUTING_CONFIG_FILE = PROJECT_ROOT / ".agent-routing.json"
REVIEW_DIR = PROJECT_ROOT / "docs" / "reviews"

# Default pricing per 1M tokens (USD) -- used when no routing config exists.
# Based on Anthropic published rates as of 2025.
DEFAULT_PRICING: Dict[str, Dict[str, float]] = {
    "opus": {"input": 15.00, "output": 75.00},
    "sonnet": {"input": 3.00, "output": 15.00},
    "haiku": {"input": 0.25, "output": 1.25},
}

# Estimated average tokens per phase (rough heuristics for cost estimation).
# These are deliberately conservative overestimates.
TOKENS_PER_PHASE: Dict[str, int] = {
    "SIGN_IN": 2000,
    "IN_PROGRESS": 8000,
    "TIME_OUT": 3000,
    "SIGN_OUT": 2000,
}

# Default model assignment per agent (overridden by .agent-routing.json).
DEFAULT_AGENT_MODELS: Dict[str, str] = {
    "prometeo-pm": "sonnet",
    "forja-dev": "sonnet",
    "centinela-qa": "sonnet",
}

# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------


@dataclass
class AgentMetrics:
    """Metrics for a single agent in a session."""

    estimated_tokens: int = 0
    time_ms: int = 0
    checklists_run: int = 0
    findings_logged: int = 0


@dataclass
class SessionReport:
    """Complete session analytics report."""

    session_id: str
    date: str
    agents: Dict[str, AgentMetrics] = field(default_factory=dict)
    total_estimated_cost: str = "$0.00"
    workflow_phases: int = 0
    handoffs_completed: int = 0


# ---------------------------------------------------------------------------
# Pricing helpers
# ---------------------------------------------------------------------------


def _load_pricing() -> Dict[str, Dict[str, float]]:
    """Load pricing from .agent-routing.json or fall back to defaults."""
    if not ROUTING_CONFIG_FILE.exists():
        return DEFAULT_PRICING
    try:
        data = json.loads(ROUTING_CONFIG_FILE.read_text(encoding="utf-8"))
        pricing = data.get("pricing", {})
        if pricing:
            return pricing
    except (json.JSONDecodeError, OSError):
        pass
    return DEFAULT_PRICING


def _load_agent_models() -> Dict[str, str]:
    """Load agent-to-model mapping from .agent-routing.json or defaults."""
    if not ROUTING_CONFIG_FILE.exists():
        return DEFAULT_AGENT_MODELS.copy()
    try:
        data = json.loads(ROUTING_CONFIG_FILE.read_text(encoding="utf-8"))
        routes = data.get("routes", {})
        models = DEFAULT_AGENT_MODELS.copy()
        for agent, config in routes.items():
            if isinstance(config, str):
                models[agent] = config
            elif isinstance(config, dict) and "model" in config:
                models[agent] = config["model"]
        return models
    except (json.JSONDecodeError, OSError):
        return DEFAULT_AGENT_MODELS.copy()


def _estimate_cost(
    agent_tokens: Dict[str, int],
    agent_models: Dict[str, str],
    pricing: Dict[str, Dict[str, float]],
) -> float:
    """Estimate total cost in USD from token counts and pricing."""
    total = 0.0
    for agent, tokens in agent_tokens.items():
        model = agent_models.get(agent, "sonnet")
        model_pricing = pricing.get(model, pricing.get("sonnet", DEFAULT_PRICING["sonnet"]))
        # Assume 60/40 input/output split for estimation
        input_tokens = int(tokens * 0.6)
        output_tokens = int(tokens * 0.4)
        input_cost = (input_tokens / 1_000_000) * model_pricing.get("input", 3.00)
        output_cost = (output_tokens / 1_000_000) * model_pricing.get("output", 15.00)
        total += input_cost + output_cost
    return total


# ---------------------------------------------------------------------------
# Workflow state reading
# ---------------------------------------------------------------------------


def _read_workflow_state() -> Optional[Dict]:
    """Read the workflow state file, returning None if missing or invalid."""
    if not WORKFLOW_STATE_FILE.exists():
        return None
    try:
        return json.loads(WORKFLOW_STATE_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def _count_findings() -> Dict[str, int]:
    """Count findings per agent from review files."""
    counts: Dict[str, int] = {
        "prometeo-pm": 0,
        "forja-dev": 0,
        "centinela-qa": 0,
    }
    if not REVIEW_DIR.exists():
        return counts
    for path in REVIEW_DIR.glob("*.md"):
        if path.name.lower() == "readme.md":
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        finding_count = len(set(re.findall(r"\*\*\[[CWS]-\d+\]\*\*", text)))
        if finding_count > 0:
            if "business-review" in path.name:
                counts["prometeo-pm"] += finding_count
            elif "security" in path.name or "code-health" in path.name or "release" in path.name:
                counts["centinela-qa"] += finding_count
            else:
                counts["forja-dev"] += finding_count
    return counts


def _compute_handoffs(runs: List[Dict]) -> int:
    """Count agent transitions (handoffs) across all phases."""
    handoffs = 0
    for run in runs:
        phases = run.get("phases", [])
        for i in range(1, len(phases)):
            prev_agent = phases[i - 1].get("agent", "")
            curr_agent = phases[i].get("agent", "")
            if prev_agent != curr_agent:
                handoffs += 1
    return handoffs


# ---------------------------------------------------------------------------
# Report generation
# ---------------------------------------------------------------------------


def _build_report(state: Optional[Dict]) -> SessionReport:
    """Build a session report from workflow state and project files."""
    now = datetime.now(timezone.utc)
    report = SessionReport(
        session_id=f"session-{now.strftime('%Y%m%d-%H%M%S')}",
        date=now.isoformat(),
    )

    # Initialize agent metrics
    for agent in ("prometeo-pm", "forja-dev", "centinela-qa"):
        report.agents[agent] = AgentMetrics()

    if state is None:
        report.total_estimated_cost = "$0.00"
        return report

    # Collect all runs (current + history)
    all_runs: List[Dict] = list(state.get("history", []))
    current_run = state.get("currentRun")
    if current_run is not None:
        all_runs.append(current_run)

    # Aggregate phase data
    total_phases = 0
    agent_tokens: Dict[str, int] = {
        "prometeo-pm": 0,
        "forja-dev": 0,
        "centinela-qa": 0,
    }

    for run in all_runs:
        phases = run.get("phases", [])
        total_phases += len(phases)
        for phase_data in phases:
            agent = phase_data.get("agent", "")
            phase_name = phase_data.get("phase", "IN_PROGRESS")
            if agent not in agent_tokens:
                agent_tokens[agent] = 0
            agent_tokens[agent] += TOKENS_PER_PHASE.get(phase_name, 5000)

            # Count checklists
            if agent in report.agents:
                checklists = phase_data.get("checklists", [])
                report.agents[agent].checklists_run += len(checklists)

            # Estimate time from phase timestamps
            started = phase_data.get("startedAt", "")
            completed = phase_data.get("completedAt")
            if started and completed and agent in report.agents:
                try:
                    start_dt = datetime.fromisoformat(started.replace("Z", "+00:00"))
                    end_dt = datetime.fromisoformat(completed.replace("Z", "+00:00"))
                    delta_ms = int((end_dt - start_dt).total_seconds() * 1000)
                    report.agents[agent].time_ms += max(0, delta_ms)
                except (ValueError, TypeError):
                    pass

    report.workflow_phases = total_phases

    # Set token estimates
    for agent, tokens in agent_tokens.items():
        if agent in report.agents:
            report.agents[agent].estimated_tokens = tokens

    # Count findings from review files
    findings = _count_findings()
    for agent, count in findings.items():
        if agent in report.agents:
            report.agents[agent].findings_logged = count

    # Count handoffs
    report.handoffs_completed = _compute_handoffs(all_runs)

    # Estimate cost
    pricing = _load_pricing()
    agent_models = _load_agent_models()
    cost = _estimate_cost(agent_tokens, agent_models, pricing)
    report.total_estimated_cost = f"${cost:.2f}"

    return report


def _report_to_dict(report: SessionReport) -> Dict:
    """Convert a SessionReport to a JSON-serializable dict."""
    agents_dict = {}
    for agent_name, metrics in report.agents.items():
        agents_dict[agent_name] = {
            "estimatedTokens": metrics.estimated_tokens,
            "timeMs": metrics.time_ms,
            "checklistsRun": metrics.checklists_run,
            "findingsLogged": metrics.findings_logged,
        }
    return {
        "sessionId": report.session_id,
        "date": report.date,
        "agents": agents_dict,
        "totalEstimatedCost": report.total_estimated_cost,
        "workflowPhases": report.workflow_phases,
        "handoffsCompleted": report.handoffs_completed,
    }


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


def cmd_report(pretty: bool) -> int:
    """Generate and print a session analytics report."""
    state = _read_workflow_state()
    report = _build_report(state)
    report_dict = _report_to_dict(report)
    indent = 2 if pretty else None
    print(json.dumps(report_dict, indent=indent, ensure_ascii=False))
    return 0


def cmd_export() -> int:
    """Export session report to docs/analytics/."""
    state = _read_workflow_state()
    report = _build_report(state)
    report_dict = _report_to_dict(report)

    ANALYTICS_DIR.mkdir(parents=True, exist_ok=True)
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    output_path = ANALYTICS_DIR / f"session-{date_str}.json"

    output_path.write_text(
        json.dumps(report_dict, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Session report exported to {output_path}")
    return 0


def cmd_summary() -> int:
    """Print a one-line cost and activity summary."""
    state = _read_workflow_state()
    report = _build_report(state)

    total_tokens = sum(m.estimated_tokens for m in report.agents.values())
    total_checklists = sum(m.checklists_run for m in report.agents.values())
    total_findings = sum(m.findings_logged for m in report.agents.values())
    total_time_s = sum(m.time_ms for m in report.agents.values()) / 1000

    print(
        f"Phases: {report.workflow_phases} | "
        f"Handoffs: {report.handoffs_completed} | "
        f"Tokens: ~{total_tokens:,} | "
        f"Checklists: {total_checklists} | "
        f"Findings: {total_findings} | "
        f"Time: {total_time_s:.0f}s | "
        f"Est. Cost: {report.total_estimated_cost}"
    )
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> None:
    """Entry point for the session tracker CLI."""
    parser = argparse.ArgumentParser(
        description="Agent Triforce session analytics tracker",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python3 tools/session-tracker.py report              # JSON to stdout\n"
            "  python3 tools/session-tracker.py report --pretty      # Pretty JSON\n"
            "  python3 tools/session-tracker.py export               # Save to docs/analytics/\n"
            "  python3 tools/session-tracker.py summary              # One-line summary\n"
        ),
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # report
    sp_report = subparsers.add_parser("report", help="Generate session analytics report")
    sp_report.add_argument(
        "--pretty",
        action="store_true",
        help="Pretty-print JSON output",
    )

    # export
    subparsers.add_parser("export", help="Export report to docs/analytics/")

    # summary
    subparsers.add_parser("summary", help="Print one-line summary")

    args = parser.parse_args()

    if args.command is None:
        parser.print_help()
        sys.exit(1)

    if args.command == "report":
        sys.exit(cmd_report(args.pretty))
    elif args.command == "export":
        sys.exit(cmd_export())
    elif args.command == "summary":
        sys.exit(cmd_summary())
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
