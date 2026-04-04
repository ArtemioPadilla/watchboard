#!/usr/bin/env python3
"""Security scanner for Agent Triforce -- pre-commit hook integration.

Scans file content for hardcoded secrets, SQL injection patterns, XSS vectors,
and unsafe eval usage. Designed to run as a Claude Code PreToolUse hook on
Write and Edit tool invocations.

Usage::

    # Scan a file by path
    python3 tools/security-scanner.py --file path/to/file.py

    # Scan content from stdin
    echo 'password = "hunter2"' | python3 tools/security-scanner.py --stdin

    # Scan with custom patterns file
    python3 tools/security-scanner.py --file f.py --patterns src/security/patterns.json

    # Append findings to audit trail
    python3 tools/security-scanner.py --file f.py --audit-trail docs/reviews/security-audit-trail.md

Output (JSON to stdout)::

    {"blocked": true, "findings": [{"pattern": "SECRET_GENERIC_PASSWORD", ...}]}

Exit codes:
    0 -- clean (no blocking findings)
    1 -- blocked (critical or high severity findings)
    2 -- error (invalid arguments, missing file, etc.)
"""
from __future__ import annotations

import argparse
import fnmatch
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
DEFAULT_PATTERNS_FILE = PROJECT_ROOT / "src" / "security" / "patterns.json"
BLOCKING_SEVERITIES = frozenset({"critical", "high"})


# ---------------------------------------------------------------------------
# Domain: Pattern loading
# ---------------------------------------------------------------------------

def load_patterns(patterns_path: Path) -> List[Dict[str, Any]]:
    """Load security patterns from a JSON file.

    Raises ``SystemExit`` with code 2 on failure.
    """
    try:
        raw = patterns_path.read_text(encoding="utf-8")
        data = json.loads(raw)
    except FileNotFoundError:
        _exit_error(f"Patterns file not found: {patterns_path}")
    except json.JSONDecodeError as exc:
        _exit_error(f"Invalid JSON in patterns file: {exc}")

    patterns = data.get("patterns", [])
    if not patterns:
        _exit_error("Patterns file contains no patterns")

    compiled: List[Dict[str, Any]] = []
    for pat in patterns:
        try:
            compiled.append({
                "id": pat["id"],
                "regex": re.compile(pat["regex"]),
                "severity": pat["severity"],
                "message": pat["message"],
                "category": pat.get("category", "unknown"),
            })
        except re.error as exc:
            _exit_error(f"Invalid regex in pattern {pat.get('id', '?')}: {exc}")

    return compiled


# ---------------------------------------------------------------------------
# Domain: Agentignore
# ---------------------------------------------------------------------------

def load_agentignore(project_root: Path) -> List[str]:
    """Load .agentignore patterns (gitignore syntax, simplified).

    Returns a list of glob patterns. Lines starting with ``#`` or empty
    lines are skipped.
    """
    ignore_file = project_root / ".agentignore"
    if not ignore_file.is_file():
        return []

    patterns: List[str] = []
    for line in ignore_file.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("#"):
            patterns.append(stripped)
    return patterns


def is_ignored(file_path: str, ignore_patterns: List[str]) -> bool:
    """Check whether *file_path* matches any .agentignore pattern."""
    for pattern in ignore_patterns:
        if fnmatch.fnmatch(file_path, pattern):
            return True
        # Also match against basename for simple patterns like "*.test.js"
        if fnmatch.fnmatch(Path(file_path).name, pattern):
            return True
        # Match against relative path segments
        if any(fnmatch.fnmatch(part, pattern) for part in Path(file_path).parts):
            return True
    return False


# ---------------------------------------------------------------------------
# Domain: Scanning
# ---------------------------------------------------------------------------

