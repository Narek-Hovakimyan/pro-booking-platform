# Agent Rules

TOKEN_EFFICIENCY_MODE=ON
OUTPUT_COMPRESSION_MODE=ON

## Workflow

- Work audit-first and keep changes narrowly scoped.
- Read only files directly required for the task.
- Ignore `node_modules`, `dist`, `build`, `coverage`, `.git`, logs, and generated files.
- Do not modify unrelated code.
- Do not create progress, checklist, status, or task-tracking files.
- Do not commit or push.
- Do not expose reasoning or intermediate progress.
- When `Silent mode: final report only.` is present, return one final report only.

## Repository safety

Before editing:

- Run `git status --short --untracked-files=all`.
- Stop if unexpected files are present.
- Check line counts for production files expected to change.

After editing:

- Run focused tests.
- Run broader tests only when requested or required by risk.
- Run `git diff --check`.
- Report final git status.
- Report line counts for changed production files.

## File size

- Prefer production files under 350 lines.
- Avoid growing files beyond 500 lines.
- Do not add logic to files above 550 lines without an approved split plan.
- Keep controllers thin and move business logic to services.
- React pages should mainly orchestrate data and layout.
- Do not refactor unrelated large files.

## Tool and output efficiency

- Use targeted `rg`, `find`, and test commands.
- Do not scan the whole repository unless explicitly requested.
- Do not print successful command output.
- For failures, show only the error summary and last 30 relevant lines.
- Summarize logs longer than 100 lines.
- Do not return full files; report diffs or changed-file summaries.

## Final report

Target maximum: 350 tokens.

Exceed this only when essential blocker, failure, or security evidence requires
more detail.

Default format:

- files reviewed
- files changed
- issue/fix
- tests
- git status
- blockers
- merge-ready: true or false

A prompt-specific final format overrides this default.