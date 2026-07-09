TOKEN_EFFICIENCY_MODE=ON

Project rules:

* Read only the minimum files needed.
* Do not scan the whole repository unless explicitly requested.
* Ignore `node_modules`, `dist`, `build`, `coverage`, `.git`, logs, and generated files.
* Do not create or update task_progress/progress/checklist/status files.
* Do not commit.
* Do not push.
* Do not rewrite unrelated code.
* Keep changes narrow and audit-first.
* Return diffs or changed-file summaries, not full files.
* Summarize logs over 100 lines.
* If tests fail, show only the relevant failing part.
* Keep responses short unless a full report is requested.

## File size and modularity rules

* Prefer small, focused files.
* For production source files, target under 350 lines when practical.
* Avoid creating or expanding production files beyond 500 lines.
* A production file above 550 lines is considered too large unless there is a clear reason.
* If a planned change would push a file near or above 500 lines, split the work into smaller modules before adding more logic.
* Do not make artificial splits that make the code harder to understand.
* Do not refactor unrelated large files just because they are large.
* When touching an already-large file, keep the change minimal or extract the touched logic into a focused component/helper/hook/service when safe.
* React pages should mostly orchestrate data and layout. Move large UI blocks into child components.
* Reusable frontend logic should go into hooks, helpers, or shared components.
* Backend controllers should stay thin. Move business logic into services.
* Backend services should be split by responsibility when they become too large.
* Tests can be longer than production files, but large test files should still be grouped clearly or split by behavior when practical.
* Generated files, build outputs, lockfiles, and fixture data are exempt.

Required agent behavior:

* Before editing, check line counts for files you expect to touch.
* After editing, report line counts for every changed production source file.
* If any changed production source file is above 500 lines, explain why it was not split.
* If any changed production source file is above 550 lines, include a split plan.
* If a requested change would push a production source file above 550 lines, stop before implementing and ask for approval with a split plan.
* Do not combine feature work and a large-file refactor unless the user explicitly approves it.

A split plan must include:

1. Current file name and current line count.
2. Why the file is large.
3. What responsibilities are mixed in the file.
4. Proposed new files, components, helpers, hooks, or services.
5. What logic moves into each new file.
6. What remains in the original file.
7. Behavior that must stay unchanged.
8. Risk level: low, medium, or high.
9. Suggested implementation phases.
10. Tests and checks required after the split.

Example split plan:

* Current file: `frontend/src/client/pages/ExamplePage.jsx` — 575 lines.
* Why large: it mixes data fetching, filters, modal state, and repeated card UI.
* Split: move repeated cards to `ExampleCard.jsx`, filter controls to `ExampleFilters.jsx`, and reusable state to `useExampleFilters.js`.
* Original file keeps route-level data loading and layout orchestration.
* Unchanged behavior: API calls, payloads, permissions, routes, and user-visible actions.
* Risk: medium.
* Phases: extract presentational components first, then extract hook if tests/build stay green.
* Checks: line counts, lint, build, and focused behavior tests or manual route smoke.

Output format:

* files reviewed
* files changed
* issue found
* fix made
* command results
* git status summary
* merge-ready true/false
OUTPUT_COMPRESSION_MODE=ON

During work:
- Do not stream progress updates.
- Do not narrate what you are doing.
- Do not list files while working.
- Do not show intermediate thoughts.
- Do not show command output unless it failed.
- Do not print full logs.
- Only show final report.

Final report must be short:
- files changed
- fix made
- tests
- merge-ready

If a command passes, write only:
- `passed`

If a command fails, show only:
- command
- error summary
- last 30 relevant lines

## Silent mode enforcement

When the prompt includes `Silent mode: final report only.`:

- Do not send intermediate messages.
- Do not narrate command usage.
- Do not say what you are checking.
- Do not describe planned edits while working.
- Do not stream progress.
- Do not output reasoning.
- Do not output command logs unless a command fails.
- Only send one final response.
- The final response must follow the requested final report format.
- If blocked, still send only the final report with the blocker.
## Prompt-specific format priority

If the user prompt provides a custom final report format, follow that format instead of the default short report.
If no custom format is provided, use the default short final report.