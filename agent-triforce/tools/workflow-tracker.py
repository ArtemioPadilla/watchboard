#!/usr/bin/env python3
"""Workflow state tracker for Agent Triforce.

Maintains workflow state in ``docs/workflow-state.json`` so the methodology's
progress is visible, auditable, and resumable across session interruptions.

Usage::

    python3 tools/workflow-tracker.py start <feature>
    python3 tools/workflow-tracker.py phase <agent> <phase>
    python3 tools/workflow-tracker.py checklist <name> [--item <text> --passed]
    python3 tools/workflow-tracker.py blocker add <description>
    python3 tools/workflow-tracker.py blocker resolve <index>
    python3 tools/workflow-tracker.py complete
    python3 tools/workflow-tracker.py status
    python3 tools/workflow-tracker.py history
"""
from __future__ import annotations

import argparse
import json
import sys
import time
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
STATE_FILE = PROJECT_ROOT / "docs" / "workflow-state.json"

SCHEMA_VERSION = "1.0.0"

VALID_AGENTS = ("prometeo-pm", "forja-dev", "centinela-qa")
VALID_PHASES = ("SIGN_IN", "IN_PROGRESS", "TIME_OUT", "SIGN_OUT")

# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------


@dataclass
class ChecklistItem:
    """A single item within a checklist."""

    text: str
    passed: Optional[bool] = None


@dataclass
class Checklist:
    """A named checklist with its items."""

    name: str
    items: List[ChecklistItem] = field(default_factory=list)


@dataclass
class Phase:
    """A workflow phase for an agent."""

    agent: str
    phase: str
    startedAt: str = ""
    completedAt: Optional[str] = None
    checklists: List[Checklist] = field(default_factory=list)


@dataclass
class WorkflowRun:
    """A complete workflow run tracking a feature through the agent pipeline."""

    id: str
    feature: str
    startedAt: str
    completedAt: Optional[str] = None
    phases: List[Phase] = field(default_factory=list)
    currentAgent: Optional[str] = None
    currentPhase: Optional[str] = None
    blockers: List[str] = field(default_factory=list)


@dataclass
class WorkflowState:
    """Top-level workflow state persisted to JSON."""

    version: str = SCHEMA_VERSION
    currentRun: Optional[WorkflowRun] = None
    history: List[WorkflowRun] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------


def _now_iso() -> str:
    """Return current UTC time in ISO-8601 format."""
    return datetime.now(timezone.utc).isoformat()


def _generate_run_id() -> str:
    """Generate a unique run identifier."""
    return f"run-{int(time.time())}"


def _state_to_dict(state: WorkflowState) -> Dict:
    """Convert state dataclass tree to a JSON-serializable dict."""
    result: Dict = {"version": state.version, "history": []}
    if state.currentRun is not None:
        result["currentRun"] = _run_to_dict(state.currentRun)
    else:
        result["currentRun"] = None
    for run in state.history:
        result["history"].append(_run_to_dict(run))
    return result


def _run_to_dict(run: WorkflowRun) -> Dict:
    """Convert a WorkflowRun to a dict."""
    return {
        "id": run.id,
        "feature": run.feature,
        "startedAt": run.startedAt,
        "completedAt": run.completedAt,
        "phases": [_phase_to_dict(p) for p in run.phases],
        "currentAgent": run.currentAgent,
        "currentPhase": run.currentPhase,
        "blockers": list(run.blockers),
    }


def _phase_to_dict(phase: Phase) -> Dict:
    """Convert a Phase to a dict."""
    return {
        "agent": phase.agent,
        "phase": phase.phase,
        "startedAt": phase.startedAt,
        "completedAt": phase.completedAt,
        "checklists": [
            {
                "name": cl.name,
                "items": [{"text": item.text, "passed": item.passed} for item in cl.items],
            }
            for cl in phase.checklists
        ],
    }


def _dict_to_state(data: Dict) -> WorkflowState:
    """Reconstruct WorkflowState from parsed JSON dict."""
    state = WorkflowState(version=data.get("version", SCHEMA_VERSION))
    if data.get("currentRun") is not None:
        state.currentRun = _dict_to_run(data["currentRun"])
    state.history = [_dict_to_run(r) for r in data.get("history", [])]
    return state


