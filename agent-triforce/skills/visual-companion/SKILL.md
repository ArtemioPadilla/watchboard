---
name: visual-companion
description: >
  Browser-based companion for showing mockups, diagrams, wireframes, and visual
  comparisons during design conversations. Uses chrome MCP tools. Falls back to
  text-only if unavailable. Use during brainstorming or any visual design work.
---

# Visual Brainstorming Companion

A browser-based tool for visual design work during: $ARGUMENTS

## Availability Check

Before offering the companion, check if browser tools are available:
- If `mcp__claude-in-chrome__*` tools are accessible: companion is available
- If not: proceed text-only, do not offer the companion, this is not an error

## Consent Flow

**Offer once per session, in its own message (no other content):**

> Some of what we're working on might be easier to explain if I can show it to you in a web browser. I can put together mockups, diagrams, comparisons, and other visuals as we go. Want to try it?

Wait for response. If declined, proceed text-only.

## Per-Question Decision Rule

Even after acceptance, decide FOR EACH QUESTION whether to use browser or terminal:

**Use the browser** when the user would understand better by SEEING it:
- Mockups and wireframes
- Layout comparisons (side-by-side)
- Architecture diagrams (boxes and arrows)
- Data flow visualizations
- State machine diagrams
- Color/typography comparisons

**Use the terminal** when the content is fundamentally TEXT:
- Requirements questions
- Conceptual choices
- Tradeoff lists
- Scope decisions
- Technical constraints
- A/B/C option descriptions

**A question about a UI topic is not automatically visual.** "What does personality mean here?" is terminal. "Which layout works better?" is browser.

## Rendering Guidelines

When rendering in the browser:

1. Create a new tab with `mcp__claude-in-chrome__tabs_create_mcp`
2. Use `mcp__claude-in-chrome__navigate` to load an HTML data URI or local file
3. Render with:
   - Tailwind CSS for styling (via CDN)
   - Clean, semantic HTML
   - Dark/light mode support
   - Responsive layout

### What to Render
- **Architecture diagrams**: HTML/CSS boxes with flexbox/grid, connecting lines
- **UI mockups**: Tailwind-styled components at realistic sizes
- **Comparisons**: Split-pane layouts, side-by-side options with labels
- **Data flows**: Labeled boxes with directional arrows
- **State machines**: Node-edge diagrams with transition labels

### Rendering Rules
- Keep each visual focused on ONE question or comparison
- Label everything clearly — the visual should be self-explanatory
- Use consistent colors: primary for focus, gray for context, red for warnings
- Include a title describing what the visual shows
