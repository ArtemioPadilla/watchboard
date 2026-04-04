#!/usr/bin/env python3
"""Handoff artifact generator for Agent Triforce.

Generates structured handoff documents (markdown + JSON) when one agent
completes a phase and hands off to the next. Enforces the 4-field
Communication Schedule from CLAUDE.md.

Usage::

    python3 tools/handoff-generator.py \\
        --from forja \\
        --to centinela \\
        --feature user-auth \\
        --what-done "Implemented JWT auth with refresh tokens" \\
        --what-watch "Token rotation edge case on concurrent requests" \\
        --what-next "Verify token expiry handling and CSRF protection" \\
        --open-questions "Should refresh tokens be single-use?"

    # Read fields from a JSON file
    python3 tools/handoff-generator.py \\
        --from prometeo --to forja --feature user-auth \\
        --from-json handoff-data.json

Output:
    Creates two files:
    - docs/handoffs/{feature}-{from}-to-{to}-{timestamp}.md
    - docs/handoffs/{feature}-{from}-to-{to}-{timestamp}.json

Exit codes:
    0 -- success (handoff artifact generated)
    1 -- validation failure (empty required fields)
    2 -- error (invalid arguments, I/O failure)
"""
from __future__ import annotations

import argparse
import json
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
DEFAULT_HANDOFFS_DIR = PROJECT_ROOT / "docs" / "handoffs"

VALID_AGENTS = frozenset({"prometeo", "forja", "centinela"})

AGENT_DISPLAY_NAMES = {
    "prometeo": "Prometeo (PM)",
    "forja": "Forja (Dev)",
    "centinela": "Centinela (QA)",
}

REQUIRED_FIELDS = (
    "what_done",
    "what_watch",
    "what_next",
    "open_questions",
)

FIELD_LABELS = {
    "what_done": "What Was Done",
    "what_watch": "What to Watch For",
    "what_next": "What's Needed Next",
    "open_questions": "Open Questions",
}


# ---------------------------------------------------------------------------
# Domain: Validation
# ---------------------------------------------------------------------------

def validate_agents(from_agent: str, to_agent: str) -> List[str]:
    """Validate agent names. Returns list of error messages (empty if valid)."""
    errors: List[str] = []
    if from_agent not in VALID_AGENTS:
        errors.append(
            f"Invalid --from agent '{from_agent}'. "
            f"Must be one of: {', '.join(sorted(VALID_AGENTS))}"
        )
    if to_agent not in VALID_AGENTS:
        errors.append(
            f"Invalid --to agent '{to_agent}'. "
            f"Must be one of: {', '.join(sorted(VALID_AGENTS))}"
        )
    if from_agent == to_agent and not errors:
        errors.append(
            f"--from and --to cannot be the same agent ('{from_agent}')"
        )
    return errors


def validate_fields(fields: Dict[str, str]) -> List[str]:
    """Validate that all required fields are non-empty.

    Returns list of error messages (empty if valid).
    """
    errors: List[str] = []
    for field_key in REQUIRED_FIELDS:
        value = fields.get(field_key, "").strip()
        if not value:
            label = FIELD_LABELS.get(field_key, field_key)
            errors.append(f"Required field '{label}' is empty or missing")
    return errors


# ---------------------------------------------------------------------------
# Domain: Artifact generation
# ---------------------------------------------------------------------------

def generate_timestamp() -> str:
    """Generate a UTC timestamp string for file naming."""
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def generate_run_id(timestamp: str, from_agent: str, to_agent: str) -> str:
    """Generate a workflow run ID."""
    return f"{from_agent}-to-{to_agent}-{timestamp}"


def build_artifact_data(
    from_agent: str,
    to_agent: str,
    feature: str,
    fields: Dict[str, str],
    timestamp: str,
) -> Dict[str, Any]:
    """Build the structured handoff artifact data."""
    run_id = generate_run_id(timestamp, from_agent, to_agent)
    iso_timestamp = datetime.now(timezone.utc).isoformat()

    return {
        "handoff": {
            "from_agent": from_agent,
            "from_display": AGENT_DISPLAY_NAMES.get(from_agent, from_agent),
            "to_agent": to_agent,
            "to_display": AGENT_DISPLAY_NAMES.get(to_agent, to_agent),
            "feature": feature,
            "timestamp": iso_timestamp,
            "run_id": run_id,
        },
        "content": {
            "what_done": fields["what_done"].strip(),
            "what_watch": fields["what_watch"].strip(),
            "what_next": fields["what_next"].strip(),
            "open_questions": fields["open_questions"].strip(),
        },
    }