def _dict_to_run(data: Dict) -> WorkflowRun:
    """Reconstruct a WorkflowRun from a dict."""
    run = WorkflowRun(
        id=data["id"],
        feature=data["feature"],
        startedAt=data["startedAt"],
        completedAt=data.get("completedAt"),
    )
    run.phases = [_dict_to_phase(p) for p in data.get("phases", [])]
    run.currentAgent = data.get("currentAgent")
    run.currentPhase = data.get("currentPhase")
    run.blockers = data.get("blockers", [])
    return run


def _dict_to_phase(data: Dict) -> Phase:
    """Reconstruct a Phase from a dict."""
    phase = Phase(
        agent=data["agent"],
        phase=data["phase"],
        startedAt=data.get("startedAt", ""),
        completedAt=data.get("completedAt"),
    )
    for cl_data in data.get("checklists", []):
        items = [
            ChecklistItem(text=item["text"], passed=item.get("passed"))
            for item in cl_data.get("items", [])
        ]
        phase.checklists.append(Checklist(name=cl_data["name"], items=items))
    return phase


# ---------------------------------------------------------------------------
# File I/O
# ---------------------------------------------------------------------------


def _read_state() -> WorkflowState:
    """Read the workflow state from disk, returning a fresh state if missing."""
    if not STATE_FILE.exists():
        return WorkflowState()
    try:
        data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        return _dict_to_state(data)
    except (json.JSONDecodeError, KeyError, TypeError):
        return WorkflowState()


