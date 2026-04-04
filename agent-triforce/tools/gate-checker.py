#!/usr/bin/env python3
"""Gate checker for Agent Triforce -- plan approval and release gates.

Manages gate documents that enforce approval gates between agents:
- plan-gate: Prometeo approves Forja's implementation plan before coding
- release-gate: Centinela signs off before release

Usage::

    # Check if a gate exists and is approved
    python3 tools/gate-checker.py check --feature user-auth --gate-type plan-gate

    # Create a new gate document
    python3 tools/gate-checker.py create --feature user-auth --gate-type plan-gate \\
        --criteria "Spec coverage verified" --criteria "Architecture reviewed"

    # Approve a gate
    python3 tools/gate-checker.py approve --feature user-auth --gate-type plan-gate \\
        --approved-by "Prometeo (PM)"

    # Override a gate (requires reason)
    python3 tools/gate-checker.py override --feature user-auth --gate-type plan-gate \\
        --override-reason "Expedited for critical hotfix"

Output (JSON to stdout):
    {"status": "APPROVED|PENDING|OVERRIDDEN|NOT_FOUND", ...}

Exit codes:
    0 -- gate passed (APPROVED or OVERRIDDEN)
    1 -- gate not passed (PENDING or NOT_FOUND)
    2 -- error (invalid arguments)
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


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
DEFAULT_GATES_DIR = PROJECT_ROOT / "docs" / "gates"

VALID_GATE_TYPES = frozenset({"plan-gate", "release-gate"})

GATE_TYPE_LABELS = {
    "plan-gate": "Plan Approval Gate",
    "release-gate": "Release Approval Gate",
}

STATUS_PENDING = "PENDING"
STATUS_APPROVED = "APPROVED"
STATUS_OVERRIDDEN = "OVERRIDDEN"
STATUS_NOT_FOUND = "NOT_FOUND"

PASSING_STATUSES = frozenset({STATUS_APPROVED, STATUS_OVERRIDDEN})


# ---------------------------------------------------------------------------
# Domain: Gate document parsing
# ---------------------------------------------------------------------------

def _extract_field(content: str, pattern: str, placeholder: str = "") -> str:
    """Extract a markdown bold-field value, ignoring template placeholders."""
    match = re.search(pattern, content)
    if not match:
        return ""
    value = match.group(1).strip()
    return "" if value == placeholder else value


def _extract_criteria(content: str) -> List[Dict[str, Any]]:
    """Extract checkbox criteria from the ## Criteria section."""
    criteria: List[Dict[str, Any]] = []
    in_section = False
    for line in content.splitlines():
        if line.strip().startswith("## Criteria"):
            in_section = True
            continue
        if in_section and line.strip().startswith("## "):
            break
        if in_section:
            checked_match = re.match(r"\s*-\s*\[([xX ])\]\s*(.*)", line)
            if checked_match:
                criteria.append({
                    "text": checked_match.group(2).strip(),
                    "checked": checked_match.group(1).lower() == "x",
                })
    return criteria


def parse_gate_document(content: str) -> Dict[str, Any]:
    """Parse a gate markdown document into structured data."""
    status_match = re.search(r"\*\*Status\*\*:\s*(\w+)", content)
    return {
        "status": status_match.group(1).upper() if status_match else STATUS_PENDING,
        "criteria": _extract_criteria(content),
        "approved_by": _extract_field(
            content, r"\*\*Approved by\*\*:\s*(.+?)(?:\n|$)", "{agent or user}",
        ),
        "override_reason": _extract_field(
            content, r"\*\*Override reason\*\*[^:]*:\s*(.+?)(?:\n|$)", "{reason}",
        ),
    }


def all_criteria_met(criteria: List[Dict[str, Any]]) -> bool:
    """Return True if all criteria are checked."""
    if not criteria:
        return False
    return all(c["checked"] for c in criteria)


# ---------------------------------------------------------------------------
# Domain: Gate document generation
# ---------------------------------------------------------------------------