def scan_content(
    content: str,
    patterns: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Scan *content* against *patterns* and return findings."""
    findings: List[Dict[str, Any]] = []
    lines = content.splitlines()

    for line_num, line in enumerate(lines, start=1):
        for pat in patterns:
            if pat["regex"].search(line):
                findings.append({
                    "pattern": pat["id"],
                    "line": line_num,
                    "severity": pat["severity"],
                    "message": pat["message"],
                    "category": pat["category"],
                    "matched_line": _truncate(line.strip(), 120),
                })

    return findings


def determine_blocked(findings: List[Dict[str, Any]]) -> bool:
    """Return True if any finding has a blocking severity."""
    return any(f["severity"] in BLOCKING_SEVERITIES for f in findings)


# ---------------------------------------------------------------------------
# Adapter: Audit trail
# ---------------------------------------------------------------------------

def append_audit_trail(
    audit_path: Path,
    file_path: str,
    findings: List[Dict[str, Any]],
) -> None:
    """Append findings to the append-only audit trail markdown file."""
    if not findings:
        return

    audit_path.parent.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    entry_lines = [
        f"\n### Scan: {file_path} -- {timestamp}\n",
        "",
    ]

    for finding in findings:
        entry_lines.append(
            f"- **[{finding['severity'].upper()}]** `{finding['pattern']}` "
            f"(line {finding['line']}): {finding['message']}"
        )

    entry_lines.append("")

    # Create file with header if it does not exist
    if not audit_path.is_file():
        header = (
            "# Security Audit Trail\n\n"
            "Append-only log of security scanner findings. "
            "Entries are never deleted, only acknowledged.\n\n"
            "---\n"
        )
        audit_path.write_text(header, encoding="utf-8")

    with open(audit_path, "a", encoding="utf-8") as fh:
        fh.write("\n".join(entry_lines) + "\n")


# ---------------------------------------------------------------------------
# Adapter: CLI
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    """Build the argument parser."""
    parser = argparse.ArgumentParser(
        description="Security scanner for Agent Triforce pre-commit hooks.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    source_group = parser.add_mutually_exclusive_group(required=True)
    source_group.add_argument(
        "--file", "-f",
        type=str,
        help="Path to the file to scan.",
    )
    source_group.add_argument(
        "--stdin",
        action="store_true",
        help="Read content from stdin.",
    )

    parser.add_argument(
        "--patterns", "-p",
        type=str,
        default=None,
        help=f"Path to patterns JSON file. Default: {DEFAULT_PATTERNS_FILE}",
    )
    parser.add_argument(
        "--audit-trail", "-a",
        type=str,
        default=None,
        help="Path to audit trail markdown file to append findings to.",
    )
    parser.add_argument(
        "--project-root",
        type=str,
        default=None,
        help="Project root for .agentignore resolution. Default: auto-detected.",
    )

    return parser


def main(argv: Optional[List[str]] = None) -> int:
    """Entry point. Returns exit code (0=clean, 1=blocked, 2=error)."""
    parser = build_parser()
    args = parser.parse_args(argv)

    # Resolve project root
    project_root = Path(args.project_root) if args.project_root else PROJECT_ROOT

    # Resolve patterns file
    patterns_path = Path(args.patterns) if args.patterns else DEFAULT_PATTERNS_FILE
    patterns = load_patterns(patterns_path)

    # Load .agentignore
    ignore_patterns = load_agentignore(project_root)

    # Determine source
    file_path_str = args.file or "<stdin>"

    # Check agentignore before reading content
    if args.file and is_ignored(args.file, ignore_patterns):
        result = {"blocked": False, "findings": [], "ignored": True}
        _output_json(result)
        return 0

    # Read content
    if args.stdin:
        content = sys.stdin.read()
    else:
        file_path = Path(args.file)
        if not file_path.is_file():
            _exit_error(f"File not found: {args.file}")
        try:
            content = file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            # Binary file -- skip scanning
            result = {"blocked": False, "findings": [], "binary": True}
            _output_json(result)
            return 0

    # Scan
    findings = scan_content(content, patterns)
    blocked = determine_blocked(findings)

    # Audit trail
    if args.audit_trail and findings:
        audit_path = Path(args.audit_trail)
        append_audit_trail(audit_path, file_path_str, findings)

    # Output
    result = {
        "blocked": blocked,
        "findings": findings,
    }
    _output_json(result)

    return 1 if blocked else 0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _output_json(data: Dict[str, Any]) -> None:
    """Write JSON result to stdout."""
    json.dump(data, sys.stdout, indent=2)
    sys.stdout.write("\n")


def _truncate(text: str, max_len: int) -> str:
    """Truncate *text* to *max_len* characters with ellipsis."""
    if len(text) <= max_len:
        return text
    return text[: max_len - 3] + "..."


def _exit_error(message: str) -> None:
    """Print error JSON and exit with code 2."""
    error_result = {"blocked": False, "error": message}
    _output_json(error_result)
    sys.exit(2)


if __name__ == "__main__":
    sys.exit(main())