def _write_state(state: WorkflowState) -> None:
    """Write the workflow state to disk."""
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(
        json.dumps(_state_to_dict(state), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


def cmd_start(feature: str) -> int:
    """Start a new workflow run for a feature."""
    state = _read_state()
    if state.currentRun is not None:
        print(
            f"Error: A workflow run is already in progress for '{state.currentRun.feature}'.\n"
            f"Complete it first with: python3 tools/workflow-tracker.py complete",
            file=sys.stderr,
        )
        return 1
    run = WorkflowRun(
        id=_generate_run_id(),
        feature=feature,
        startedAt=_now_iso(),
    )
    state.currentRun = run
    _write_state(state)
    print(f"Started workflow run '{run.id}' for feature: {feature}")
    return 0


def cmd_phase(agent: str, phase: str) -> int:
    """Update the current workflow phase."""
    state = _read_state()
    if state.currentRun is None:
        print("Error: No active workflow run. Start one first.", file=sys.stderr)
        return 1
    if agent not in VALID_AGENTS:
        print(f"Error: Invalid agent '{agent}'. Valid: {', '.join(VALID_AGENTS)}", file=sys.stderr)
        return 1
    if phase not in VALID_PHASES:
        print(f"Error: Invalid phase '{phase}'. Valid: {', '.join(VALID_PHASES)}", file=sys.stderr)
        return 1
    run = state.currentRun
    # Close previous phase if one is open
    if run.phases and run.phases[-1].completedAt is None:
        run.phases[-1].completedAt = _now_iso()
    # Open new phase
    new_phase = Phase(agent=agent, phase=phase, startedAt=_now_iso())
    run.phases.append(new_phase)
    run.currentAgent = agent
    run.currentPhase = phase
    _write_state(state)
    display_agent = agent.replace("-", " ").title().replace(" ", " (", 1) + ")" if "-" in agent else agent
    print(f"Phase updated: {display_agent} -> {phase}")
    return 0


def cmd_checklist(name: str, item_text: Optional[str], passed: Optional[bool]) -> int:
    """Record a checklist or checklist item result."""
    state = _read_state()
    if state.currentRun is None:
        print("Error: No active workflow run.", file=sys.stderr)
        return 1
    run = state.currentRun
    if not run.phases:
        print("Error: No active phase. Set a phase first.", file=sys.stderr)
        return 1
    current_phase = run.phases[-1]
    # Find or create the checklist
    target_checklist = None
    for cl in current_phase.checklists:
        if cl.name == name:
            target_checklist = cl
            break
    if target_checklist is None:
        target_checklist = Checklist(name=name)
        current_phase.checklists.append(target_checklist)
    if item_text is not None:
        target_checklist.items.append(ChecklistItem(text=item_text, passed=passed))
        status = "PASS" if passed else ("FAIL" if passed is False else "PENDING")
        print(f"Checklist '{name}' item recorded: [{status}] {item_text}")
    else:
        print(f"Checklist '{name}' registered on phase {current_phase.phase}")
    _write_state(state)
    return 0


def cmd_blocker_add(description: str) -> int:
    """Add a blocker to the current run."""
    state = _read_state()
    if state.currentRun is None:
        print("Error: No active workflow run.", file=sys.stderr)
        return 1
    state.currentRun.blockers.append(description)
    _write_state(state)
    print(f"Blocker added: {description}")
    return 0


def cmd_blocker_resolve(index: int) -> int:
    """Resolve (remove) a blocker by index."""
    state = _read_state()
    if state.currentRun is None:
        print("Error: No active workflow run.", file=sys.stderr)
        return 1
    blockers = state.currentRun.blockers
    if index < 0 or index >= len(blockers):
        print(f"Error: Invalid blocker index {index}. Range: 0-{len(blockers) - 1}", file=sys.stderr)
        return 1
    removed = blockers.pop(index)
    _write_state(state)
    print(f"Blocker resolved: {removed}")
    return 0


def cmd_complete() -> int:
    """Complete the current workflow run and move it to history."""
    state = _read_state()
    if state.currentRun is None:
        print("Error: No active workflow run to complete.", file=sys.stderr)
        return 1
    run = state.currentRun
    # Close the last open phase
    if run.phases and run.phases[-1].completedAt is None:
        run.phases[-1].completedAt = _now_iso()
    run.completedAt = _now_iso()
    run.currentAgent = None
    run.currentPhase = None
    state.history.append(run)
    state.currentRun = None
    _write_state(state)
    print(f"Workflow run '{run.id}' completed for feature: {run.feature}")
    _print_run_summary(run)
    return 0


def cmd_status() -> int:
    """Display the current workflow status."""
    state = _read_state()
    if state.currentRun is None:
        print("No active workflow run.")
        if state.history:
            last = state.history[-1]
            print(f"Last completed: '{last.feature}' ({last.id}) at {last.completedAt or 'unknown'}")
        return 0
    run = state.currentRun
    print(f"Workflow: {run.feature} ({run.id})")
    print(f"Started:  {run.startedAt}")
    print(f"Agent:    {run.currentAgent or 'none'}")
    print(f"Phase:    {run.currentPhase or 'none'}")
    print()
    # Phase history
    if run.phases:
        print("Phases:")
        for i, phase in enumerate(run.phases):
            status = "active" if phase.completedAt is None else "done"
            marker = " <-- current" if phase.completedAt is None else ""
            print(f"  {i + 1}. [{phase.agent}] {phase.phase} ({status}){marker}")
            for cl in phase.checklists:
                passed_count = sum(1 for item in cl.items if item.passed is True)
                failed_count = sum(1 for item in cl.items if item.passed is False)
                pending_count = sum(1 for item in cl.items if item.passed is None)
                total = len(cl.items)
                print(f"     Checklist: {cl.name} ({passed_count}/{total} passed, {failed_count} failed, {pending_count} pending)")
    # Blockers
    if run.blockers:
        print()
        print("BLOCKERS:")
        for i, blocker in enumerate(run.blockers):
            print(f"  [{i}] {blocker}")
    print()
    return 0


def cmd_history() -> int:
    """Display the workflow run history."""
    state = _read_state()
    if not state.history:
        print("No completed workflow runs.")
        return 0
    print(f"Completed workflow runs ({len(state.history)}):")
    print()
    for run in reversed(state.history):
        _print_run_summary(run)
        print()
    return 0


# ---------------------------------------------------------------------------
# Display helpers
# ---------------------------------------------------------------------------


def _print_run_summary(run: WorkflowRun) -> None:
    """Print a concise summary of a workflow run."""
    print(f"  Run:     {run.id}")
    print(f"  Feature: {run.feature}")
    print(f"  Started: {run.startedAt}")
    print(f"  Ended:   {run.completedAt or 'in progress'}")
    print(f"  Phases:  {len(run.phases)}")
    total_checklists = sum(len(p.checklists) for p in run.phases)
    total_items = sum(
        len(cl.items) for p in run.phases for cl in p.checklists
    )
    passed_items = sum(
        1 for p in run.phases for cl in p.checklists for item in cl.items if item.passed is True
    )
    print(f"  Checklists: {total_checklists} ({passed_items}/{total_items} items passed)")
    if run.blockers:
        print(f"  Unresolved blockers: {len(run.blockers)}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> None:
    """Entry point for the workflow tracker CLI."""
    parser = argparse.ArgumentParser(
        description="Agent Triforce workflow state tracker",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python3 tools/workflow-tracker.py start my-feature\n"
            "  python3 tools/workflow-tracker.py phase prometeo-pm SIGN_IN\n"
            "  python3 tools/workflow-tracker.py checklist 'SIGN IN' --item 'Stated identity' --passed\n"
            "  python3 tools/workflow-tracker.py blocker add 'Missing API key'\n"
            "  python3 tools/workflow-tracker.py blocker resolve 0\n"
            "  python3 tools/workflow-tracker.py complete\n"
            "  python3 tools/workflow-tracker.py status\n"
            "  python3 tools/workflow-tracker.py history\n"
        ),
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # start
    sp_start = subparsers.add_parser("start", help="Start a new workflow run")
    sp_start.add_argument("feature", help="Feature name for this run")

    # phase
    sp_phase = subparsers.add_parser("phase", help="Update the current workflow phase")
    sp_phase.add_argument("agent", choices=VALID_AGENTS, help="Agent name")
    sp_phase.add_argument("phase", choices=VALID_PHASES, help="Phase name")

    # checklist
    sp_cl = subparsers.add_parser("checklist", help="Record a checklist or item")
    sp_cl.add_argument("name", help="Checklist name")
    sp_cl.add_argument("--item", help="Checklist item text")
    sp_cl.add_argument(
        "--passed",
        action="store_true",
        default=None,
        help="Mark item as passed",
    )
    sp_cl.add_argument(
        "--failed",
        action="store_true",
        default=False,
        help="Mark item as failed",
    )

    # blocker
    sp_blocker = subparsers.add_parser("blocker", help="Manage blockers")
    blocker_sub = sp_blocker.add_subparsers(dest="blocker_action")
    sp_blocker_add = blocker_sub.add_parser("add", help="Add a blocker")
    sp_blocker_add.add_argument("description", help="Blocker description")
    sp_blocker_resolve = blocker_sub.add_parser("resolve", help="Resolve a blocker")
    sp_blocker_resolve.add_argument("index", type=int, help="Blocker index to resolve")

    # complete
    subparsers.add_parser("complete", help="Complete the current workflow run")

    # status
    subparsers.add_parser("status", help="Show current workflow status")

    # history
    subparsers.add_parser("history", help="Show workflow run history")

    args = parser.parse_args()

    if args.command is None:
        parser.print_help()
        sys.exit(1)

    if args.command == "start":
        sys.exit(cmd_start(args.feature))
    elif args.command == "phase":
        sys.exit(cmd_phase(args.agent, args.phase))
    elif args.command == "checklist":
        passed_value = None
        if args.passed:
            passed_value = True
        elif args.failed:
            passed_value = False
        sys.exit(cmd_checklist(args.name, args.item, passed_value))
    elif args.command == "blocker":
        if args.blocker_action == "add":
            sys.exit(cmd_blocker_add(args.description))
        elif args.blocker_action == "resolve":
            sys.exit(cmd_blocker_resolve(args.index))
        else:
            sp_blocker.print_help()
            sys.exit(1)
    elif args.command == "complete":
        sys.exit(cmd_complete())
    elif args.command == "status":
        sys.exit(cmd_status())
    elif args.command == "history":
        sys.exit(cmd_history())
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
