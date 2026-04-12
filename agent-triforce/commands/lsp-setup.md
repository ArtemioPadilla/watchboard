---
description: Set up LSP (Language Server Protocol) integration for real-time code intelligence
---

Set up LSP integration so that agents receive real compiler errors, type checker output, and lint warnings instead of relying on heuristic analysis.

**Step 1: Detect project type**

Scan the project root for these manifest files to determine the tech stack:
- `package.json` or `tsconfig.json` --> TypeScript
- `pyproject.toml`, `setup.py`, or `requirements.txt` --> Python
- `Cargo.toml` --> Rust

**Step 2: Copy the appropriate template**

Based on detected project type, copy the matching template to `.lsp.json` in the project root:

| Stack | Template | LSP Server |
|-------|----------|------------|
| TypeScript | `templates/lsp/typescript.lsp.json` | `typescript-language-server` |
| Python | `templates/lsp/python.lsp.json` | `pylsp` |
| Rust | `templates/lsp/rust.lsp.json` | `rust-analyzer` |

If the project uses multiple languages, merge the `servers` arrays from each template into a single `.lsp.json`.

**Step 3: Verify LSP server is installed**

Check if the required LSP server binary is available:
- TypeScript: `which typescript-language-server` (install via `npm install -g typescript-language-server typescript`)
- Python: `which pylsp` (install via `pip install python-lsp-server[all]`)
- Rust: `which rust-analyzer` (install via `rustup component add rust-analyzer`)

If not installed, provide the install command and ask the user to install it.

**Step 4: Confirm setup**

Report what was configured and remind the user:
- LSP diagnostics are per-project (`.lsp.json` in project root)
- If no LSP configuration exists, agents proceed normally with heuristic analysis
- Supported LSP servers in v1: `typescript-language-server`, `pylsp`, `rust-analyzer`

**Templates location**: `templates/lsp/`