def generate_gate_document(
    feature: str,
    gate_type: str,
    criteria: List[str],
    status: str = STATUS_PENDING,
    approved_by: str = "",
    override_reason: str = "",
) -> str:
    """Generate a gate document in markdown format."""
    timestamp = datetime.now(timezone.utc).isoformat()
    label = GATE_TYPE_LABELS.get(gate_type, gate_type)

    criteria_lines = ""
    for criterion in criteria:
        criteria_lines += f"- [ ] {criterion}\n"

    if not criteria_lines:
        criteria_lines = "- [ ] (No criteria specified)\n"

    approved_by_str = approved_by if approved_by else "{agent or user}"
    override_str = override_reason if override_reason else "{reason}"

    return (
        f"# Gate: {feature} -- {label}\n"
        f"**Date**: {timestamp}\n"
        f"**Status**: {status}\n"
        f"\n"
        f"## Criteria\n"
        f"{criteria_lines}\n"
        f"## Approval\n"
        f"**Approved by**: {approved_by_str}\n"
        f"**Override reason** (if applicable): {override_str}\n"
    )


def update_gate_status(
    content: str,
    new_status: str,
    approved_by: str = "",
    override_reason: str = "",
) -> str:
    """Update the status and approval fields in an existing gate document."""
    # Update status
    content = re.sub(
        r"(\*\*Status\*\*:\s*)\w+",
        f"\\g<1>{new_status}",
        content,
    )

    # Update approved by
    if approved_by:
        content = re.sub(
            r"(\*\*Approved by\*\*:\s*).*",
            f"\\g<1>{approved_by}",
            content,
        )

    # Update override reason
    if override_reason:
        content = re.sub(
            r"(\*\*Override reason\*\*[^:]*:\s*).*",
            f"\\g<1>{override_reason}",
            content,
        )

    return content


def check_criteria_in_content(content: str, checked: bool = True) -> str:
    """Mark all criteria checkboxes as checked or unchecked."""
    if checked:
        return re.sub(r"- \[ \]", "- [x]", content)
    return re.sub(r"- \[[xX]\]", "- [ ]", content)


# ---------------------------------------------------------------------------
# Adapter: File operations
# ---------------------------------------------------------------------------

def gate_file_path(gates_dir: Path, feature: str, gate_type: str) -> Path:
    """Return the standard gate file path."""
    return gates_dir / f"{feature}-{gate_type}.md"


def read_gate(gates_dir: Path, feature: str, gate_type: str) -> Optional[str]:
    """Read gate document content. Returns None if file does not exist."""
    path = gate_file_path(gates_dir, feature, gate_type)
    if not path.is_file():
        return None
    return path.read_text(encoding="utf-8")


def write_gate(gates_dir: Path, feature: str, gate_type: str, content: str) -> Path:
    """Write gate document. Creates directory if needed. Returns file path."""
    gates_dir.mkdir(parents=True, exist_ok=True)
    path = gate_file_path(gates_dir, feature, gate_type)
    path.write_text(content, encoding="utf-8")
    return path