def render_markdown(data: Dict[str, Any]) -> str:
    """Render the handoff artifact as markdown."""
    h = data["handoff"]
    c = data["content"]

    return (
        f"# Handoff: {h['feature']} -- {h['from_display']} to {h['to_display']}\n"
        f"**Date**: {h['timestamp']}\n"
        f"**Workflow Run**: {h['run_id']}\n"
        f"\n"
        f"## What Was Done\n"
        f"{c['what_done']}\n"
        f"\n"
        f"## What to Watch For\n"
        f"{c['what_watch']}\n"
        f"\n"
        f"## What's Needed Next\n"
        f"{c['what_next']}\n"
        f"\n"
        f"## Open Questions\n"
        f"{c['open_questions']}\n"
    )


# ---------------------------------------------------------------------------
# Adapter: File output
# ---------------------------------------------------------------------------

def write_artifacts(
    output_dir: Path,
    feature: str,
    from_agent: str,
    to_agent: str,
    timestamp: str,
    data: Dict[str, Any],
) -> tuple:
    """Write markdown and JSON artifacts to *output_dir*.

    Creates the directory if it does not exist. Returns (md_path, json_path).
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    base_name = f"{feature}-{from_agent}-to-{to_agent}-{timestamp}"
    md_path = output_dir / f"{base_name}.md"
    json_path = output_dir / f"{base_name}.json"

    md_content = render_markdown(data)
    md_path.write_text(md_content, encoding="utf-8")

    json_content = json.dumps(data, indent=2, ensure_ascii=False)
    json_path.write_text(json_content + "\n", encoding="utf-8")

    return md_path, json_path


# ---------------------------------------------------------------------------
# Adapter: CLI
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    """Build the argument parser."""
    parser = argparse.ArgumentParser(
        description="Generate structured handoff artifacts for Agent Triforce.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument(
        "--from", dest="from_agent", required=True,
        help="Sending agent name (prometeo, forja, centinela).",
    )
    parser.add_argument(
        "--to", dest="to_agent", required=True,
        help="Receiving agent name (prometeo, forja, centinela).",
    )
    parser.add_argument(
        "--feature", required=True,
        help="Feature name (kebab-case, e.g. 'user-auth').",
    )

    # Field sources: direct arguments or JSON file
    field_group = parser.add_argument_group("Handoff fields (direct)")
    field_group.add_argument("--what-done", default="", help="What was done.")
    field_group.add_argument("--what-watch", default="", help="What to watch for.")
    field_group.add_argument("--what-next", default="", help="What's needed next.")
    field_group.add_argument("--open-questions", default="", help="Open questions.")

    parser.add_argument(
        "--from-json",
        type=str,
        default=None,
        help="Path to JSON file with handoff fields (overrides direct args).",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help=f"Output directory. Default: {DEFAULT_HANDOFFS_DIR}",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate fields and print artifact without writing files.",
    )

    return parser


def load_fields_from_json(json_path: Path) -> Dict[str, str]:
    """Load handoff fields from a JSON file."""
    try:
        raw = json_path.read_text(encoding="utf-8")
        data = json.loads(raw)
    except FileNotFoundError:
        _exit_error(f"JSON file not found: {json_path}")
    except json.JSONDecodeError as exc:
        _exit_error(f"Invalid JSON in fields file: {exc}")

    return {
        "what_done": data.get("what_done", data.get("whatDone", "")),
        "what_watch": data.get("what_watch", data.get("whatWatch", "")),
        "what_next": data.get("what_next", data.get("whatNext", "")),
        "open_questions": data.get("open_questions", data.get("openQuestions", "")),
    }


def main(argv: Optional[List[str]] = None) -> int:
    """Entry point. Returns exit code (0=success, 1=validation, 2=error)."""
    parser = build_parser()
    args = parser.parse_args(argv)

    # Validate agents
    agent_errors = validate_agents(args.from_agent, args.to_agent)
    if agent_errors:
        _output_json({"success": False, "errors": agent_errors})
        return 2

    # Collect fields
    if args.from_json:
        fields = load_fields_from_json(Path(args.from_json))
    else:
        fields = {
            "what_done": args.what_done,
            "what_watch": args.what_watch,
            "what_next": args.what_next,
            "open_questions": args.open_questions,
        }

    # Validate fields
    field_errors = validate_fields(fields)
    if field_errors:
        _output_json({"success": False, "errors": field_errors, "blocked": True})
        return 1

    # Generate artifact
    timestamp = generate_timestamp()
    data = build_artifact_data(
        args.from_agent, args.to_agent, args.feature, fields, timestamp,
    )

    if args.dry_run:
        _output_json({"success": True, "artifact": data, "dry_run": True})
        return 0

    # Write artifacts
    output_dir = Path(args.output_dir) if args.output_dir else DEFAULT_HANDOFFS_DIR
    md_path, json_path = write_artifacts(
        output_dir, args.feature, args.from_agent, args.to_agent, timestamp, data,
    )

    _output_json({
        "success": True,
        "markdown_path": str(md_path),
        "json_path": str(json_path),
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
