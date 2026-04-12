---
name: generate-tests
description: >
  Generates test cases for a module or function following FIRST principles and Arrange-Act-Assert
  pattern. Detects test framework from project config. Use to bootstrap test coverage for existing
  code or as the Red phase of TDD.
context: fork
agent: forja-dev
---

Generate tests for: $ARGUMENTS

If no specific module or function is provided, ask the user which file or function to generate tests for.

Follow these steps:

**SIGN IN:**
- Run the SIGN IN checklist from your agent file
- Note any existing test conventions in the project (fixtures, helpers, conftest)

**ANALYZE:**
1. Read the target module or function file
2. Identify all public functions, methods, and classes:
   - **Python**: functions/methods NOT prefixed with `_` (single underscore)
   - **TypeScript/JavaScript**: exported functions, classes, and methods only
   - Do NOT generate tests for private/unexported symbols
3. For each public function, extract:
   - Function signature (parameters, types, return type)
   - Docstring or JSDoc description (if present)
   - Business rules implied by the function name and signature
   - Edge cases: null/None inputs, empty collections, boundary values, error conditions

**SELECT TECHNIQUES:**
4. For each public function, select test design technique(s) based on the function's characteristics:

   | Signal in the code | Technique | What to generate |
   |---|---|---|
   | Numeric/date parameters, ranges, limits, thresholds | **Boundary Value Analysis (BVA)** | Tests at min, min+1, max-1, max, and one invalid boundary |
   | Discrete valid categories (enums, roles, types, status) | **Equivalence Partitioning (EP)** | One test per valid partition + one per invalid partition |
   | Multiple boolean conditions, complex if/elif, permission matrices | **Decision Table** | One test per unique condition combination |
   | Lifecycle objects (status fields, workflow steps, FSMs) | **State Transition** | Each valid transition + key invalid transitions |
   | Known failure patterns, historical bugs, unusual inputs | **Error Guessing** | Nulls, empty strings, Unicode, concurrent access, off-by-one |

   - If a function shows multiple signals, apply the dominant technique first, then supplement
   - If no clear signal, default to EP + BVA for inputs, Error Guessing for edge cases
   - Document the chosen technique in a comment above each test group:
     ```python
     # Technique: BVA — testing boundaries of page_size parameter (1, 100, 0, 101)
     ```

**DETECT FRAMEWORK:**
5. Determine the test framework from project configuration:
   - **Python**: Check for `pyproject.toml` (`[tool.pytest]`), `pytest.ini`, `setup.cfg` -> use **pytest**
   - **TypeScript**: Check `package.json` for `vitest` -> use **Vitest**; check for `jest` -> use **Jest**
   - **JavaScript**: Same as TypeScript
   - If no framework detected, ask the user which to use
6. Detect existing test conventions:
   - Fixture patterns (conftest.py, test helpers, factory functions)
   - Import patterns (absolute vs relative)
   - Naming patterns (test_*, describe/it, should)

**GENERATE:**
7. Determine the test file location following project conventions:
   - **Python**: `tests/` mirroring `src/` structure (e.g., `src/auth/token.py` -> `tests/auth/test_token.py`)
   - **TypeScript**: `tests/` mirroring `src/` or co-located `*.test.ts` files (match existing pattern)
   - Create intermediate directories if needed
8. For each public function, generate tests driven by the selected technique(s):
   - **Happy-path test**: Representative valid input from the primary equivalence class
   - **Technique-specific tests** (from step 4):
     - BVA: min, max, min-1, max+1 (at minimum 4 tests per bounded parameter)
     - EP: one test per valid partition, one per invalid partition
     - Decision Table: one test per rule row (condition combination)
     - State Transition: one test per valid transition, plus 1-2 invalid transitions
     - Error Guessing: targeted tests for known failure modes
   - **Test case ID**: Each test docstring starts with `TC-{feature}-{NNN}` and links to the AC it verifies:
     ```python
     def test_page_size_at_maximum():
         """TC-pagination-003: BVA max boundary for page_size.
         Verifies: pagination-AC-001
         GIVEN page_size is 100 (maximum allowed)
         WHEN the list endpoint is called
         THEN exactly 100 results are returned."""
     ```
9. Every test MUST follow the **Arrange-Act-Assert** pattern:
   ```python
   def test_function_does_something():
       # Arrange
       input_data = create_valid_input()

       # Act
       result = function_under_test(input_data)

       # Assert
       assert result == expected_outcome
   ```
10. Every test MUST follow **FIRST** principles:
   - **Fast**: No network calls, no file system dependencies (unless explicitly testing I/O)
   - **Isolated**: No test depends on another test's state
   - **Repeatable**: Same result every run, no randomness without seeding
   - **Self-validating**: Clear pass/fail, no manual inspection needed
   - **Timely**: Tests written before or alongside implementation
11. Add a comment header at the top of the generated test file:
    ```
    # Generated tests -- require human review before merge
    # Generator: /generate-tests
    # Source: {path to source file}
    # Date: {YYYY-MM-DD}
    ```
12. Do NOT hardcode expected values by reading implementation output. Base test expectations on:
    - Function docstrings and type signatures
    - Spec acceptance criteria (if referenced)
    - Logical invariants from the function name and contract
    - Use placeholder comments like `# TODO: verify expected value` when the correct output cannot be inferred from the spec

**FRAMEWORK IDIOMS:**
13. Use framework-specific idioms:
    - **pytest**: Use fixtures, parametrize for multiple cases, `pytest.raises` for exceptions
    - **Vitest/Jest**: Use `describe`/`it` blocks, `beforeEach`/`afterEach`, `expect().toThrow()`
    - Match the project's existing test style if tests already exist

**TIME OUT -- Generated Tests Review (DO-CONFIRM):**
- [ ] Every public function has technique-appropriate tests (BVA for boundaries, EP for categories, decision table for branching, state transition for workflows)
- [ ] No tests generated for private/unexported functions
- [ ] All tests follow Arrange-Act-Assert pattern
- [ ] Each test has a TC-{feature}-{NNN} ID in its docstring linking to the AC it verifies
- [ ] No hardcoded values derived from reading implementation output
- [ ] Test file location follows project conventions
- [ ] FIRST principles satisfied (no network, no shared state, deterministic)
- [ ] Comment header present with generation metadata

**SIGN OUT:**
14. Report what was generated:
    - Test file path
    - Number of tests generated per function
    - Functions skipped (private) with count
    - Branches that need manual test authoring (if any)
    - Command to run the generated tests (e.g., `pytest tests/auth/test_token.py -v`)
15. Run the SIGN OUT checklist from your agent file