# ---------------------------------------------------------------------------
# Adapter: CLI
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    """Build the argument parser."""
    parser = argparse.ArgumentParser(
        description="Gate checker for Agent Triforce approval workflows.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    # -- check command --
    check_parser = subparsers.add_parser(
        "check", help="Check if a gate is approved.",
    )
    _add_common_args(check_parser)

    # -- create command --
    create_parser = subparsers.add_parser(
        "create", help="Create a new gate document.",
    )
    _add_common_args(create_parser)
    create_parser.add_argument(
        "--criteria", action="append", default=[],
        help="Gate criterion (can be repeated).",
    )

    # -- approve command --
    approve_parser = subparsers.add_parser(
        "approve", help="Approve a gate.",
    )
    _add_common_args(approve_parser)
    approve_parser.add_argument(
        "--approved-by", required=True,
        help="Who is approving the gate.",
    )

    # -- override command --
    override_parser = subparsers.add_parser(
        "override", help="Override a gate (requires reason).",
    )
    _add_common_args(override_parser)
    override_parser.add_argument(
        "--override-reason", required=True,
        help="Reason for overriding the gate.",
    )

    return parser


def _add_common_args(parser: argparse.ArgumentParser) -> None:
    """Add arguments common to all subcommands."""
    parser.add_argument(
        "--feature", required=True, help="Feature name (kebab-case).",
    )
    parser.add_argument(
        "--gate-type", required=True,
        choices=sorted(VALID_GATE_TYPES),
        help="Gate type.",
    )
    parser.add_argument(
        "--gates-dir", type=str, default=None,
        help=f"Gates directory. Default: {DEFAULT_GATES_DIR}",
    )


def main(argv: Optional[List[str]] = None) -> int:
    """Entry point. Returns exit code (0=passed, 1=not passed, 2=error)."""
    parser = build_parser()
    args = parser.parse_args(argv)

    gates_dir = Path(args.gates_dir) if args.gates_dir else DEFAULT_GATES_DIR

    if args.command == "check":
        return _cmd_check(gates_dir, args.feature, args.gate_type)
    elif args.command == "create":
        return _cmd_create(gates_dir, args.feature, args.gate_type, args.criteria)
    elif args.command == "approve":
        return _cmd_approve(gates_dir, args.feature, args.gate_type, args.approved_by)
    elif args.command == "override":
        return _cmd_override(
            gates_dir, args.feature, args.gate_type, args.override_reason,
        )

    _exit_error(f"Unknown command: {args.command}")
    return 2


# ---------------------------------------------------------------------------
# Command implementations
# ---------------------------------------------------------------------------

def _cmd_check(gates_dir: Path, feature: str, gate_type: str) -> int:
    """Check gate status."""
    content = read_gate(gates_dir, feature, gate_type)
    if content is None:
        _output_json({
            "status": STATUS_NOT_FOUND,
            "passed": False,
            "gate_path": str(gate_file_path(gates_dir, feature, gate_type)),
            "message": f"Gate document not found. Create it with: "
                       f"gate-checker.py create --feature {feature} "
                       f"--gate-type {gate_type}",
        })
        return 1

    parsed = parse_gate_document(content)
    passed = parsed["status"] in PASSING_STATUSES

    _output_json({
        "status": parsed["status"],
        "passed": passed,
        "criteria": parsed["criteria"],
        "criteria_all_met": all_criteria_met(parsed["criteria"]),
        "approved_by": parsed["approved_by"],
        "override_reason": parsed["override_reason"],
        "gate_path": str(gate_file_path(gates_dir, feature, gate_type)),
    })

    return 0 if passed else 1


def _cmd_create(
    gates_dir: Path,
    feature: str,
    gate_type: str,
    criteria: List[str],
) -> int:
    """Create a new gate document."""
    existing = read_gate(gates_dir, feature, gate_type)
    if existing is not None:
        _output_json({
            "success": False,
            "error": "Gate document already exists. Use 'check', 'approve', or 'override'.",
            "gate_path": str(gate_file_path(gates_dir, feature, gate_type)),
        })
        return 2

    content = generate_gate_document(feature, gate_type, criteria)
    path = write_gate(gates_dir, feature, gate_type, content)

    _output_json({
        "success": True,
        "status": STATUS_PENDING,
        "gate_path": str(path),
    })
    return 0


def _cmd_approve(
    gates_dir: Path,
    feature: str,
    gate_type: str,
    approved_by: str,
) -> int:
    """Approve a gate."""
    content = read_gate(gates_dir, feature, gate_type)
    if content is None:
        _output_json({
            "success": False,
            "error": "Gate document not found. Create it first.",
        })
        return 2

    # Mark all criteria as checked and update status
    updated = check_criteria_in_content(content, checked=True)
    updated = update_gate_status(updated, STATUS_APPROVED, approved_by=approved_by)
    path = write_gate(gates_dir, feature, gate_type, updated)

    _output_json({
        "success": True,
        "status": STATUS_APPROVED,
        "approved_by": approved_by,
        "gate_path": str(path),
    })
    return 0


def _cmd_override(
    gates_dir: Path,
    feature: str,
    gate_type: str,
    override_reason: str,
) -> int:
    """Override a gate with a required reason."""
    content = read_gate(gates_dir, feature, gate_type)
    if content is None:
        _output_json({
            "success": False,
            "error": "Gate document not found. Create it first.",
        })
        return 2

    if not override_reason.strip():
        _output_json({
            "success": False,
            "error": "Override reason is required and cannot be empty.",
        })
        return 2

    updated = update_gate_status(
        content, STATUS_OVERRIDDEN, override_reason=override_reason,
    )
    path = write_gate(gates_dir, feature, gate_type, updated)

    _output_json({
        "success": True,
        "status": STATUS_OVERRIDDEN,
        "override_reason": override_reason,
        "gate_path": str(path),
    })
    return 0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _output_json(data: Dict[str, Any]) -> None:
    """Write JSON result to stdout."""
    json.dump(data, sys.stdout, indent=2)
    sys.stdout.write("\n")


def _exit_error(message: str) -> None:
    """Print error JSON and exit with code 2."""
    _output_json({"success": False, "error": message})
    sys.exit(2)


if __name__ == "__main__":
    sys.exit(main())
